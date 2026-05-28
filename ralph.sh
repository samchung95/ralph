#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool amp|claude|copilot|codex] [max_cycles]

set -e

# Parse arguments
TOOL="amp"  # Default to amp for backwards compatibility
MAX_CYCLES=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      # Assume it's max_cycles if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_CYCLES="$1"
      fi
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" && "$TOOL" != "copilot" && "$TOOL" != "codex" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be one of: amp, claude, copilot, codex."
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
PLANNER_PROMPT="$SCRIPT_DIR/PLANNER.md"
DEVELOPER_PROMPT="$SCRIPT_DIR/DEVELOPER.md"
UXUI_PROMPT="$SCRIPT_DIR/UXUI.md"
DOCUMENTATION_PROMPT="$SCRIPT_DIR/DOCUMENTATION.md"
WEB_BROWSER_SAFE_PROMPT="$SCRIPT_DIR/WEB_BROWSER_SAFE.md"
WEB_BROWSER_BYPASS_PROMPT="$SCRIPT_DIR/WEB_BROWSER_BYPASS.md"
PROGRESS_INSTRUCT_PROMPT="$SCRIPT_DIR/PROGRESS_INSTRUCT.md"

for prompt in "$PLANNER_PROMPT" "$DEVELOPER_PROMPT" "$UXUI_PROMPT" "$DOCUMENTATION_PROMPT" "$WEB_BROWSER_SAFE_PROMPT" "$WEB_BROWSER_BYPASS_PROMPT" "$PROGRESS_INSTRUCT_PROMPT"; do
  if [ ! -f "$prompt" ]; then
    echo "Error: $(basename "$prompt") not found in $SCRIPT_DIR"
    exit 1
  fi
done

if [ ! -f "$PRD_FILE" ]; then
  echo "Error: prd.json not found in $SCRIPT_DIR"
  echo "Create a prd.json with finalSuccessCriteria and the first PRD slice."
  exit 1
fi

if [ -f "$PRD_FILE" ] && ! jq -e '.finalSuccessCriteria' "$PRD_FILE" >/dev/null 2>&1; then
  echo "Warning: prd.json has no finalSuccessCriteria. The planner phase should migrate it before the loop can complete."
fi

runtime_prompt_file() {
  if [[ "$TOOL" == "amp" ]]; then
    echo "$SCRIPT_DIR/prompt.md"
  elif [[ "$TOOL" == "claude" ]]; then
    echo "$SCRIPT_DIR/CLAUDE.md"
  else
    echo "$SCRIPT_DIR/AGENTS.md"
  fi
}

initial_progress_text() {
  local goal
  local branch
  local cycle
  local objective

  goal=$(jq -r '.finalSuccessCriteria.description // "[one-line final success goal]"' "$PRD_FILE" 2>/dev/null || echo "[one-line final success goal]")
  branch=$(jq -r '.branchName // "[branch]"' "$PRD_FILE" 2>/dev/null || echo "[branch]")
  cycle=$(jq -r '.planning.cycle // 1' "$PRD_FILE" 2>/dev/null || echo "1")
  objective=$(jq -r '.planning.currentObjective // "[planner selects first handoff]"' "$PRD_FILE" 2>/dev/null || echo "[planner selects first handoff]")

  cat <<EOF
# Ralph Progress

Goal: $goal
Branch: $branch
Cycle: $cycle
Status: planning
Current agent: planner
Current objective: $objective

Next:
- Planner selects the next focused handoff.

Blockers:
- none

Important patterns:
- none yet
---

Started: $(date)
EOF
}

archive_label_from_branch() {
  local branch="$1"
  local label="$branch"
  label=$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
  if [ -z "$label" ]; then
    label="run"
  fi
  printf '%s\n' "$label"
}

next_archive_dir() {
  local label="$1"
  local timestamp
  local base_name
  local candidate
  local suffix=1

  timestamp=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
  base_name="${timestamp}-${label}"
  candidate="$ARCHIVE_DIR/$base_name"

  while [ -e "$candidate" ]; do
    candidate="$ARCHIVE_DIR/${base_name}-$(printf '%02d' "$suffix")"
    suffix=$((suffix + 1))
  done

  printf '%s\n' "$candidate"
}

