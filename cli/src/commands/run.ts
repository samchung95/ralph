import { resolve, join } from "path";
import { log } from "../utils/log.js";
import { fileExists, readText, writeText, getPackageDir, removePathIfExists } from "../utils/files.js";
import { exec, commandExists } from "../utils/exec.js";
import { readConfig } from "../utils/config.js";
import {
  createAttemptArtifacts,
  ensureRunArtifacts,
  finalizeAttemptArtifacts,
  recordAttemptInvocation,
  type RunArtifactContext,
  type AttemptArtifacts,
} from "../utils/run-artifacts.js";
import { normalizeTool, TOOL_NAMES } from "../types.js";
import { archiveLabelFromBranch, archiveRunFiles } from "../utils/archive.js";
import { validatePrdData, validatePrdFile } from "../utils/prd.js";
import { initialProgressText } from "../utils/progress.js";
import type { RunOptions, Tool } from "../types.js";

const COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
const PROGRESS_INSTRUCTIONS_PROMPT = "PROGRESS_INSTRUCT.md";
const AGENT_PROMPTS = {
  developer: "DEVELOPER.md",
  uxui: "UXUI.md",
  documentation: "DOCUMENTATION.md",
  WEB_BROWSER_SAFE: "WEB_BROWSER_SAFE.md",
  WEB_BROWSER_BYPASS: "WEB_BROWSER_BYPASS.md",
} as const;
const ROLE_PROMPTS = {
  planner: "PLANNER.md",
  ...AGENT_PROMPTS,
} as const;

type AgentRole = keyof typeof AGENT_PROMPTS;
type RunRole = keyof typeof ROLE_PROMPTS;

const AGENT_ROLE_NAMES = Object.keys(AGENT_PROMPTS) as AgentRole[];

interface ToolConfig {
  binary: string;
  runtimePromptFile: string;
  args: (
    dangerouslySkipPermissions: boolean,
    bypass: boolean,
    artifacts?: AttemptArtifacts
  ) => string[];
}

const TOOL_CONFIG: Record<Tool, ToolConfig> = {
  claude: {
    binary: "claude",
    runtimePromptFile: "CLAUDE.md",
    args: (dangerouslySkipPermissions) => {
      const args: string[] = [];
      if (dangerouslySkipPermissions) {
        args.push("--dangerously-skip-permissions");
      }
      args.push("--print");
      return args;
    },
  },
  amp: {
    binary: "amp",
    runtimePromptFile: "prompt.md",
    args: () => ["--dangerously-allow-all"],
  },
  copilot: {
    binary: "copilot",
    runtimePromptFile: "AGENTS.md",
    args: () => [
      "--allow-all",
      "--autopilot",
      "--no-ask-user",
      "--prompt",
      "Read_AGENTS.md_and_execute_the_Ralph_phase_instructions.",
    ],
  },
  codex: {
    binary: "codex",
    runtimePromptFile: "AGENTS.md",
    args: (_dangerouslySkipPermissions, bypass, artifacts) => {
      const args = bypass
        ? ["exec", "--dangerously-bypass-approvals-and-sandbox"]
        : ["exec", "--full-auto"];
      if (artifacts?.codexLastMessage) {
        args.push("--output-last-message", artifacts.codexLastMessage);
      }
      args.push("-");
      return args;
    },
  },
};

/**
 * `ralph run [cycles]` — TypeScript port of ralph.sh.
 *
 * Spawns fresh AI tool instances in a planner-routed role loop.
 * Each cycle runs the planner first, then the agent selected in
 * `planning.activeHandoff.agent`. The role prompt and shared progress
 * instructions are written to the tool-specific runtime prompt file
 * before each run. Loops until the planner completes the PRD's final success
 * criteria, with the completion promise used as an additional explicit signal.
 */
