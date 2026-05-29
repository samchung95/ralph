#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { runCommand } from "./commands/run.js";
import { bypassCommand } from "./commands/bypass.js";
import { autoApproveCommand } from "./commands/auto-approve.js";
import { validateCommand } from "./commands/validate.js";
import { resetCommand } from "./commands/reset.js";
import { priorityCommand } from "./commands/priority.js";
import { fixCommand } from "./commands/fix.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { TOOL_NAMES } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const program = new Command();

program
  .name("ralph")
  .description(
    "Ralph - Autonomous planner-routed AI agent loop that runs focused agent handoffs until final success criteria pass"
  )
  .version(pkg.version);

program
  .command("init")
  .description(
    "Initialize Ralph in a project (creates progress.txt and a template prd.json)"
  )
  .option("-d, --dir <path>", "Target project directory", process.cwd())
  .option("--force", "Overwrite existing files", false)
  .action(initCommand);

program
  .command("install")
  .description("Install bundled Ralph skills into an AI tool's skills directory")
  .option(
    "--tool <tool>",
    `AI tool to install skills for (${TOOL_NAMES})`,
    "claude"
  )
  .action(installCommand);

program
  .command("bypass")
  .description("Show or set the remembered bypass mode for Codex runs")
  .argument("[value]", "on, off, or status", "status")
  .action(bypassCommand);

program
  .command("auto-approve")
  .description("Show or set remembered auto-approval for Copilot prompts")
  .argument("[value]", "on, off, or status", "status")
  .action(autoApproveCommand);

program
  .command("run")
  .description("Run the Ralph develop/plan agent loop")
  .argument("[cycles]", "Maximum number of develop/plan cycles", "10")
  .option(
    "--tool <tool>",
    `AI tool to use (${TOOL_NAMES})`,
    "claude"
  )
  .option(
    "--dangerously-skip-permissions",
    "Pass --dangerously-skip-permissions to Claude Code",
    false
  )
  .option(
    "--bypass",
    "Use bypass mode for this run (Codex uses full access)",
    undefined
  )
  .option(
    "--no-bypass",
    "Disable bypass mode for this run",
    undefined
  )
  .option(
    "--auto-approve",
    "Auto-approve Copilot prompts for this run",
    undefined
  )
  .option(
    "--no-auto-approve",
    "Disable Copilot auto-approval for this run",
    undefined
  )
  .option("-d, --dir <path>", "Project directory containing prd.json", process.cwd())
  .action(runCommand);

program
  .command("validate")
  .description("Validate the structure of prd.json")
  .option("-d, --dir <path>", "Project directory containing prd.json", process.cwd())
  .option("--silent", "Suppress success output and only fail on invalid PRD", false)
  .option("--priority <level>", "Filter story list to a specific priority: high, medium, or low")
  .action(validateCommand);

program
  .command("reset")
  .description("Archive the current Ralph state and restore a fresh prd.json from the example")
  .option("-d, --dir <path>", "Project directory containing prd.json", process.cwd())
  .action(resetCommand);

program
  .command("priority")
  .description("Set the storyPriority of a user story in prd.json")
  .argument("<storyId>", "ID of the user story to update (e.g. US-001)")
  .argument("<priority>", "New priority: high, medium, or low")
  .option("-d, --dir <path>", "Project directory containing prd.json", process.cwd())
  .action(priorityCommand);

program
  .command("fix")
  .description("Clean stale Ralph artifacts and repair an invalid prd.json in one doctor pass")
  .option(
    "--tool <tool>",
    `AI tool to use (${TOOL_NAMES})`,
    "claude"
  )
  .option("-d, --dir <path>", "Project directory containing prd.json", process.cwd())
  .option(
    "--bypass",
    "Use bypass mode for this run (Codex uses full access)",
    undefined
  )
  .option(
    "--no-bypass",
    "Disable bypass mode for this run",
    undefined
  )
  .option(
    "--auto-approve",
    "Auto-approve Copilot prompts for this run",
    undefined
  )
  .option(
    "--no-auto-approve",
    "Disable Copilot auto-approval for this run",
    undefined
  )
  .action(fixCommand);

program.parse();