archive_run_files() {
  local label="$1"
  local archive_dir

  archive_dir=$(next_archive_dir "$label")
  mkdir -p "$archive_dir"
  [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$archive_dir/"
  [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$archive_dir/"
  printf '%s\n' "$archive_dir"
}

prompt_file_for_role() {
  local role="$1"
  case "$role" in
    planner) echo "$PLANNER_PROMPT" ;;
    developer) echo "$DEVELOPER_PROMPT" ;;
    uxui) echo "$UXUI_PROMPT" ;;
    documentation) echo "$DOCUMENTATION_PROMPT" ;;
    WEB_BROWSER_SAFE) echo "$WEB_BROWSER_SAFE_PROMPT" ;;
    WEB_BROWSER_BYPASS) echo "$WEB_BROWSER_BYPASS_PROMPT" ;;
    *)
      echo "Error: Unknown Ralph role '$role'" >&2
      return 1
      ;;
  esac
}

run_role() {
  local role="$1"
  local source_prompt
  local runtime_prompt

  source_prompt="$(prompt_file_for_role "$role")"

  runtime_prompt="$(runtime_prompt_file)"
  {
    cat "$source_prompt"
    printf '\n\n---\n\n'
    cat "$PROGRESS_INSTRUCT_PROMPT"
  } > "$runtime_prompt"
  echo "Loaded $(basename "$source_prompt") + $(basename "$PROGRESS_INSTRUCT_PROMPT") into $(basename "$runtime_prompt")" >&2

  if [[ "$TOOL" == "amp" ]]; then
    amp --dangerously-allow-all < "$runtime_prompt" 2>&1 | tee /dev/stderr
  elif [[ "$TOOL" == "claude" ]]; then
    claude --dangerously-skip-permissions --print < "$runtime_prompt" 2>&1 | tee /dev/stderr
  elif [[ "$TOOL" == "copilot" ]]; then
    copilot --allow-all --autopilot --no-ask-user < "$runtime_prompt" 2>&1 | tee /dev/stderr
  else
    codex exec --full-auto - < "$runtime_prompt" 2>&1 | tee /dev/stderr
  fi
}

has_completion_signal_line() {
  printf '%s\n' "$1" | tr -d '\r' | grep -Fxq "<promise>COMPLETE</promise>"
}

planner_completed() {
  local output="$1"

  if jq -e '.finalSuccessCriteria.passes == true' "$PRD_FILE" >/dev/null 2>&1; then
    if ! has_completion_signal_line "$output"; then
      echo "prd.json has finalSuccessCriteria.passes=true after the planner phase; completing even though the exact completion signal was not emitted."
    fi
    return 0
  fi

  if has_completion_signal_line "$output"; then
    echo "Warning: Planner emitted the completion signal, but prd.json still has finalSuccessCriteria.passes != true. Ignoring completion."
  fi
  return 1
}

final_success_criteria_passes() {
  jq -e '.finalSuccessCriteria.passes == true' "$PRD_FILE" >/dev/null 2>&1
}

active_handoff_agent() {
  jq -r '.planning.activeHandoff.agent // empty' "$PRD_FILE" 2>/dev/null
}

validate_selected_agent() {
  local agent="$1"
  local status

  status=$(jq -r '.planning.activeHandoff.status // empty' "$PRD_FILE" 2>/dev/null)

  if [[ "$agent" == "developer" || "$agent" == "uxui" || "$agent" == "documentation" || "$agent" == "WEB_BROWSER_SAFE" || "$agent" == "WEB_BROWSER_BYPASS" ]]; then
    if [[ "$status" != "ready" && "$status" != "active" ]]; then
      echo "Error: planning.activeHandoff.status must be ready or active before an agent can run; got '${status:-missing}'."
      exit 1
    fi
    return 0
  fi

  echo "Error: Planner did not set planning.activeHandoff.agent to one of: developer, uxui, documentation, WEB_BROWSER_SAFE, WEB_BROWSER_BYPASS."
  exit 1
}