export async function runCommand(
  cycles: string,
  options: RunOptions
): Promise<void> {
  const maxCycles = parseInt(cycles, 10);
  const tool = normalizeTool(options.tool);
  const dir = resolve(options.dir);
  const dangerouslySkipPermissions = options.dangerouslySkipPermissions;
  const config = await readConfig();
  const bypass = options.bypass ?? config.bypass;
  const copilotAutoApprove =
    options.autoApprove ?? config.copilotAutoApprove;

  if (!tool) {
    log.error(`Invalid tool '${options.tool}'. Must be one of: ${TOOL_NAMES}.`);
    process.exit(1);
  }

  if (Number.isNaN(maxCycles) || maxCycles < 1) {
    log.error("Cycles must be a positive number.");
    process.exit(1);
  }

  const toolConfig = TOOL_CONFIG[tool];

  // ── Validate tool is installed ──────────────────────────────────────────
  if (!(await commandExists(toolConfig.binary))) {
    log.error(
      `${toolConfig.binary} is not installed or not on PATH. Install it first.`
    );
    process.exit(1);
  }

  // ── Validate required files exist ──────────────────────────────────────
  const prdPath = join(dir, "prd.json");
  const progressPath = join(dir, "progress.txt");
  const lastBranchPath = join(dir, ".last-branch");
  const templateDir = join(getPackageDir(), "templates");
  const rolePrompts = {} as Record<RunRole, string>;

  for (const [role, promptFile] of Object.entries(ROLE_PROMPTS) as [
    RunRole,
    string
  ][]) {
    const templatePath = join(templateDir, promptFile);
    if (!(await fileExists(templatePath))) {
      log.error(`Template ${promptFile} not found in Ralph package at ${templatePath}`);
      process.exit(1);
    }
    rolePrompts[role] = await readText(templatePath);
  }

  const progressInstructionsPath = join(templateDir, PROGRESS_INSTRUCTIONS_PROMPT);
  if (!(await fileExists(progressInstructionsPath))) {
    log.error(
      `Template ${PROGRESS_INSTRUCTIONS_PROMPT} not found in Ralph package at ${progressInstructionsPath}`
    );
    process.exit(1);
  }
  const progressInstructions = await readText(progressInstructionsPath);

  if (!(await fileExists(prdPath))) {
    log.error(`prd.json not found in ${dir}`);
    log.info("Create a prd.json with finalSuccessCriteria. The /ralph skill can scaffold it.");
    process.exit(1);
  }

  await warnIfMissingFinalSuccessCriteria(prdPath);
  await validatePrdOrExit(prdPath, "run startup");
  if (await finalSuccessCriteriaPasses(prdPath)) {
    console.log("");
    log.success("Ralph final success criteria already pass!");
    log.info("No develop/plan cycles needed.");
    process.exit(0);
  }

  // ── Archive previous run if branch changed ─────────────────────────────
  if (await fileExists(lastBranchPath)) {
    try {
      const prdContent = JSON.parse(await readText(prdPath));
      const currentBranch: string = prdContent.branchName ?? "";
      const lastBranch = (await readText(lastBranchPath)).trim();

      if (currentBranch && lastBranch && currentBranch !== lastBranch) {
        log.info(`Archiving previous run: ${lastBranch}`);
        const archiveDir = await archiveRunFiles(dir, archiveLabelFromBranch(lastBranch), [
          prdPath,
          progressPath,
        ]);
        log.info(`   Archived to: ${archiveDir}`);

        // Reset progress file for new run
        await writeText(progressPath, initialProgressText(await readProgressSeed(prdPath)));
      }
    } catch {
      // prd.json parse error — skip archiving
    }
  }

  // ── Track current branch ──────────────────────────────────────────────
  try {
    const prdContent = JSON.parse(await readText(prdPath));
    const currentBranch: string = prdContent.branchName ?? "";
    if (currentBranch) {
      await writeText(lastBranchPath, currentBranch);
    }
  } catch {
    // prd.json parse error — skip branch tracking
  }

  // ── Initialize progress file if it doesn't exist ──────────────────────
  if (!(await fileExists(progressPath))) {
    await writeText(progressPath, initialProgressText(await readProgressSeed(prdPath)));
  }

  const runArtifacts = await ensureRunArtifacts({ prdPath, projectDir: dir });
  await validatePrdOrExit(prdPath, "run artifact initialization");

  // ── Run the loop ──────────────────────────────────────────────────────
  log.header(`Starting Ralph — Tool: ${tool} — Max cycles: ${maxCycles}`);
  if (bypass) {
    if (tool === "codex") {
      log.warn("Bypass is on: Codex will run with full access and no approvals.");
    } else {
      log.info(`Bypass is on, but it only changes Codex runs. Current tool: ${tool}`);
    }
  }
  if (copilotAutoApprove) {
    if (tool === "copilot") {
      log.warn("Copilot auto-approve is on: approval prompts will be answered automatically.");
    } else {
      log.info(`Copilot auto-approve is on, but current tool is ${tool}.`);
    }
  }

  for (let i = 1; i <= maxCycles; i++) {
    await validatePrdOrExit(prdPath, `cycle ${i} start`);

    log.iteration(i, maxCycles, `${tool} planner`);

    const planResult = await runRole(
      tool,
      dir,
      "planner",
      composePrompt(rolePrompts.planner, progressInstructions),
      dangerouslySkipPermissions,
      bypass,
      copilotAutoApprove,
      runArtifacts,
      i
    );

    await validatePrdOrExit(prdPath, `planner phase ${i}`);

    if (await plannerCompleted(prdPath, planResult)) {
      console.log("");
      log.success("Ralph completed the final success criteria!");
      log.info(`Completed during planner phase of cycle ${i} of ${maxCycles}`);
      process.exit(0);
    }

    const selectedAgent = await readActiveHandoffAgentOrExit(prdPath);
    log.info(`Planner selected ${selectedAgent}. Running assigned handoff...`);

    log.iteration(i, maxCycles, `${tool} ${selectedAgent}`);

    const agentResult = await runRole(
      tool,
      dir,
      selectedAgent,
      composePrompt(rolePrompts[selectedAgent], progressInstructions),
      dangerouslySkipPermissions,
      bypass,
      copilotAutoApprove,
      runArtifacts,
      i
    );

    if (hasCompletionSignalLine(agentResult)) {
      log.warn(
        `${selectedAgent} emitted the completion signal. Ignoring it; only the planner can complete Ralph.`
      );
    }

    await validatePrdOrExit(prdPath, `${selectedAgent} phase ${i}`);

    log.info(`${selectedAgent} phase ${i} complete. Returning to planner...`);

    // Small pause between cycles
    if (i < maxCycles) {
      await sleep(2000);
    }
  }

  console.log("");
  log.warn(
    `Ralph reached max cycles (${maxCycles}) without meeting the final success criteria.`
  );
  log.info(`Check ${progressPath} for status.`);
  process.exit(1);
}

