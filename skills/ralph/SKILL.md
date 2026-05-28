---
name: ralph
description: "Set up Ralph's planner-routed agent loop. Use when starting a Ralph run, creating prd.json, checking whether prd.json/progress.txt should be archived, expanding a feature idea into final success criteria, or preparing planner handoffs for developer, UXUI, documentation, and web browser agents. Triggers on: set up ralph, start ralph, create prd.json, plan this with ralph, ralph setup."
---

# Ralph Setup

Set up the first step for Ralph's planner-routed agent loop.

Ralph starts with the planner. The planner decides which focused agent should run next:

- `developer` for product/source implementation.
- `uxui` for UX/UI refinement and browser verification.
- `documentation` for docs, examples, and usage guidance.
- `WEB_BROWSER_SAFE` for read-only public web research and browser inspection without sign-in or form submission.
- `WEB_BROWSER_BYPASS` for authorized sign-in and form submission when explicitly required.

The setup skill should protect existing run state first, expand the user's rough prompt or thoughts into a clear global target, then create durable files that let the planner choose the first handoff.

---

## The Job

1. Check whether existing `prd.json` and `progress.txt` need to be archived before changing either file.
2. Understand and, when useful, expand the feature or outcome the user wants.
3. Ask only essential clarifying and scope-expansion questions.
4. Research how to phrase specific, explicit success criteria for every selected scope item.
5. Choose repo-style naming for `branchName` and the future pull request title, preserving explicit user-provided names when present.
6. Create or update `prd.json` directly in the Ralph directory.
7. Create or reset `progress.txt` for the new run.
8. Do not implement product code.

---

## Start With Archive Check

Before prompt expansion or file writes:

1. Read the current `prd.json` and `progress.txt` if either file exists.
2. Classify the current state:
   - No files, empty files, or placeholder-only template files: no archive needed.
   - Meaningful active or completed run: archive before replacing or resetting.
   - Partial state where only one file exists: archive any meaningful file before replacing it.
3. Archive when any of these are true:
   - Existing `prd.json.branchName` differs from the new branch name.
   - Existing `finalSuccessCriteria.passes` is `true`.
   - `progress.txt` shows a complete, blocked, or active prior run.
   - Either file contains useful run notes, decisions, evidence, or non-template user content that would be overwritten.
4. Create `archive/<timestamp>-<feature-slug>/` and copy every meaningful existing `prd.json` and `progress.txt` into it.
5. If existing files are only blank placeholders or obvious template canvases, replace them without archiving and note that no archive was needed.

Do not silently discard useful prior run context. If archive need is ambiguous, ask before overwriting.

---

## Prompt Expansion

If the user's request is rough, convert it into:

- Intent: the real user/business outcome.
- In scope: what Ralph should be allowed to change.
- Out of scope: what Ralph should avoid.
- Assumptions: reasonable assumptions made from context.
- Supporting process scope: whether to include documentation, security checks, cleanup, refactor, tests, accessibility, performance, release notes, migration/backward compatibility, or other post-dev work.
- Success-criteria research: local files, commands, standards, docs, or existing patterns used to phrase explicit criteria.
- Final success criteria: concrete, verifiable global completion criteria.
- First planner objective: what the planner should decide first.
- Naming: `branchName` plus `planning.naming.pullRequestTitle`, using explicit user-provided names when present and otherwise inferring the repo style from local conventions.

Ask 3-5 questions only when needed. Include one concise scope-expansion Q&A unless the user already answered it. Focus on:

- Final outcome: How do we know the whole run is done?
- Scope: What should be included or excluded?
- Scope expansion: Should Ralph include supporting finish work such as documentation, security/privacy review, cleanup, refactor, test hardening, accessibility, performance, migration/backward compatibility, or release notes?
- Agent needs: Does this likely need developer, UXUI, documentation, web browsing, authenticated browser actions, or multiple agents?
- Verification: What checks prove the work is correct?
- UI/browser needs: Does this require visual verification?
- Naming: Did the user provide an explicit branch name or pull request title? If not, infer both from git history, contribution docs, current branch naming, and the task.

If the user's request already has enough detail and supporting scope is clear, create the files without asking more.

## Branch And Pull Request Naming

Choose names for both the git branch and a future pull request during PRD creation:

1. If the user provides an explicit branch name, use it exactly unless it is invalid for git or conflicts with a clear repo rule.
2. If the user provides an explicit pull request title, use it exactly unless it is empty or clearly malformed.
3. If either name is not provided, inspect local repo conventions such as recent branch names, recent commit messages, contribution docs, package scripts, issue references, and existing PR/title patterns when available.
4. Do not prefix branch names or pull request titles with `ralph` unless the repository already uses that convention or the user explicitly asks for it.
5. Record the selected future pull request title and short rationale in `planning.naming`.

---

## Scope Expansion And Research

Offer supporting scopes as optional, not automatic. Use a short Q&A to determine whether the user wants any of these included:

