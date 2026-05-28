import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

const cliRoot = process.cwd();
const repoRoot = dirname(cliRoot);

test("Ralph setup skills require repo-style branch and PR title naming", async () => {
  const skillPaths = [
    join(repoRoot, "skills", "ralph", "SKILL.md"),
    join(cliRoot, "templates", "skills", "ralph", "SKILL.md"),
  ];

  for (const skillPath of skillPaths) {
    const content = await readFile(skillPath, "utf8");

    assert.doesNotMatch(content, /"branchName":\s*"ralph\//);
    assert.match(content, /explicit branch name/i);
    assert.match(content, /explicit pull request title/i);
    assert.match(content, /do not prefix .*ralph/i);
    assert.match(content, /pullRequestTitle/);
  }
});

test("planner prompt documents PR naming metadata without Ralph branch prefix", async () => {
  const content = await readFile(join(cliRoot, "templates", "PLANNER.md"), "utf8");

  assert.doesNotMatch(content, /"branchName":\s*"ralph\//);
  assert.match(content, /pullRequestTitle/);
  assert.match(content, /future pull request/i);
  assert.match(content, /do not prefix .*ralph/i);
});
