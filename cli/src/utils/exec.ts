import { spawn } from "child_process";
import { createWriteStream, type WriteStream } from "fs";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  completionSource: string;
}

export interface AutoApproveOptions {
  enabled: boolean;
  label?: string;
  inputs?: string[];
}

const DEFAULT_APPROVAL_INPUTS = ["y\n", "yes\n", "\n"];

const APPROVAL_PATTERNS = [
  /do you want to/i,
  /(allow|approve|confirm|continue|proceed|execute|run)[\s\S]{0,140}\?/i,
  /(\[y\/n\]|\(y\/n\)|yes\/no|y\/n)/i,
  /press enter to continue/i,
];

/**
 * Execute a command and return its output.
 * Streams stdout/stderr to the console in real-time.
 */
export function exec(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    stdin?: string;
    silent?: boolean;
    autoApprove?: AutoApproveOptions;
    stdoutPath?: string;
    stderrPath?: string;
    completion?: {
      isComplete: () => Promise<boolean>;
      pollMs?: number;
      graceMs?: number;
      source?: string;
    };
  }
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const shouldPipeStdin = Boolean(options?.stdin || options?.autoApprove?.enabled);
    const child = spawn(command, args, {
      cwd: options?.cwd,
      shell: true,
      stdio: [shouldPipeStdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let recentOutput = "";
    let lastApprovalAt = 0;
    let settled = false;
    let childExitCode: number | undefined;
    let pollingCompletion = false;
    let completionDetectedSource: string | undefined;
    let completionGraceTimer: ReturnType<typeof setTimeout> | undefined;
    let completionPollTimer: ReturnType<typeof setInterval> | undefined;
    const stdoutLog = options?.stdoutPath ? createWriteStream(options.stdoutPath, { flags: "a" }) : undefined;
    const stderrLog = options?.stderrPath ? createWriteStream(options.stderrPath, { flags: "a" }) : undefined;

    const finish = async (exitCode: number, completionSource: string) => {
      if (settled) return;
      settled = true;
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (completionGraceTimer) clearTimeout(completionGraceTimer);
      await closeLogStreams(stdoutLog, stderrLog);
      resolve({
        stdout,
        stderr,
        exitCode,
        completionSource,
      });
    };

    const finishFromCompletion = () => {
      const completion = options?.completion;
      if (!completion || settled || completionGraceTimer) return;
      completionDetectedSource = completion.source ?? "completion-check";

      completionGraceTimer = setTimeout(() => {
        void terminateProcessTree(child.pid, () => {
          if (!child.killed) {
            child.kill();
          }
        }).finally(() => {
          void finish(0, completionDetectedSource ?? "completion-check");
        });
      }, completion.graceMs ?? 1500);
    };

    const writeAutoApproveInputs = () => {
      for (const input of options?.autoApprove?.inputs ?? DEFAULT_APPROVAL_INPUTS) {
        child.stdin?.write(input);
      }
    };

    const maybeAutoApprove = (text: string) => {
      const autoApprove = options?.autoApprove;
      if (!autoApprove?.enabled || !child.stdin?.writable) return;

      recentOutput = (recentOutput + text).slice(-4000);
      if (!APPROVAL_PATTERNS.some((pattern) => pattern.test(recentOutput))) {
        return;
      }

      const now = Date.now();
      if (now - lastApprovalAt < 1000) return;
      lastApprovalAt = now;

      writeAutoApproveInputs();

      if (!options?.silent) {
        const label = autoApprove.label ? ` ${autoApprove.label}` : "";
        process.stderr.write(`\n[ralph] Auto-approved${label} prompt.\n`);
      }
    };

    child.stdout?.on("data", (data: Buffer) => {
      if (settled) return;
      const text = data.toString();
      stdout += text;
      stdoutLog?.write(text);
      maybeAutoApprove(text);
      if (!options?.silent) {
        process.stdout.write(text);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      if (settled) return;
      const text = data.toString();
      stderr += text;
      stderrLog?.write(text);
      maybeAutoApprove(text);
      if (!options?.silent) {
        process.stderr.write(text);
      }
    });

    if (options?.stdin && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else if (options?.autoApprove?.enabled && child.stdin) {
      // In programmatic runs, a child waiting on stdin EOF can otherwise keep
      // Ralph blocked even after it has enough approval input to continue.
      writeAutoApproveInputs();
      child.stdin.end();
    }

    child.on("error", async (err) => {
      if (settled) return;
      settled = true;
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (completionGraceTimer) clearTimeout(completionGraceTimer);
      await closeLogStreams(stdoutLog, stderrLog);
      reject(err);
    });

    child.on("exit", (code) => {
      childExitCode = code ?? 1;
    });

    child.on("close", (code) => {
      if (completionDetectedSource) {
        void finish(code === 0 ? 0 : 0, completionDetectedSource);
        return;
      }
      void finish(code ?? 1, "process-close");
    });

    if (options?.completion) {
      completionPollTimer = setInterval(() => {
        if (pollingCompletion || settled) return;
        pollingCompletion = true;
        void options.completion
          ?.isComplete()
          .then((complete) => {
            if (complete) {
              finishFromCompletion();
            }
          })
          .finally(() => {
            pollingCompletion = false;
          });
      }, options.completion.pollMs ?? 500);
    }
  });
}

function closeLogStreams(...streams: Array<WriteStream | undefined>): Promise<void[]> {
  return Promise.all(
    streams.map(
      (stream) =>
        new Promise<void>((resolve) => {
          if (!stream) {
            resolve();
            return;
          }
          stream.end(resolve);
        })
    )
  );
}

function terminateProcessTree(pid: number | undefined, fallback: () => void): Promise<void> {
  if (!pid || process.platform !== "win32") {
    fallback();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => {
      fallback();
      resolve();
    });
    killer.on("close", () => {
      resolve();
    });
  });
}

/**
 * Check if a command is available on the system
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const isWindows = process.platform === "win32";
    const checkCmd = isWindows ? "where" : "which";
    const result = await exec(checkCmd, [command], { silent: true });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