- Documentation: README, usage docs, API docs, examples, runbooks, changelog, or migration notes.
- Security check: auth, permissions, secrets, injection, data exposure, dependency risk, or privacy review.
- Cleanup: obsolete files, dead code, generated artifacts, stale comments, unused config, or old docs made wrong by the change.
- Refactor: targeted structure improvement that supports the feature without changing unrelated behavior.
- Test hardening: unit, integration, browser, regression, fixture, or edge-case coverage.
- Other post-dev checks: accessibility, performance, compatibility, observability, release notes, deployment notes, or rollback notes.

When the user includes any supporting scope, research before writing final criteria:

1. Inspect relevant repo docs, tests, CI, package scripts, lint/typecheck commands, security or dependency tooling, and existing patterns.
2. Use authoritative external docs only when criteria depend on current external standards, tool behavior, or framework-specific security guidance.
3. Phrase each criterion as observable outcome plus verification evidence. Avoid vague criteria such as "improve security", "clean up code", or "update docs".
4. Record selected and declined supporting scopes, plus short research notes, in `planning.promptExpansion` when useful for the planner.

Useful criterion shapes:

| Scope | Explicit success-criteria shape |
| --- | --- |
| Documentation | "`README` and relevant usage docs describe [new behavior], include [example/command], and contain no stale references to [old behavior]." |
| Security check | "Reviewed [auth/data/input/dependency path]; no new secrets, permission expansion, injection risk, or sensitive-data exposure is introduced; available security checks pass or residual risks are noted." |
| Cleanup | "Obsolete files, generated artifacts, dead code, and stale references made unnecessary by [change] are removed without deleting user-owned custom work." |
| Refactor | "[Module/flow] is refactored to [specific structure] while preserving public behavior, with existing and new tests passing." |
| Test hardening | "Tests cover [happy path], [edge/error path], and [regression risk]; relevant test command passes." |
| Accessibility/performance | "[Specific a11y/perf target] is verified with [tool/manual check/metric] and regressions are documented if not fully addressed." |

---

## Template PRD Canvas Format

The JSON below is a template PRD canvas. Replace every bracketed placeholder before writing a real `prd.json`; do not leave template language in an active Ralph run.

Write valid JSON:

```json
{
  "project": "[Project Name]",
  "branchName": "[repo-style-branch-name]",
  "description": "[Planner-routed Ralph run description]",
  "finalSuccessCriteria": {
    "description": "[Global outcome for the whole run]",
    "acceptanceCriteria": [
      "Final criterion 1",
      "Final criterion 2",
      "Typecheck passes"
    ],
    "passes": false,
    "notes": ""
  },
  "planning": {
    "cycle": 1,
    "currentObjective": "Planner reviews the expanded prompt and selects the first focused agent handoff",
    "promptExpansion": {
      "intent": "[Expanded user intent]",
      "inScope": ["Scope item"],
      "outOfScope": ["Excluded item"],
      "assumptions": ["Assumption"],
      "supportingScope": {
        "included": ["Selected supporting process"],
        "declined": ["Declined supporting process"],
        "successCriteriaResearch": ["Research note used to phrase criteria"]
      },
      "suggestedAgents": ["developer", "uxui", "documentation", "WEB_BROWSER_SAFE", "WEB_BROWSER_BYPASS"]
    },
    "naming": {
      "branchNameRationale": "[Explicit user-provided branch name, or repo evidence used to infer it]",
      "pullRequestTitle": "[Explicit user-provided pull request title, or repo-style title inferred from the task]",
      "pullRequestTitleRationale": "[Explicit user-provided pull request title, or repo evidence used to infer it]"
    }
  },
  "prdChain": [
    {
      "cycle": 1,
      "objective": "Planner selects the first focused handoff",
      "status": "active",
      "storyIds": [],
      "notes": "No agent handoff has run yet"
    }
  ],
  "userStories": []
}
```

Do not set `finalSuccessCriteria.passes` to `true` during setup.

`planning.activeHandoff` is optional during setup because Ralph starts with the planner. The planner will write it before the selected agent runs:

```json
"activeHandoff": {
  "agent": "developer",
  "objective": "Implement one focused slice",
  "scope": {
    "include": ["What this handoff should touch"],
    "exclude": ["What this handoff must not touch"]
  },
  "rules": ["Constraint the selected agent must follow"],
  "comments": "Planner context for this handoff.",
  "successCriteria": ["Verifiable handoff-level criterion"],
  "status": "ready"
}
```

Allowed `activeHandoff.agent` values are `"developer"`, `"uxui"`, `"documentation"`, `"WEB_BROWSER_SAFE"`, and `"WEB_BROWSER_BYPASS"`.

---

## Setup Rules