/**
 * Run a single role — write the merged role prompt to the tool's expected
 * runtime prompt file, then spawn the AI tool with that prompt piped to stdin.
 * Streams output to the terminal in real-time and returns the full output.
 * Cleans up or restores the runtime prompt file after execution.
 */
async function runRole(
  tool: Tool,
  dir: string,
  role: RunRole,
  prompt: string,
  dangerouslySkipPermissions: boolean,
  bypass: boolean,
  copilotAutoApprove: boolean,
  runArtifacts: RunArtifactContext,
  cycle: number
): Promise<string> {
  const toolConfig = TOOL_CONFIG[tool];
  const runtimePromptPath = join(dir, toolConfig.runtimePromptFile);
  const attempt = await createAttemptArtifacts(runArtifacts, { cycle, role, tool });

  const previousContent = (await fileExists(runtimePromptPath))
    ? await readText(runtimePromptPath)
    : null;

  await writeText(runtimePromptPath, prompt);
  await writeText(attempt.artifacts.prompt, prompt);
  log.info(
    `Loaded ${ROLE_PROMPTS[role]} + ${PROGRESS_INSTRUCTIONS_PROMPT} into ${toolConfig.runtimePromptFile}`
  );

  const args = toolConfig.args(dangerouslySkipPermissions, bypass, attempt.artifacts);
  await recordAttemptInvocation(attempt, {
    command: toolConfig.binary,
    args,
  });

  let result: { stdout: string; stderr: string; exitCode: number; completionSource: string };
  const codexLastMessage = attempt.artifacts.codexLastMessage;
  try {
    result = await exec(
      toolConfig.binary,
      args,
      {
        cwd: dir,
        stdin: tool === "copilot" ? undefined : prompt,
        autoApprove:
          tool === "copilot"
            ? {
                enabled: copilotAutoApprove,
                label: "Copilot",
              }
            : undefined,
        stdoutPath: attempt.artifacts.stdout,
        stderrPath: attempt.artifacts.stderr,
        completion:
          tool === "codex" && codexLastMessage
            ? {
                isComplete: async () =>
                  (await fileExists(codexLastMessage)) &&
                  (await roleReachedDurableCompletion(runArtifacts.prdPath, role)),
                source: "codex-last-message+prd-state",
              }
            : undefined,
      }
    );
    await finalizeAttemptArtifacts(attempt, {
      exitCode: result.exitCode,
      completionSource: result.completionSource,
    });
  } catch (error) {
    await finalizeAttemptArtifacts(attempt, {
      error,
      completionSource: "process-error",
    });
    throw error;
  } finally {
    await restoreOrRemovePromptFile(runtimePromptPath, previousContent);
  }

  return result.stdout + result.stderr;
}

async function warnIfMissingFinalSuccessCriteria(prdPath: string): Promise<void> {
  try {
    const prd = JSON.parse(await readText(prdPath));
    if (!prd.finalSuccessCriteria) {
      log.warn(
        "prd.json has no finalSuccessCriteria. The planner phase should migrate it before the loop can complete."
      );
    }
  } catch {
    log.warn("Could not parse prd.json. The agent will need to fix it before continuing.");
  }
}

