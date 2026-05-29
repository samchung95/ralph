---
name: ralph-run
description: "Run and supervise an active Ralph planner-routed loop like a project manager. Use when the user asks Codex to start, watch, monitor, babysit, or check on `ralph run`; keep checking every 5 minutes by inspecting `prd.json`, `progress.txt`, git status, git diffs, recent commits, and run output until the loop completes, blocks, fails, or the user stops it."
---

# Ralph Run Monitor

Run a Ralph loop and supervise it as the project manager for the run. Keep the user informed, catch stalls early, and preserve enough evidence for the next decision.

## Before Starting

1. Confirm the working directory is the target repo.
2. Read `prd.json`, `progress.txt` if present, and `git status --short --branch`.
3. Run `ralph validate` when available. If `prd.json` is missing or invalid, stop and say the setup step must be fixed first.
4. Identify the requested command. If the user did not specify one, use the repo's normal Ralph command and tool choice from recent context; otherwise ask only for the missing command detail.
5. Tell the user the command, max cycles, tool, current branch, and first monitoring checkpoint.

## Start The Loop

- Prefer running the exact `ralph run ...` command the user requested.
- Capture output in the terminal or a log file so progress can be audited later.
- Do not run destructive cleanup, reset, or branch changes unless the user explicitly requested them.
- If the environment cannot keep a long-running command open while checking files, start Ralph as a background process that writes stdout/stderr to a timestamped log under `.ralph-monitor/`, then monitor that process and log.

## Five-Minute Checkpoint

Every 5 minutes, and immediately after visible phase transitions, inspect:

1. `prd.json`
   - `finalSuccessCriteria.passes`
   - `finalSuccessCriteria.notes`
   - `finalSuccessCriteria.acceptanceCriteriaBundles` statuses when present
   - `planning.cycle`
   - `planning.currentObjective`
   - `planning.activeHandoff.agent`
   - `planning.activeHandoff.status`
   - `planning.activeHandoff.objective`
2. `progress.txt`
   - Top status fields
   - Latest cycle notes
   - Blockers
   - Verification evidence
   - Agent handoff outcomes
3. Git state
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff --name-only`
   - Recent commits with `git log --oneline -5`
4. Run/process output
   - Current phase
   - Errors, prompts, approval waits, command failures, or repeated idle output
   - Last output timestamp when available

## Project Manager Status Update

Send a concise update after each checkpoint:

```text
Ralph status: [running | complete | blocked | failed | possibly stuck]
Current phase: [planner/developer/uxui/documentation/web browser agent, cycle N]
Evidence: [prd/progress/git/log facts]
Changes since last check: [commits, diff files, status changes, or none]
Risk/blocker: [none or concrete issue]
Next check: [time or immediate action]
```

Keep updates factual. Do not claim the run is complete unless `prd.json` and Ralph output support it.

## Stuck Or Blocked Handling

Treat the run as possibly stuck when two consecutive checkpoints show no meaningful change in `prd.json`, `progress.txt`, git diffs, commits, or output while the process is still alive.

When that happens:

1. Re-check the process, latest output, and active handoff before acting.
2. Identify the likely wait: approval prompt, AI tool hang, invalid PRD, failing command, uncommitted changes, or blocked handoff.
3. Report the evidence and the safest next action.
4. Do not kill or restart the loop unless the user approved it, except for a clearly dead child process that cannot produce further output.

If Ralph reports blocked, preserve the blocker from `progress.txt` and `planning.activeHandoff`, then ask whether to fix the blocker or stop.

## Completion Handling

When Ralph appears complete:

1. Confirm `finalSuccessCriteria.passes` is `true`.
2. Confirm every `finalSuccessCriteria.acceptanceCriteriaBundles` entry is `passed` or `deferred` when bundles are present.
3. Read `finalSuccessCriteria.notes` and the latest `progress.txt` entry.
4. Inspect `git status --short --branch`, `git diff --stat`, and recent commits.
5. Run `ralph validate` if available.
6. Summarize the completed criteria, deferred bundles, verification evidence, commits/diffs, and any remaining uncommitted changes.

Stop monitoring once the loop completes, fails, blocks with no authorized next action, reaches max cycles, or the user asks you to stop.
