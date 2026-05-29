# ralph-cli

CLI tool for [Ralph](https://github.com/snarktank/ralph) — an autonomous planner-routed AI agent loop that runs AI coding tools (Claude Code, Amp, GitHub Copilot CLI, or ChatGPT Codex) until final success criteria are met.

## Install

```bash
npm install -g @samuelchung/ralph-cli
ralph --version
```

This installs the `ralph` command globally. Ralph needs Node.js 18 or newer and one supported AI coding tool installed separately: Claude Code, Amp, GitHub Copilot CLI, or ChatGPT Codex.

## Quick Start

```bash
# 1. Initialize Ralph in your project
cd your-project
ralph init

# 2. Install the /ralph setup skill for your AI tool
ralph install              # Claude Code
ralph install --tool amp
ralph install --tool copilot
ralph install --tool codex

# Optional: remember full-access mode for Codex
ralph bypass on

# Optional: remember auto-approval for Copilot prompts
ralph auto-approve on

# 3. Replace the generated prd.json template values
# "Use the /ralph skill to update prd.json for [feature]"

# 4. Run the planner-routed agent loop
ralph run                  # Claude Code, 10 cycles
ralph run 20               # Claude Code, 20 cycles
ralph run --tool amp
ralph run --tool copilot
ralph run --tool copilot --auto-approve
ralph run --tool codex
ralph run --tool codex --bypass

# Optional helpers
ralph validate             # Check prd.json structure
ralph reset                # Archive current run and restore fresh prd.json
ralph fix                  # Clean stale Ralph artifacts and repair prd.json when needed
```

## Commands

### `ralph init`

Creates `progress.txt` and a template `prd.json` in your project root. The PRD is copied from Ralph's bundled `prd.json.example` so agents can see the exact expected structure before replacing the example values with your feature's real final success criteria, acceptance criteria bundles when there are more than five final criteria, repo-style `branchName`, future pull request title metadata, and planner context. If you give the setup skill an explicit branch name or pull request title, it records that value; otherwise it infers names from the repo style and current task.

Role prompt files (`PLANNER.md`, `DEVELOPER.md`, `UXUI.md`, `DOCUMENTATION.md`, `WEB_BROWSER_SAFE.md`, `WEB_BROWSER_BYPASS.md`, `DOCTOR.md`) and `PROGRESS_INSTRUCT.md` stay bundled in the Ralph package, so they no longer need to live in your project root.

```bash
cd your-project
ralph init
```

Options:
- `-d, --dir <path>` — Target directory (default: cwd)
- `--force` — Overwrite existing files

### `ralph install`

Installs the bundled Ralph skills into your AI tool's skills directory so they're available globally. If a bundled skill is already installed for the selected tool, Ralph removes the old skill folder first so stale files do not linger.

```bash
ralph install              # Claude Code (default)
ralph install --tool amp
ralph install --tool codex
ralph install --tool copilot
```

After installing, you can use this skill in the selected AI tool:
- `/ralph` — Expand the request and replace the template `prd.json` values with planner-routed feature context
- `/ralph-run` — Start or monitor `ralph run` like a project manager, checking `prd.json`, `progress.txt`, git diffs, recent commits, and run output every 5 minutes

### `ralph bypass [on|off|status]`

Shows or changes the remembered bypass mode.

```bash
ralph bypass status
ralph bypass on
ralph bypass off
```

When bypass is on, Codex runs use `--dangerously-bypass-approvals-and-sandbox` for full access. When bypass is off, Codex uses sandboxed `--full-auto`.

### `ralph auto-approve [on|off|status]`

Shows or changes remembered auto-approval for Copilot prompts.

```bash
ralph auto-approve status
ralph auto-approve on
ralph auto-approve off
```

Copilot already runs with `--allow-all`, `--autopilot`, and `--no-ask-user`. If Copilot still shows an approval prompt, auto-approve watches its output and answers automatically.

### `ralph run [cycles]`

Runs the Ralph autonomous agent loop. Each cycle runs the planner first from `PLANNER.md`; the planner writes `planning.activeHandoff`, then Ralph runs the selected role prompt (`DEVELOPER.md`, `UXUI.md`, `DOCUMENTATION.md`, `WEB_BROWSER_SAFE.md`, or `WEB_BROWSER_BYPASS.md`) merged with `PROGRESS_INSTRUCT.md`. Ralph writes the merged prompt into the selected tool's runtime prompt file before spawning the tool.

```bash
ralph run                         # Claude Code, 10 cycles
ralph run 20                      # Claude Code, 20 cycles
ralph run --tool amp              # Amp
ralph run --tool copilot          # GitHub Copilot CLI
ralph run --tool copilot --auto-approve
ralph run --tool copilot --no-auto-approve
ralph run --tool codex            # ChatGPT Codex
ralph run --tool codex --bypass   # Codex full access for this run
ralph run --tool codex --no-bypass
ralph run --dangerously-skip-permissions 15
```

Options:
- `--tool <tool>` — AI tool to use: `claude`, `amp`, `copilot`, or `codex` (default: `claude`)
- `--dangerously-skip-permissions` — Pass `--dangerously-skip-permissions` to Claude Code
- `--bypass` / `--no-bypass` — Override the remembered bypass setting for this run
- `--auto-approve` / `--no-auto-approve` — Override remembered Copilot auto-approval for this run
- `-d, --dir <path>` — Project directory containing `prd.json` (default: cwd)

## What Happens During `ralph run`

1. Validates the AI tool is installed and required files exist (`prd.json`)
2. Validates `prd.json` before the first cycle starts
3. Archives previous run if the branch in `prd.json` changed
4. Initializes `progress.txt` if it doesn't exist
5. For each cycle:
   - Validates `prd.json` before the planner phase starts
   - Ensures `prd.json` has a generated `run.id` and creates a centralized attempt artifact folder under `~/.ralph-cli/runs/<run.id>/attempts/<attempt-id>/`
   - Loads `PLANNER.md` plus `PROGRESS_INSTRUCT.md` and runs a planner agent
   - Validates `prd.json` after the planner phase
   - Stops if the planner marks `finalSuccessCriteria.passes: true` or emits `<promise>COMPLETE</promise>` with passing criteria
   - Reads `planning.activeHandoff.agent`
   - Loads the selected role prompt plus `PROGRESS_INSTRUCT.md` and runs that agent
   - Validates `prd.json` after the selected agent phase
6. If max cycles are reached without completion, exits with error

If an agent leaves the PRD in an invalid shape at any checkpoint, the run stops immediately instead of continuing with a broken plan state.

When `finalSuccessCriteria.acceptanceCriteria` has more than five items, Ralph requires `finalSuccessCriteria.acceptanceCriteriaBundles`. The run can finish only when every bundle is `passed` or `deferred`; `passed` requires at least one referenced user story and every referenced story must have `passes: true`.

Each role invocation records `metadata.json`, `prompt.md`, `stdout.log`, and `stderr.log` in its attempt folder. Codex runs also receive `--output-last-message <attempt-id>-codex-last-message.txt`, so the final Codex response is captured in a collision-resistant central path even when multiple runs use the same project directory. If that final-message file exists and `prd.json` shows the role reached its expected durable state, Ralph can finish the phase even if the Codex wrapper process does not close cleanly.

### `ralph validate`

Validates the structure and Ralph-specific consistency of `prd.json`, including required sections, field types, and active cycle alignment.

```bash
ralph validate
ralph validate --silent
ralph validate -d path/to/project
```

### `ralph reset`

Archives the current `prd.json` and `progress.txt` into `archive/<timestamp>-<branch-slug>/`, restores `prd.json` from `prd.json.example`, resets `progress.txt`, and clears `.last-branch` so you can author a fresh PRD before the next run.

```bash
ralph reset
ralph reset -d path/to/project
```

### `ralph fix`

First cleans stale Ralph-generated root artifacts (`PLANNER.md`, `DEVELOPER.md`, `UXUI.md`, `DOCUMENTATION.md`, `WEB_BROWSER_SAFE.md`, `WEB_BROWSER_BYPASS.md`, `DOCTOR.md`, `PROGRESS_INSTRUCT.md`, `prd.json.example`, `prompt.md`, `CLAUDE.md`, and `AGENTS.md`) when their normalized contents exactly match a known Ralph-generated version. Files with the same names but different contents are preserved and reported. If `prd.json` is still invalid after cleanup, Ralph injects the current validation errors into the bundled `DOCTOR.md` prompt and runs a single doctor pass. If `prd.json` is already valid, `ralph fix` exits after cleanup without calling the AI tool.

```bash
ralph fix                       # Claude Code (default)
ralph fix --tool amp
ralph fix --tool copilot
ralph fix --tool codex
ralph fix -d path/to/project
```

Options:
- `--tool <tool>` — AI tool to use (default: `claude`)
- `-d, --dir <path>` — Project directory containing `prd.json` (default: cwd)
- `--bypass` / `--no-bypass` — Override bypass mode for Codex
- `--auto-approve` / `--no-auto-approve` — Override Copilot auto-approval

## Development

```bash
cd cli
npm install
npm run build      # Build with tsup
npm run dev        # Build in watch mode
npm run typecheck  # Type check only
npm run pack:dry-run # Preview npm package contents
npm run token-count # Count Ralph prompt/template tokens
npm install -g .   # Update the globally installed ralph command from this checkout
```

Token counting supports live project files and context-limit percentages:

```bash
npm run token-count -- --dir .. --limit 200000
npm run token-count -- --encoding cl100k_base --json
```

The report separates one composed runtime prompt per phase from the total size of all templates, because Ralph only injects one phase prompt at a time.

## Published Package Contents

The npm package is intentionally small. `package.json` uses a `files` allowlist so the tarball contains only:

- `dist/index.js`
- `templates/**`
- `README.md`
- `LICENSE`
- `package.json`

Source files, development scripts, `node_modules`, local Ralph run state, archives, and visualization assets are excluded from the published package.

## Release and Staging

The registry package is `@samuelchung/ralph-cli`, and npm registry publishing runs from the `cli` directory. The release workflow is `.github/workflows/npm-release.yml`.

Use `vX.Y.Z` tags for npm releases. `X.Y.Z` must exactly match `cli/package.json` `version`; the workflow validates that match before publishing with `npm publish --access public`. Configure npm trusted publishing for GitHub Actions with owner `samchung95`, repository `ralph-cli`, workflow filename `npm-release.yml`, and no environment name unless the workflow is updated to use one.

Use `staging/vX.Y.Z-*` branches for release candidates and package-install testing. The version prefix must match `cli/package.json`, and staging branches run the package checks without publishing to npm.

Release tags and staging branches use Node.js 24, install with `npm ci` from `cli/package-lock.json`, then run:

```bash
npm run typecheck
npm run build
npm test
npm run pack:dry-run
```

To test a staging ref through npm's GitHub install path:

```bash
npm install github:samchung95/ralph-cli#staging/vX.Y.Z-rc.1
```

GitHub installs use the repository root `package.json` wrapper. Its `prepare` script runs `npm --prefix cli ci && npm --prefix cli run build`, and its `bin` entry points `ralph` at `cli/dist/index.js`.