async function roleReachedDurableCompletion(prdPath: string, role: RunRole): Promise<boolean> {
  try {
    const prd = JSON.parse(await readText(prdPath)) as {
      finalSuccessCriteria?: { passes?: boolean };
      planning?: {
        activeHandoff?: {
          agent?: string;
          status?: string;
        };
      };
    };
    if (!validatePrdData(prd).valid) {
      return false;
    }

    if (role === "planner") {
      if (prd.finalSuccessCriteria?.passes === true) {
        return true;
      }
      const handoff = prd.planning?.activeHandoff;
      return Boolean(
        handoff?.agent && isAgentRole(handoff.agent) && handoff.status === "ready"
      );
    }

    const status = prd.planning?.activeHandoff?.status;
    return status === "complete" || status === "blocked";
  } catch {
    return false;
  }
}

async function validatePrdOrExit(prdPath: string, context: string): Promise<void> {
  const validation = await validatePrdFile(prdPath);
  if (validation.valid) {
    return;
  }

  log.error(`prd.json failed validation after ${context}.`);
  for (const error of validation.errors) {
    log.step(error);
  }
  process.exit(1);
}

function composePrompt(rolePrompt: string, progressInstructions: string): string {
  return `${rolePrompt.trimEnd()}\n\n---\n\n${progressInstructions.trimEnd()}\n`;
}

async function readActiveHandoffAgentOrExit(prdPath: string): Promise<AgentRole> {
  try {
    const prd = JSON.parse(await readText(prdPath)) as {
      planning?: {
        activeHandoff?: {
          agent?: string;
          status?: string;
        };
      };
    };
    const handoff = prd.planning?.activeHandoff;
    const agent = handoff?.agent;
    if (agent && isAgentRole(agent)) {
      if (handoff?.status !== "ready" && handoff?.status !== "active") {
        log.error(
          `planning.activeHandoff.status must be "ready" or "active" before an agent can run; got "${handoff?.status ?? "missing"}".`
        );
        process.exit(1);
      }
      return agent;
    }

    log.error(
      `Planner did not set planning.activeHandoff.agent to one of: ${AGENT_ROLE_NAMES.join(", ")}.`
    );
    process.exit(1);
  } catch (error) {
    log.error(
      `Could not read planning.activeHandoff.agent from prd.json: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLE_NAMES as readonly string[]).includes(value);
}

async function plannerCompleted(prdPath: string, output: string): Promise<boolean> {
  const emittedCompletionSignal = hasCompletionSignalLine(output);

  try {
    const prd = JSON.parse(await readText(prdPath));
    if (prd.finalSuccessCriteria?.passes === true) {
      if (!emittedCompletionSignal) {
        log.info(
          "prd.json has finalSuccessCriteria.passes=true after the planner phase; completing even though the exact completion signal was not emitted."
        );
      }
      return true;
    }

    if (emittedCompletionSignal) {
      log.warn(
        "Planner emitted the completion signal, but prd.json still has finalSuccessCriteria.passes != true. Ignoring completion."
      );
    }
    return false;
  } catch {
    if (emittedCompletionSignal) {
      log.warn(
        "Planner emitted the completion signal, but prd.json could not be parsed afterward. Ignoring completion."
      );
    }
    return false;
  }
}

async function readProgressSeed(prdPath: string): Promise<{
  goal?: string;
  branch?: string;
  cycle?: number;
  currentObjective?: string;
}> {
  try {
    const prd = JSON.parse(await readText(prdPath)) as {
      branchName?: string;
      finalSuccessCriteria?: { description?: string };
      planning?: { cycle?: number; currentObjective?: string };
    };
    return {
      goal: prd.finalSuccessCriteria?.description,
      branch: prd.branchName,
      cycle: prd.planning?.cycle,
      currentObjective: prd.planning?.currentObjective,
    };
  } catch {
    return {};
  }
}

async function finalSuccessCriteriaPasses(prdPath: string): Promise<boolean> {
  try {
    const prd = JSON.parse(await readText(prdPath));
    return validatePrdData(prd).valid && prd.finalSuccessCriteria?.passes === true;
  } catch {
    return false;
  }
}

function hasCompletionSignalLine(output: string): boolean {
  return stripAnsi(output)
    .split(/\r?\n/)
    .some((line) => line.trim() === COMPLETION_SIGNAL);
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After a phase, restore the runtime prompt file to its previous content
 * (if it existed before) or delete it (if Ralph created it).
 */
async function restoreOrRemovePromptFile(
  runtimePromptPath: string,
  previousContent: string | null
): Promise<void> {
  if (previousContent !== null) {
    await writeText(runtimePromptPath, previousContent);
  } else {
    await removePathIfExists(runtimePromptPath);
  }
}
