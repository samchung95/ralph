import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliRoot = process.cwd();
const repoRoot = join(cliRoot, "..");
const cliPath = join(cliRoot, "dist", "index.js");
const bundledRunSkillPath = join(cliRoot, "templates", "skills", "ralph-run", "SKILL.md");
const rootRunSkillPath = join(repoRoot, "skills", "ralph-run", "SKILL.md");

test("bundles ralph-run skill for project-manager loop monitoring", async () => {
  const [bundledSkill, rootSkill] = await Promise.all([
    readFile(bundledRunSkillPath, "utf8"),
    readFile(rootRunSkillPath, "utf8"),
  ]);

  assert.equal(bundledSkill, rootSkill);
  assert.match(bundledSkill, /^name: ralph-run$/m);
  assert.match(bundledSkill, /project manager/i);
  assert.match(bundledSkill, /every 5 minutes/i);
  assert.match(bundledSkill, /prd\.json/);
  assert.match(bundledSkill, /progress\.txt/);
  assert.match(bundledSkill, /git diff/i);
  assert.match(bundledSkill, /ralph run/i);
});

test("install copies setup and run-monitoring skills for Codex", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "ralph-install-home-"));

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [cliPath, "install", "--tool", "codex"],
      {
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
      }
    );

    const skillsDir = join(homeDir, ".agents", "skills");
    const [ralphSkill, ralphRunSkill] = await Promise.all([
      readFile(join(skillsDir, "ralph", "SKILL.md"), "utf8"),
      readFile(join(skillsDir, "ralph-run", "SKILL.md"), "utf8"),
    ]);

    assert.match(ralphSkill, /^name: ralph$/m);
    assert.match(ralphRunSkill, /^name: ralph-run$/m);
    assert.match(stdout, /Available skills:/);
    assert.match(stdout, /\/ralph\b/);
    assert.match(stdout, /\/ralph-run\b/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
