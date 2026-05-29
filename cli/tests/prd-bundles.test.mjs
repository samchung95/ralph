import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliRoot = process.cwd();
const repoRoot = join(cliRoot, "..");
const cliPath = join(cliRoot, "dist", "index.js");
const templatePath = join(cliRoot, "templates", "prd.json.example");
const doctorPath = join(cliRoot, "templates", "DOCTOR.md");
const plannerPath = join(cliRoot, "templates", "PLANNER.md");
const rootSkillPath = join(repoRoot, "skills", "ralph", "SKILL.md");
const bundledSkillPath = join(cliRoot, "templates", "skills", "ralph", "SKILL.md");

test("bundled PRD template groups final acceptance criteria into bundles", async () => {
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const bundles = template.finalSuccessCriteria.acceptanceCriteriaBundles;

  assert.ok(Array.isArray(bundles));
  assert.ok(bundles.length >= 1);
  assert.equal(typeof bundles[0].id, "string");
  assert.equal(typeof bundles[0].title, "string");
  assert.ok(Array.isArray(bundles[0].acceptanceCriteria));
  assert.ok(Array.isArray(bundles[0].storyIds));
  assert.match(bundles[0].status, /^(pending|active|passed|deferred|blocked)$/);
  assert.equal(typeof bundles[0].notes, "string");
});

test("validator requires acceptance bundles when final criteria has more than five items", async () => {
  const prd = validBundledPrd();
  delete prd.finalSuccessCriteria.acceptanceCriteriaBundles;

  const result = await runValidate(prd);

  assert.notEqual(result.exitCode, 0);
  assert.match(
    result.output,
    /finalSuccessCriteria\.acceptanceCriteriaBundles is required when finalSuccessCriteria\.acceptanceCriteria has more than 5 items/
  );
});

test("validator allows small final criteria sets without acceptance bundles", async () => {
  const prd = validBundledPrd();
  prd.finalSuccessCriteria.acceptanceCriteria = prd.finalSuccessCriteria.acceptanceCriteria.slice(0, 5);
  delete prd.finalSuccessCriteria.acceptanceCriteriaBundles;

  const result = await runValidate(prd);

  assert.equal(result.exitCode, 0, result.output);
});

test("validator rejects a passed acceptance bundle until every referenced story passes", async () => {
  const prd = validBundledPrd();
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[0].status = "passed";
  prd.userStories[0].passes = false;

  const result = await runValidate(prd);

  assert.notEqual(result.exitCode, 0);
  assert.match(
    result.output,
    /finalSuccessCriteria\.acceptanceCriteriaBundles\[0\]\.status cannot be "passed" until all referenced userStories pass/
  );
});

test("validator rejects a passed acceptance bundle without referenced stories", async () => {
  const prd = validBundledPrd();
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[0].status = "passed";
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[0].storyIds = [];
  prd.userStories[0].passes = true;

  const result = await runValidate(prd);

  assert.notEqual(result.exitCode, 0);
  assert.match(
    result.output,
    /finalSuccessCriteria\.acceptanceCriteriaBundles\[0\]\.status cannot be "passed" without at least one referenced userStory/
  );
});

test("validator rejects final success when any acceptance bundle is not terminal", async () => {
  const prd = validBundledPrd();
  prd.finalSuccessCriteria.passes = true;
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[0].status = "pending";
  prd.userStories[0].passes = true;

  const result = await runValidate(prd);

  assert.notEqual(result.exitCode, 0);
  assert.match(
    result.output,
    /finalSuccessCriteria\.passes cannot be true until every acceptanceCriteriaBundles entry has status "passed" or "deferred"/
  );
});

test("validator accepts final success when all bundles are passed or deferred", async () => {
  const prd = validBundledPrd();
  prd.finalSuccessCriteria.passes = true;
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[0].status = "passed";
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[1].status = "deferred";
  prd.finalSuccessCriteria.acceptanceCriteriaBundles[1].notes = "Deferred by user for a follow-up run.";
  prd.userStories[0].passes = true;

  const result = await runValidate(prd);

  assert.equal(result.exitCode, 0, result.output);
});

test("planner, doctor, and setup skill document acceptance bundle rules", async () => {
  const [doctor, planner, rootSkill, bundledSkill] = await Promise.all([
    readFile(doctorPath, "utf8"),
    readFile(plannerPath, "utf8"),
    readFile(rootSkillPath, "utf8"),
    readFile(bundledSkillPath, "utf8"),
  ]);

  for (const content of [doctor, planner, rootSkill, bundledSkill]) {
    assert.match(content, /acceptanceCriteriaBundles/);
    assert.match(content, /userStories/);
    assert.match(content, /status.*passed/i);
    assert.match(content, /deferred/i);
    assert.match(content, /more than 5/i);
  }
});

async function runValidate(prd) {
  const dir = await mkdtemp(join(tmpdir(), "ralph-prd-bundles-"));
  try {
    await writeFile(join(dir, "prd.json"), `${JSON.stringify(prd, null, 2)}\n`, "utf8");
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [
        cliPath,
        "validate",
        "--silent",
        "--dir",
        dir,
      ]);
      return { exitCode: 0, output: `${stdout}\n${stderr}` };
    } catch (error) {
      return {
        exitCode: error.code ?? 1,
        output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validBundledPrd() {
  return {
    project: "test",
    branchName: "feat/test",
    description: "test bundled acceptance criteria",
    finalSuccessCriteria: {
      description: "Ship the test feature",
      acceptanceCriteria: [
        "Users can complete the test feature",
        "Admins can audit the test feature",
        "The feature handles empty states",
        "The feature handles validation errors",
        "The feature is documented",
        "Tests pass",
      ],
      acceptanceCriteriaBundles: [
        {
          id: "ACB-001",
          title: "Core feature behavior",
          acceptanceCriteria: [
            "Users can complete the test feature",
            "Tests pass",
          ],
          storyIds: ["US-001"],
          status: "pending",
          notes: "",
        },
        {
          id: "ACB-002",
          title: "Follow-up operations",
          acceptanceCriteria: [
            "Admins can audit the test feature",
            "The feature is documented",
          ],
          storyIds: ["US-002"],
          status: "pending",
          notes: "",
        },
      ],
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
        storyIds: ["US-001"],
        notes: "",
      },
    ],
    userStories: [
      {
        id: "US-001",
        title: "Implement core feature",
        description: "As a user, I can complete the core feature.",
        acceptanceCriteria: ["Users can complete the test feature"],
        priority: 1,
        storyPriority: "medium",
        passes: false,
        notes: "",
      },
      {
        id: "US-002",
        title: "Document operational behavior",
        description: "As an operator, I can audit and understand the feature.",
        acceptanceCriteria: [
          "Admins can audit the test feature",
          "The feature is documented",
        ],
        priority: 2,
        storyPriority: "low",
        passes: false,
        notes: "",
      },
    ],
  };
}
