import { join } from "path";
import { homedir } from "os";
import {
  copyFileSafe,
  fileExists,
  getPackageDir,
  removePathIfExists,
} from "../utils/files.js";
import { log } from "../utils/log.js";
import { mkdir, readdir } from "fs/promises";
import { normalizeTool, TOOL_NAMES } from "../types.js";
import type { InstallOptions, Tool } from "../types.js";

const SKILL_DIRS: Record<Tool, string> = {
  claude: join(homedir(), ".claude", "skills"),
  amp: join(homedir(), ".config", "amp", "skills"),
  copilot: join(homedir(), ".copilot", "skills"),
  codex: join(homedir(), ".agents", "skills"),
};

/**
 * `ralph install` — Install the Ralph setup skill into a supported AI tool's skills directory.
 */
export async function installCommand(options: InstallOptions): Promise<void> {
  log.header("Ralph Install Skills");

  const tool = normalizeTool(options.tool);
  if (!tool) {
    log.error(`Invalid tool '${options.tool}'. Must be one of: ${TOOL_NAMES}.`);
    process.exit(1);
  }

  const templateDir = join(getPackageDir(), "templates", "skills");
  const skillsDir = SKILL_DIRS[tool];

  await mkdir(skillsDir, { recursive: true });

  // Read available skills from the templates
  const skills = await readdir(templateDir, { withFileTypes: true });

  const installedSkills: string[] = [];

  for (const entry of skills) {
    if (!entry.isDirectory()) continue;

    const skillName = entry.name;
    const srcSkillDir = join(templateDir, skillName);
    const destSkillDir = join(skillsDir, skillName);

    // Copy SKILL.md from each skill directory
    const srcSkillFile = join(srcSkillDir, "SKILL.md");
    const destSkillFile = join(destSkillDir, "SKILL.md");

    if (await fileExists(srcSkillFile)) {
      if (await fileExists(destSkillDir)) {
        await removePathIfExists(destSkillDir);
        log.info(`Removed existing skill: ${destSkillDir}`);
      }

      await copyFileSafe(srcSkillFile, destSkillFile);
      log.success(`Installed skill: ${skillName} → ${destSkillDir}`);
      installedSkills.push(skillName);
    }
  }

  console.log("");
  log.info(`Skills installed to ${skillsDir}`);
  log.info("Available skills:");
  for (const skillName of installedSkills.sort()) {
    log.step(`/${skillName} — ${skillSummary(skillName)}`);
  }
}

function skillSummary(skillName: string): string {
  if (skillName === "ralph") {
    return "Expand the request and set up planner-routed prd.json/progress.txt";
  }

  if (skillName === "ralph-run") {
    return "Run and monitor Ralph like a project manager";
  }

  return "Installed Ralph skill";
}
