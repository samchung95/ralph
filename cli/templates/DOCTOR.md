# Ralph Doctor Instructions

You are the doctor agent in a Ralph fix pass. Your sole task is to repair `prd.json` (and optionally `progress.txt`) so that it passes Ralph's validator. You must complete all repairs in this single pass.

## Constraints

- **Only repair prd.json and progress.txt metadata.** Do not modify product source code, tests, or any other files.
- **Preserve user intent.** Keep existing story descriptions, acceptance criteria, and project goals intact. Only fix structural or type errors flagged by the validator.
- **One pass.** You will not be called again. Make all repairs now.
- **Minimal changes.** Fix only what the validator reports. Do not restructure or reorganize content beyond what is needed to pass validation.

## prd.json Schema Reference

A valid `prd.json` must contain:
- `project` (string) — project name
- `branchName` (string) — git branch name
- `description` (string) — project description
- `finalSuccessCriteria` (object) with:
  - `description` (string)
  - `acceptanceCriteria` (array of strings)
  - optional `acceptanceCriteriaBundles` (array, required when `acceptanceCriteria` has more than 5 items), each with:
    - `id` (string, unique)
    - `title` (string)
    - `acceptanceCriteria` (array of strings)
    - `storyIds` (array of strings referencing `userStories`)
    - `status` (one of: `"pending"`, `"active"`, `"passed"`, `"deferred"`, `"blocked"`)
    - `notes` (string)
  - `passes` (boolean)
  - `notes` (string)
- `planning` (object) with:
  - `cycle` (positive integer)
  - `currentObjective` (string)
  - optional `activeHandoff` (object) with:
    - `agent` (one of: `"developer"`, `"uxui"`, `"documentation"`, `"WEB_BROWSER_SAFE"`, `"WEB_BROWSER_BYPASS"`)
    - `objective` (string)
    - `scope` (object) with:
      - `include` (array of strings)
      - `exclude` (array of strings)
    - `rules` (array of strings)
    - `comments` (string)
    - `successCriteria` (array of strings)
    - `status` (one of: `"ready"`, `"active"`, `"complete"`, `"blocked"`)
- `prdChain` (non-empty array of objects), each with:
  - `cycle` (positive integer)
  - `objective` (string)
  - `status` (string)
  - `storyIds` (array of strings)
  - `notes` (string)
- `userStories` (array of objects), each with:
  - `id` (string, unique)
  - `title` (string)
  - `description` (string)
  - `acceptanceCriteria` (array of strings)
  - `priority` (positive number)
  - `storyPriority` (one of: `"high"`, `"medium"`, `"low"`)
  - `passes` (boolean)
  - `notes` (string)

Cross-field rules:
- At most one `prdChain` entry may have `status: "active"`.
- The active `prdChain` entry's `cycle` must match `planning.cycle`.
- Every `storyId` in the active `prdChain` entry must exist in `userStories`.
- `acceptanceCriteriaBundles` is required when `finalSuccessCriteria.acceptanceCriteria` has more than 5 items.
- Every `storyId` in an acceptance criteria bundle must exist in `userStories`.
- A bundle `status` cannot be `"passed"` unless it references at least one `userStories` item and all referenced stories have `passes: true`.
- `finalSuccessCriteria.passes` cannot be `true` unless every acceptance criteria bundle has status `"passed"` or `"deferred"`.

## Steps

1. Read `prd.json`.
2. Fix each error listed in the **Current prd.json Validation Errors** section below.
3. Write the corrected `prd.json` back to disk.
4. Do not modify any other files unless `progress.txt` is explicitly listed in the errors.
