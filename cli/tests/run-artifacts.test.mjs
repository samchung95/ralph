import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const cliRoot = process.cwd();
const cliPath = join(cliRoot, "dist", "index.js");

test("codex run writes centralized run attempt artifacts with a hashed final-message path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ralph-codex-artifacts-"));

  try {
    const projectDir = join(dir, "project");
    const fakeBinDir = join(dir, "bin");
    const ralphHome = join(dir, "ralph-home");
    await mkdir(projectDir);
    await mkdir(fakeBinDir);
    await writeFakeCodex(fakeBinDir);
    await writeFile(join(projectDir, "prd.json"), `${JSON.stringify(initialPrd(), null, 2)}\n`, "utf8");

    const result = await runCli(
      ["run", "1", "--tool", "codex", "--bypass", "--dir", projectDir],
      {
        PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
        RALPH_HOME: ralphHome,
      }
    );

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);

    const prd = JSON.parse(await readFile(join(projectDir, "prd.json"), "utf8"));
    assert.match(prd.run.id, /^r_[0-9a-f]{16}$/);
    assert.equal(typeof prd.run.createdAt, "string");

    const runDir = join(ralphHome, "runs", prd.run.id);
    const runMetadata = JSON.parse(await readFile(join(runDir, "run.json"), "utf8"));
    assert.equal(runMetadata.runId, prd.run.id);
    assert.equal(runMetadata.projectDir, projectDir);
    assert.equal(runMetadata.branchName, "ralph/test");

    const attemptsDir = join(runDir, "attempts");
    const attemptIds = await readdir(attemptsDir);
    assert.equal(attemptIds.length, 1);
    assert.match(attemptIds[0], /^[0-9a-f]{64}$/);

    const attemptDir = join(attemptsDir, attemptIds[0]);
    const metadata = JSON.parse(await readFile(join(attemptDir, "metadata.json"), "utf8"));
    assert.equal(metadata.runId, prd.run.id);
    assert.equal(metadata.attemptId, attemptIds[0]);
    assert.equal(metadata.tool, "codex");
    assert.equal(metadata.role, "planner");
    assert.equal(metadata.agentType, "planner");
    assert.equal(metadata.cycle, 1);
    assert.equal(metadata.exitCode, 0);
    assert.equal(metadata.completionSource, "codex-last-message+prd-state");
    assert.equal(metadata.artifacts.prompt, join(attemptDir, "prompt.md"));
    assert.equal(metadata.artifacts.stdout, join(attemptDir, "stdout.log"));
    assert.equal(metadata.artifacts.stderr, join(attemptDir, "stderr.log"));
    assert.equal(
      metadata.artifacts.codexLastMessage,
      join(attemptDir, `${attemptIds[0]}-codex-last-message.txt`)
    );

    const calls = (await readFile(join(projectDir, "codex-calls.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(0, 2), [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
    assert.equal(calls[0].args[calls[0].args.length - 1], "-");
    const outputFlagIndex = calls[0].args.indexOf("--output-last-message");
    assert.notEqual(outputFlagIndex, -1);
    assert.equal(calls[0].args[outputFlagIndex + 1], metadata.artifacts.codexLastMessage);

    assert.match(await readFile(metadata.artifacts.prompt, "utf8"), /Ralph Planner Instructions/);
    assert.match(await readFile(metadata.artifacts.stdout, "utf8"), /<promise>COMPLETE<\/promise>/);
    assert.match(await readFile(metadata.artifacts.codexLastMessage, "utf8"), /fake codex final message/);
  } finally {
    await rmWithRetry(dir);
  }
});

async function writeFakeCodex(fakeBinDir) {
  const fakeCodexModule = join(fakeBinDir, "codex.mjs");
  await writeFile(
    fakeCodexModule,
    `import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex === -1 || !args[outputIndex + 1]) {
  console.error("missing --output-last-message");
  process.exit(64);
}

let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  stdin += chunk;
}

await appendFile(
  "codex-calls.jsonl",
  JSON.stringify({ args, stdin }) + "\\n",
  "utf8"
);

const outputPath = args[outputIndex + 1];
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, "fake codex final message\\n", "utf8");

const prd = JSON.parse(await readFile("prd.json", "utf8"));
prd.finalSuccessCriteria.passes = true;
prd.finalSuccessCriteria.notes = "fake codex completed";
prd.planning.activeHandoff.status = "complete";
prd.prdChain[0].status = "complete";
await writeFile("prd.json", JSON.stringify(prd, null, 2) + "\\n", "utf8");

console.log("<promise>COMPLETE</promise>");

setInterval(() => {}, 1000);
await new Promise(() => {});
`,
    "utf8"
  );

  if (process.platform === "win32") {
    await writeFile(
      join(fakeBinDir, "codex.cmd"),
      `@echo off\r\nnode "%~dp0codex.mjs" %*\r\n`,
      "utf8"
    );
    return;
  }

  const fakeCodexBin = join(fakeBinDir, "codex");
  await writeFile(
    fakeCodexBin,
    `#!/usr/bin/env sh\nexec node "$(dirname "$0")/codex.mjs" "$@"\n`,
    "utf8"
  );
  await chmod(fakeCodexBin, 0o755);
}

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: cliRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 6000);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(
            `ralph run timed out after fake codex wrote final state\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function rmWithRetry(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function initialPrd() {
  return {
    project: "test",
    branchName: "ralph/test",
    description: "test codex run artifacts",
    finalSuccessCriteria: {
      description: "fake codex completes",
      acceptanceCriteria: ["fake codex writes artifacts"],
      passes: false,
      notes: "",
    },
    planning: {
      cycle: 1,
      currentObjective: "planner checks completion",
      activeHandoff: {
        agent: "developer",
        objective: "unused",
        scope: { include: ["unused"], exclude: [] },
        rules: [],
        comments: "",
        successCriteria: ["unused"],
        status: "ready",
      },
    },
    prdChain: [
      {
        cycle: 1,
        objective: "unused",
        status: "active",
        storyIds: [],
        notes: "",
      },
    ],
    userStories: [],
  };
}