- Put the whole desired outcome in `finalSuccessCriteria`.
- Keep setup focused on the global goal and planner context, not a full backlog.
- Acceptance criteria must be concrete and verifiable.
- Include checks such as `Typecheck passes`, `Tests pass`, `Browser verification passes`, or `Documentation is updated` when relevant.
- Include selected supporting scopes in `finalSuccessCriteria.acceptanceCriteria`; keep declined supporting scopes out of the run.
- Preserve useful success-criteria research notes in `planning.promptExpansion`.
- Use `planning.promptExpansion` to preserve useful interpretation of the user's rough prompt.
- Use `planning.naming` to preserve the future pull request title and the rationale for branch/title choices.
- Do not prefix branch names or pull request titles with `ralph` unless that matches repo convention or the user explicitly asks for it.
- Let the first runtime planner decide the first agent handoff.

---

## progress.txt

If `progress.txt` does not exist, create:

```text
# Ralph Progress

Goal: [one-line final success goal]
Branch: [branch]
Cycle: 1
Status: planning
Current agent: planner
Current objective: Planner selects the first focused handoff

Next:
- Planner selects the first focused handoff.

Blockers:
- none

Important patterns:
- none yet
---

Started: [current date/time]
```

If `progress.txt` exists, append a short setup note instead of replacing the file.

---

## Archiving Previous Runs

The archive check happens before any new setup work. Prefer archiving over overwriting when either file contains useful prior context.

Archive both files together when possible. If only one file exists and it has meaningful content, archive that file rather than discarding it. Use the existing branch name for the archive label when available; otherwise use the new feature slug or `run`.

The Ralph runner also archives when it detects a branch change, but the setup skill must protect useful context before it writes a new `prd.json` or resets `progress.txt`.

---

## Example

Feature request:

```text
Add task priority so users can mark tasks high, medium, or low, see priority on cards, edit priority, filter by priority, and have relevant docs updated.
```

Initial `prd.json`:

```json
{
  "project": "TaskApp",
  "branchName": "feat/task-priority",
  "description": "Task Priority System - planner-routed Ralph run",
  "finalSuccessCriteria": {
    "description": "Users can assign, view, edit, and filter task priority across the app, with priority persisted and relevant usage documentation updated.",
    "acceptanceCriteria": [
      "Tasks persist a priority value of high, medium, or low",
      "Users can see priority on task cards without opening details",
      "Users can edit priority from the task edit flow",
      "Users can filter the task list by priority",
      "Priority UI is verified in browser",
      "Relevant usage documentation is updated",
      "Typecheck passes"
    ],
    "passes": false,
    "notes": ""
  },
  "planning": {
    "cycle": 1,
    "currentObjective": "Planner reviews the expanded prompt and selects the first focused agent handoff",
    "promptExpansion": {
      "intent": "Add an end-to-end task priority feature with persisted data, usable UI, filtering, and docs.",
      "inScope": [
        "Task priority persistence",
        "Priority display and editing UI",
        "Priority filtering",
        "Relevant documentation"
      ],
      "outOfScope": [
        "Unrelated task redesign",
        "Authentication changes"
      ],
      "assumptions": [
        "Existing task creation and edit flows should remain intact"
      ],
      "supportingScope": {
        "included": [
          "documentation"
        ],
        "declined": [
          "security check",
          "cleanup beyond files touched for the feature",
          "refactor beyond the priority implementation path"
        ],
        "successCriteriaResearch": [
          "Reviewed existing usage docs and package scripts before phrasing documentation and verification criteria"
        ]
      },
      "suggestedAgents": [
        "developer",
        "uxui",
        "documentation"
      ]
    },
    "naming": {
      "branchNameRationale": "Inferred from common feature branch style for task-scoped product changes.",
      "pullRequestTitle": "Add task priority filtering",
      "pullRequestTitleRationale": "Imperative product-focused title inferred from the requested feature."
    }
  },
  "prdChain": [
    {
      "cycle": 1,
      "objective": "Planner selects the first focused handoff",
      "status": "active",
      "storyIds": [],
      "notes": "No agent handoff has run yet"
    }
  ],
  "userStories": []
}
```

---

## Checklist

Before finishing:

- [ ] Existing `prd.json` and `progress.txt` were checked for archive need before edits.
- [ ] `prd.json` is valid JSON.
- [ ] `finalSuccessCriteria` describes the whole target outcome.
- [ ] Selected supporting scopes are represented in `finalSuccessCriteria.acceptanceCriteria`.
- [ ] Declined supporting scopes are excluded or recorded as out of scope.
- [ ] Success criteria are specific, explicit, and backed by local or authoritative research where needed.
- [ ] `finalSuccessCriteria.passes` is `false`.
- [ ] `planning.cycle` is `1`.
- [ ] `planning.currentObjective` starts with planner handoff selection.
- [ ] `planning.promptExpansion` captures useful intent, scope, assumptions, and suggested agents.
- [ ] `branchName` and `planning.naming.pullRequestTitle` use explicit user-provided names when given, otherwise repo-style inferred names.
- [ ] Branch names and pull request titles are not prefixed with `ralph` unless the repo or user explicitly requires it.
- [ ] `prdChain` has one active cycle 1 entry.
- [ ] `userStories` is an array, usually empty at setup.
- [ ] `progress.txt` exists and uses the compact shared-memory format.
- [ ] No implementation work was started.
