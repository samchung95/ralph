import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), "dist", "index.js");

test("reset archive labels preserve repo branch prefixes consistently", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ralph-archive-"));

  try {
    await writeFile(join(dir, "prd.json"), `${JSON.stringify(validPrd(), null, 2)}\n`, "utf8");
    await writeFile(join(dir, "progress.txt"), "prior run notes\n", "utf8");

    await execFileAsync(process.execPath, [cliPath, "reset", "--dir", dir]);

    const archiveEntries = await readdir(join(dir, "archive"));
    assert.equal(archiveEntries.length, 1);
    assert.match(archiveEntries[0], /-ralph-task-priority$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function validPrd() {
  return {
    project: "Test",
    branchName: "ralph/task-priority",
    description: "Prior run",
    finalSuccessCriteria: {
      description: "Finish the prior run",
      acceptanceCriteria: ["Tests pass"],
      passes: false,
      notes: "",
    },
    planning: {
      cycle: 1,
      currentObjective: "Planner selects the first focused handoff",
    },
    prdChain: [
      {
        cycle: 1,
        objective: "Planner selects the first focused handoff",
        status: "active",
        storyIds: [],
        notes: "",
      },
    ],
    userStories: [],
  };
}
