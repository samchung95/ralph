import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const cliRoot = process.cwd();
const cliPath = join(cliRoot, "dist", "index.js");

test("copilot auto-approve runs close stdin so prompt-mode agents can exit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ralph-copilot-run-"));

  try {
    const fakeBinDir = join(dir, "bin");
    await mkdir(fakeBinDir);
    await writeFakeCopilot(fakeBinDir);
    await writeFile(join(dir, "prd.json"), `${JSON.stringify(initialPrd(), null, 2)}\n`, "utf8");

    const result = await runCli(
      ["run", "1", "--tool", "copilot", "--auto-approve", "--dir", dir],
      {
        PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
      }
    );

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);

    const calls = (await readFile(join(dir, "copilot-calls.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));

    assert.equal(calls.length, 1);
    assert.match(calls[0].stdin, /^(y\r?\nyes\r?\n\r?\n|yes\r?\ny\r?\n\r?\n)/);
    assert.deepEqual(calls[0].args.slice(0, 3), ["--allow-all", "--autopilot", "--no-ask-user"]);
  } finally {
    await rmWithRetry(dir);
  }
});

async function writeFakeCopilot(fakeBinDir) {
  const fakeCopilotModule = join(fakeBinDir, "copilot.mjs");
  await writeFile(
    fakeCopilotModule,
    `import { appendFile, readFile, writeFile } from "node:fs/promises";

process.stdout.write("Do you want to proceed? [y/n]\\n");

let stdin = "";
process.stdin.setEncoding("utf8");
const timeout = setTimeout(() => {
  console.error("fake copilot timed out waiting for stdin EOF");
  process.exit(124);
}, 800);

for await (const chunk of process.stdin) {
  stdin += chunk;
}
clearTimeout(timeout);

await appendFile(
  "copilot-calls.jsonl",
  JSON.stringify({ args: process.argv.slice(2), stdin }) + "\\n",
  "utf8"
);

const prd = JSON.parse(await readFile("prd.json", "utf8"));
prd.finalSuccessCriteria.passes = true;
prd.finalSuccessCriteria.notes = "fake copilot completed after stdin EOF";
prd.planning.activeHandoff.status = "complete";
prd.prdChain[0].status = "complete";
await writeFile("prd.json", JSON.stringify(prd, null, 2) + "\\n", "utf8");

console.log("<promise>COMPLETE</promise>");
`,
    "utf8"
  );

  if (process.platform === "win32") {
    await writeFile(
      join(fakeBinDir, "copilot.cmd"),
      `@echo off\r\nnode "%~dp0copilot.mjs" %*\r\n`,
      "utf8"
    );
    return;
  }

  const fakeCopilotBin = join(fakeBinDir, "copilot");
  await writeFile(
    fakeCopilotBin,
    `#!/usr/bin/env sh\nexec node "$(dirname "$0")/copilot.mjs" "$@"\n`,
    "utf8"
  );
  await chmod(fakeCopilotBin, 0o755);
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
    }, 10000);

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
            `ralph run timed out waiting for fake copilot stdin EOF\\nSTDOUT:\\n${stdout}\\nSTDERR:\\n${stderr}`
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
    description: "test copilot run",
    finalSuccessCriteria: {
      description: "fake copilot completes",
      acceptanceCriteria: ["fake copilot exits after stdin EOF"],
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