validate_prd_json() {
  local context="$1"

  if jq -e '
    type == "object" and
    (.project | type == "string") and
    (.branchName | type == "string") and
    (.description | type == "string") and
    (.finalSuccessCriteria | type == "object") and
    (.finalSuccessCriteria.description | type == "string") and
    (.finalSuccessCriteria.acceptanceCriteria | type == "array" and all(.[]; type == "string")) and
    (.finalSuccessCriteria.passes | type == "boolean") and
    (.finalSuccessCriteria.notes | type == "string") and
    (.planning | type == "object") and
    (.planning.cycle | type == "number" and . >= 1 and floor == .) and
    (.planning.currentObjective | type == "string") and
    (
      (.planning.activeHandoff == null) or
      (
        (.planning.activeHandoff | type == "object") and
        (.planning.activeHandoff.agent as $agent | ["developer", "uxui", "documentation", "WEB_BROWSER_SAFE", "WEB_BROWSER_BYPASS"] | index($agent) != null) and
        (.planning.activeHandoff.objective | type == "string") and
        (.planning.activeHandoff.scope | type == "object") and
        (.planning.activeHandoff.scope.include | type == "array" and all(.[]; type == "string")) and
        (.planning.activeHandoff.scope.exclude | type == "array" and all(.[]; type == "string")) and
        (.planning.activeHandoff.rules | type == "array" and all(.[]; type == "string")) and
        (.planning.activeHandoff.comments | type == "string") and
        (.planning.activeHandoff.successCriteria | type == "array" and all(.[]; type == "string")) and
        (.planning.activeHandoff.status as $status | ["ready", "active", "complete", "blocked"] | index($status) != null)
      )
    ) and
    (.prdChain | type == "array" and length >= 1) and
    (.userStories | type == "array") and
    (all(.prdChain[];
      type == "object" and
      (.cycle | type == "number" and . >= 1 and floor == .) and
      (.objective | type == "string") and
      (.status | type == "string") and
      (.storyIds | type == "array" and all(.[]; type == "string")) and
      (.notes | type == "string")
    )) and
    (all(.userStories[];
      type == "object" and
      (.id | type == "string") and
      (.title | type == "string") and
      (.description | type == "string") and
      (.acceptanceCriteria | type == "array" and all(.[]; type == "string")) and
      (.priority | type == "number" and . > 0) and
      (.storyPriority as $priority | ["high", "medium", "low"] | index($priority) != null) and
      (.passes | type == "boolean") and
      (.notes | type == "string")
    )) and
    (([.prdChain[] | select(.status == "active")] | length) <= 1) and
    (([.prdChain[] | select(.status == "active")] | length) == 0 or ([.prdChain[] | select(.status == "active")][0].cycle == .planning.cycle))
  ' "$PRD_FILE" >/dev/null 2>&1; then
    return 0
  fi

  echo "Error: prd.json failed validation after $context."
  exit 1
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    # Archive the previous run
    ARCHIVE_FOLDER=$(archive_run_files "$(archive_label_from_branch "$LAST_BRANCH")")
    
    echo "Archiving previous run: $LAST_BRANCH"
    echo "   Archived to: $ARCHIVE_FOLDER"
    
    # Reset progress file for new run
    initial_progress_text > "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  initial_progress_text > "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max cycles: $MAX_CYCLES"

validate_prd_json "run startup"
if final_success_criteria_passes; then
  echo ""
  echo "Ralph final success criteria already pass!"
  echo "No develop/plan cycles needed."
  exit 0
fi

for i in $(seq 1 $MAX_CYCLES); do
  validate_prd_json "cycle $i start"

  echo ""
  echo "==============================================================="
  echo "  Ralph Cycle $i of $MAX_CYCLES ($TOOL planner)"
  echo "==============================================================="

  OUTPUT=$(run_role planner) || true

  validate_prd_json "planner phase $i"

  if planner_completed "$OUTPUT"; then
    echo ""
    echo "Ralph completed the final success criteria!"
    echo "Completed during planner phase of cycle $i of $MAX_CYCLES"
    exit 0
  fi

  SELECTED_AGENT=$(active_handoff_agent)
  validate_selected_agent "$SELECTED_AGENT"

  echo "Planner selected $SELECTED_AGENT. Running assigned handoff..."

  echo ""
  echo "==============================================================="
  echo "  Ralph Cycle $i of $MAX_CYCLES ($TOOL $SELECTED_AGENT)"
  echo "==============================================================="

  OUTPUT=$(run_role "$SELECTED_AGENT") || true

  if has_completion_signal_line "$OUTPUT"; then
    echo "Warning: $SELECTED_AGENT emitted the completion signal. Ignoring it; only the planner can complete Ralph."
  fi

  validate_prd_json "$SELECTED_AGENT phase $i"

  echo "$SELECTED_AGENT phase $i complete. Returning to planner..."
  sleep 2
done

echo ""
echo "Ralph reached max cycles ($MAX_CYCLES) without meeting the final success criteria."
echo "Check $PROGRESS_FILE for status."
exit 1
