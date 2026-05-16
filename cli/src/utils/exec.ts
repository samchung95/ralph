import { spawn } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
      const text = data.toString();
      stdout += text;
      maybeAutoApprove(text);
      if (!options?.silent) {
        process.stdout.write(text);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
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

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
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
