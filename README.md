# Ralph

![Ralph](ralph.webp)

Ralph is an autonomous AI agent loop that runs AI coding tools ([Amp](https://ampcode.com), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli), or [ChatGPT Codex](https://developers.openai.com/codex/cli)) in a planner-routed loop until a global final success criteria is met. Each planner pass chooses the next focused agent handoff (`developer`, `uxui`, `documentation`, `WEB_BROWSER_SAFE`, or `WEB_BROWSER_BYPASS`). Each phase is a fresh instance with clean context. Memory persists via git history, `progress.txt`, and the evolving `prd.json`.

Based on [Geoffrey Huntley's Ralph pattern](https://ghuntley.com/ralph/).

[Read my in-depth article on how I use Ralph](https://x.com/ryancarson/status/2008548371712135632)

## Prerequisites

- One of the following AI coding tools installed and authenticated:
  - [Amp CLI](https://ampcode.com) (default)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`)
  - [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli) (`npm install -g @github/copilot`)
  - [ChatGPT Codex CLI](https://developers.openai.com/codex/cli) (`npm i -g @openai/codex`)
- `jq` installed (`brew install jq` on macOS)
- A git repository for your project

## Install

### Recommended: Node CLI

Install Ralph globally from npm:

```bash
npm install -g @samuelchung/ralph-cli
ralph --version
```

This installs the `ralph` command. Ralph requires Node.js 18 or newer plus one supported AI coding tool installed separately.

Initialize Ralph in your project:

```bash
cd your-project
ralph init
```

This creates `progress.txt` and a template `prd.json` copied from Ralph's bundled `prd.json.example`, so agents can see the exact expected PRD structure before replacing the example values. Ralph keeps role prompts (`PLANNER.md`, `DEVELOPER.md`, `UXUI.md`, `DOCUMENTATION.md`, `WEB_BROWSER_SAFE.md`, `WEB_BROWSER_BYPASS.md`, `DOCTOR.md`) and `PROGRESS_INSTRUCT.md` bundled in the installed package instead of copying them into your project root.

Install the `/ralph` setup skill into your AI tool:

```bash
# Claude Code (default)
ralph install

# Amp
ralph install --tool amp

# GitHub Copilot CLI
ralph install --tool copilot

# ChatGPT Codex
ralph install --tool codex
```

`ralph install` replaces any existing `/ralph` skill folder for the selected tool before installing the bundled copy.

Codex can optionally run with full access. This setting is remembered:

```bash
ralph bypass status
ralph bypass on
ralph bypass off
```

When bypass is on, `ralph run --tool codex` uses Codex's `--dangerously-bypass-approvals-and-sandbox` mode. Leave bypass off for sandboxed `--full-auto` runs.

Copilot can optionally auto-approve prompts that still appear despite `--allow-all`:

```bash
ralph auto-approve status
ralph auto-approve on
ralph auto-approve off
```

When Copilot auto-approve is on, Ralph watches Copilot output for approval prompts and answers them automatically.

### Manual Script Mode

You can also copy the shell runner into a project:

```bash
# From your project root
mkdir -p scripts/ralph
cp /path/to/ralph/ralph.sh scripts/ralph/
cp /path/to/ralph/cli/templates/PLANNER.md scripts/ralph/PLANNER.md
cp /path/to/ralph/cli/templates/DEVELOPER.md scripts/ralph/DEVELOPER.md
cp /path/to/ralph/cli/templates/UXUI.md scripts/ralph/UXUI.md
cp /path/to/ralph/cli/templates/DOCUMENTATION.md scripts/ralph/DOCUMENTATION.md
cp /path/to/ralph/cli/templates/WEB_BROWSER_SAFE.md scripts/ralph/WEB_BROWSER_SAFE.md
cp /path/to/ralph/cli/templates/WEB_BROWSER_BYPASS.md scripts/ralph/WEB_BROWSER_BYPASS.md
cp /path/to/ralph/cli/templates/PROGRESS_INSTRUCT.md scripts/ralph/PROGRESS_INSTRUCT.md
cp /path/to/ralph/cli/templates/prd.json.example scripts/ralph/prd.json.example

chmod +x scripts/ralph/ralph.sh
```

### Manual Skill Install

If you are not using `ralph install`, copy the setup skill manually:

For Amp:
```bash
cp -r skills/ralph ~/.config/amp/skills/
```

For Claude Code:
```bash
cp -r skills/ralph ~/.claude/skills/
```

For GitHub Copilot CLI:
```bash
cp -r skills/ralph ~/.copilot/skills/
```

For ChatGPT Codex:
```bash
cp -r skills/ralph ~/.agents/skills/
```

### Claude Code Marketplace

Add the Ralph marketplace to Claude Code:

```bash
/plugin marketplace add snarktank/ralph
```

Then install the skill:

```bash
/plugin install ralph-skills@ralph-marketplace
```

The skill is automatically invoked when you ask Claude to:
- "set up ralph", "start ralph", "plan this with ralph"
- "create prd.json", "prepare the initial ralph step"

### Configure Amp auto-handoff (recommended)

Add to `~/.config/amp/settings.json`:

```json
{
  "amp.experimental.autoHandoff": { "context": 90 }
}
```

This enables automatic handoff when context fills up, allowing Ralph to handle large assignments that exceed a single context window.

## Workflow

### 1. Set Up the First Ralph Step

Use the Ralph skill to replace the generated template values in the initial evolving `prd.json`:

```
Load the ralph skill and update prd.json for [your feature description]
```

Answer any clarifying questions. The skill expands your rough prompt into `finalSuccessCriteria`, planner context, repo-style `branchName`, future PR title metadata in `planning.naming`, and a compact `progress.txt`. If you provide an explicit branch name or pull request title, the skill records that value; otherwise it infers names from the repo style and current task. Ralph starts with the planner, which writes `planning.activeHandoff` and chooses the first agent.

### 2. Run Ralph

With the Node CLI:

```bash
# Claude Code, 10 cycles by default
ralph run

# Claude Code, 20 cycles
ralph run 20

# Amp
ralph run --tool amp

# GitHub Copilot CLI
ralph run --tool copilot

# GitHub Copilot CLI with auto-approval for this run only
ralph run --tool copilot --auto-approve

# ChatGPT Codex
ralph run --tool codex

# ChatGPT Codex with full access for this run only
ralph run --tool codex --bypass

# Fully autonomous Claude Code mode
ralph run --dangerously-skip-permissions 15

# Optional helpers
ralph validate
ralph reset
ralph fix
```

With the copied shell script:

```bash
# Using Amp (default)
./scripts/ralph/ralph.sh [max_cycles]

# Using Claude Code
./scripts/ralph/ralph.sh --tool claude [max_cycles]

# Using GitHub Copilot CLI
./scripts/ralph/ralph.sh --tool copilot [max_cycles]

# Using ChatGPT Codex
./scripts/ralph/ralph.sh --tool codex [max_cycles]
```

Default is 10 cycles. Use `--tool amp`, `--tool claude`, `--tool copilot`, or `--tool codex` to select your AI coding tool.

Ralph will:
1. Create or check out the repo-style feature branch from PRD `branchName`
2. Run a planner phase from `PLANNER.md`
3. Let the planner check `finalSuccessCriteria`
4. If success criteria pass, output `<promise>COMPLETE</promise>`
5. Otherwise, write `planning.activeHandoff` with the selected agent, objective, scope, rules, comments, and handoff success criteria
6. Run the selected role prompt (`DEVELOPER.md`, `UXUI.md`, `DOCUMENTATION.md`, `WEB_BROWSER_SAFE.md`, or `WEB_BROWSER_BYPASS.md`) merged with `PROGRESS_INSTRUCT.md`
7. Let the selected agent complete or block the handoff and update `progress.txt`
8. Return to the planner and repeat

Ralph validates the `prd.json` structure before the run starts, at the start of every cycle, and after every planner or selected-agent phase. If an agent leaves the PRD in an invalid state, the run stops immediately instead of continuing with a broken planning chain.

Use these helper commands with the Node CLI:

```bash
ralph validate   # Validate prd.json structure and cycle consistency
ralph reset      # Archive current prd/progress and restore a fresh prd.json before authoring the next PRD
```

To update your global `ralph` command after changing this checkout, run:

```bash
cd /path/to/ralph-cli/cli
npm install
npm run build
npm install -g .
```

To preview the npm package before publishing:

```bash
cd /path/to/ralph-cli/cli
npm run typecheck
npm run build
npm run test:init
npm run pack:dry-run
```

### Release and Staging Branches

The npm release workflow lives at `.github/workflows/npm-release.yml` and runs for release tag pushes plus staging branch pushes:

- `vX.Y.Z` tags - `X.Y.Z` must match `cli/package.json`. The workflow installs from `cli/package-lock.json`, runs `npm run typecheck`, `npm run build`, `npm test`, and `npm run pack:dry-run`, then publishes `@samuelchung/ralph-cli` with `npm publish --access public`.
- `staging/vX.Y.Z-*` - the branch version prefix must match `cli/package.json`. The workflow runs the same validation and packaging checks, but does not publish to npm.

Configure npm trusted publishing for GitHub Actions with owner `samchung95`, repository `ralph-cli`, workflow filename `npm-release.yml`, and no environment name unless the workflow is updated to use one. The workflow uses OIDC, so it does not require an `NPM_TOKEN` secret.

To test a staging branch through npm's GitHub install path:

```bash
npm install github:samchung95/ralph-cli#staging/vX.Y.Z-rc.1
```

GitHub dependency installs use the repository root `package.json` wrapper. Its `prepare` script installs and builds the `cli` package so the installed command points at `cli/dist/index.js`.

## Key Files

| File | Purpose |
|------|---------|
| `ralph.sh` | The bash loop that spawns fresh AI instances (supports `--tool amp`, `--tool claude`, `--tool copilot`, or `--tool codex`) |
| `PLANNER.md` | Source prompt for evaluation, final success checks, and next-agent routing |
| `DEVELOPER.md` | Source prompt for implementation handoffs |
| `UXUI.md` | Source prompt for UX/UI handoffs |
| `DOCUMENTATION.md` | Source prompt for documentation handoffs |
| `WEB_BROWSER_SAFE.md` | Source prompt for read-only public web browsing handoffs |
| `WEB_BROWSER_BYPASS.md` | Source prompt for authorized sign-in and form-submission browsing handoffs |
| `PROGRESS_INSTRUCT.md` | Shared progress-writing instructions merged into every planner/agent prompt |
| `prompt.md` | Runtime prompt file generated for Amp |
| `CLAUDE.md` | Runtime prompt file generated for Claude Code |
| `AGENTS.md` | Runtime prompt file generated for GitHub Copilot CLI and ChatGPT Codex |
| `prd.json` | Evolving PRD chain with `finalSuccessCriteria`, active handoff, branch/PR naming, and planning metadata |
| `prd.json.example` | Example evolving PRD format for reference |
| `progress.txt` | Compact shared memory plus meaningful per-cycle notes for fresh agents |
| `skills/ralph/` | Skill for setting up the initial evolving PRD chain (works with Amp, Claude Code, GitHub Copilot CLI, and ChatGPT Codex) |
| `.claude-plugin/` | Plugin manifest for Claude Code marketplace discovery |
| `flowchart/` | Interactive visualization of how Ralph works |

## Flowchart

[![Ralph Flowchart](ralph-flowchart.png)](https://samchung95.github.io/ralph-cli/)

**[View Interactive Flowchart](https://samchung95.github.io/ralph-cli/)** - Click through to see each step with animations.

The `flowchart/` directory contains the source code. To run locally:

```bash
cd flowchart
npm install
npm run dev
```

## Critical Concepts

### Each Phase = Fresh Context

Each planner or selected-agent phase spawns a **new AI instance** (Amp, Claude Code, GitHub Copilot CLI, or ChatGPT Codex) with clean context. The only memory between phases is:
- Git history (commits from previous phases)
- `progress.txt` (learnings and context)
- `prd.json` (active handoff, PRD chain, and final success criteria)

When `ralph run` starts, Ralph adds a generated `run.id` to `prd.json` if one is missing. Every planner or selected-agent invocation then writes centralized artifacts to `~/.ralph-cli/runs/<run.id>/attempts/<attempt-id>/`, including `metadata.json`, `prompt.md`, `stdout.log`, and `stderr.log`. Codex attempts also use `--output-last-message` to save the final response as `<attempt-id>-codex-last-message.txt`; Ralph can use that file plus valid `prd.json` phase state to finish a phase when the Codex wrapper process does not close cleanly.

### Evolving PRDs

Ralph no longer needs a fully preplanned backlog. The first `prd.json` contains a global `finalSuccessCriteria` and planner context expanded from the user's prompt. Each planner pass checks the work so far. If the final criteria are not met, it writes the next focused `planning.activeHandoff` and records the chain in `prdChain`.

### Small Handoffs

Each handoff should be small enough to complete in one context window. If a task is too big, the LLM runs out of context before finishing and produces poor code.

Right-sized handoffs:
- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

Too big (split these):
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

### Agent Instruction Updates Are Critical

After each selected-agent phase, Ralph can update relevant agent instruction files with genuinely reusable learnings. This is key because AI coding tools automatically read these files, so future phases and future human developers benefit from discovered patterns, gotchas, and conventions.

Examples of what to add to agent instruction files:
- Patterns discovered ("this codebase uses X for Y")
- Gotchas ("do not forget to update Z when changing W")
- Useful context ("the settings panel is in component X")

### Feedback Loops

Ralph only works if there are feedback loops:
- Typecheck catches type errors
- Tests verify behavior
- CI must stay green (broken code compounds across iterations)

### Browser Verification for UI Handoffs

Frontend handoffs must include browser verification in `planning.activeHandoff.successCriteria`. Ralph will use available browser tooling to navigate to the page, interact with the UI, and confirm changes work.

### Stop Condition

When the planner verifies `finalSuccessCriteria.passes: true`, it outputs `<promise>COMPLETE</promise>` and the loop exits.

## Debugging

Check current state:

```bash
# See the active planner handoff
cat prd.json | jq '.planning.activeHandoff'

# See global completion status
cat prd.json | jq '.finalSuccessCriteria'

# See learnings from previous iterations
cat progress.txt

# Check git history
git log --oneline -10
```

## Customizing the Prompt

If you're using the copied shell script with project-local role prompts, customize them for your project:
- Add project-specific quality check commands
- Include codebase conventions
- Add common gotchas for your stack

## Archiving

Ralph automatically archives previous runs when you start a new feature (different `branchName`). Archives are saved to `archive/<timestamp>-branch-slug/`.

## References

- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/)
- [Amp documentation](https://ampcode.com/manual)
- [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub Copilot CLI documentation](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)
- [ChatGPT Codex CLI documentation](https://developers.openai.com/codex/cli)
