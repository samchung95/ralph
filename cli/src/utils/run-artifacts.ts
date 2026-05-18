import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getRalphHomePath } from "./config.js";
import type { Tool } from "../types.js";

interface PrdRunState {
  id?: unknown;
  createdAt?: unknown;
}

interface PrdWithRunState {
  branchName?: unknown;
  run?: PrdRunState;
}

export interface RunArtifactContext {
  runId: string;
  runCreatedAt: string;
  runDir: string;
  attemptsDir: string;
  projectDir: string;
  prdPath: string;
  branchName?: string;
}

export interface AttemptArtifacts {
  metadata: string;
  prompt: string;
  stdout: string;
  stderr: string;
  codexLastMessage?: string;
}

export interface AttemptArtifactContext {
  attemptId: string;
  attemptDir: string;
  metadata: AttemptMetadata;
  artifacts: AttemptArtifacts;
}

export interface AttemptMetadata {
  schemaVersion: 1;
  runId: string;
  attemptId: string;
  projectDir: string;
  prdPath: string;
  branchName?: string;
  cycle: number;
  role: string;
  agentType: string;
  tool: Tool;
  startedAt: string;
  endedAt?: string;
  command?: string;
  args?: string[];
  exitCode?: number;
  error?: string;
  completionSource?: string;
  artifacts: AttemptArtifacts;
}

export async function ensureRunArtifacts(options: {
  prdPath: string;
  projectDir: string;
}): Promise<RunArtifactContext> {
  const prd = JSON.parse(await readFile(options.prdPath, "utf8")) as PrdWithRunState;
  const existingRun = prd.run && typeof prd.run === "object" ? prd.run : {};
  const runId = typeof existingRun.id === "string" ? existingRun.id : generateRunId();
  const runCreatedAt =
    typeof existingRun.createdAt === "string" ? existingRun.createdAt : new Date().toISOString();

  if (existingRun.id !== runId || existingRun.createdAt !== runCreatedAt || prd.run !== existingRun) {
    prd.run = {
      ...existingRun,
      id: runId,
      createdAt: runCreatedAt,
    };
    await writeFile(options.prdPath, `${JSON.stringify(prd, null, 2)}\n`, "utf8");
  }

  const runDir = join(getRalphHomePath(), "runs", runId);
  const attemptsDir = join(runDir, "attempts");
  const branchName = typeof prd.branchName === "string" ? prd.branchName : undefined;

  await mkdir(attemptsDir, { recursive: true });
  await writeFile(
    join(runDir, "run.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        createdAt: runCreatedAt,
        projectDir: options.projectDir,
        prdPath: options.prdPath,
        branchName,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    runId,
    runCreatedAt,
    runDir,
    attemptsDir,
    projectDir: options.projectDir,
    prdPath: options.prdPath,
    branchName,
  };
}

export async function createAttemptArtifacts(
  run: RunArtifactContext,
  options: {
    cycle: number;
    role: string;
    tool: Tool;
  }
): Promise<AttemptArtifactContext> {
  const startedAt = new Date().toISOString();
  const attemptId = hashAttemptId([
    run.runId,
    String(options.cycle),
    options.role,
    options.tool,
    startedAt,
    randomUUID(),
  ]);
  const attemptDir = join(run.attemptsDir, attemptId);
  const artifacts: AttemptArtifacts = {
    metadata: join(attemptDir, "metadata.json"),
    prompt: join(attemptDir, "prompt.md"),
    stdout: join(attemptDir, "stdout.log"),
    stderr: join(attemptDir, "stderr.log"),
  };

  if (options.tool === "codex") {
    artifacts.codexLastMessage = join(attemptDir, `${attemptId}-codex-last-message.txt`);
  }

  const metadata: AttemptMetadata = {
    schemaVersion: 1,
    runId: run.runId,
    attemptId,
    projectDir: run.projectDir,
    prdPath: run.prdPath,
    branchName: run.branchName,
    cycle: options.cycle,
    role: options.role,
    agentType: options.role,
    tool: options.tool,
    startedAt,
    artifacts,
  };

  await mkdir(attemptDir, { recursive: true });
  await writeAttemptMetadata({ attemptId, attemptDir, metadata, artifacts });

  return {
    attemptId,
    attemptDir,
    metadata,
    artifacts,
  };
}

export async function recordAttemptInvocation(
  attempt: AttemptArtifactContext,
  options: {
    command: string;
    args: string[];
  }
): Promise<void> {
  attempt.metadata.command = options.command;
  attempt.metadata.args = [...options.args];
  await writeAttemptMetadata(attempt);
}

export async function finalizeAttemptArtifacts(
  attempt: AttemptArtifactContext,
  options: {
    exitCode?: number;
    error?: unknown;
    completionSource?: string;
  }
): Promise<void> {
  attempt.metadata.endedAt = new Date().toISOString();
  attempt.metadata.completionSource = options.completionSource ?? "process-close";
  if (typeof options.exitCode === "number") {
    attempt.metadata.exitCode = options.exitCode;
  }
  if (options.error !== undefined) {
    attempt.metadata.error = options.error instanceof Error ? options.error.message : String(options.error);
  }
  await writeAttemptMetadata(attempt);
}

async function writeAttemptMetadata(attempt: AttemptArtifactContext): Promise<void> {
  await writeFile(attempt.artifacts.metadata, `${JSON.stringify(attempt.metadata, null, 2)}\n`, "utf8");
}

function generateRunId(): string {
  return `r_${createHash("sha256")
    .update(`${new Date().toISOString()}\0${randomUUID()}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function hashAttemptId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}
