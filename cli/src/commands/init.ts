import { join, resolve } from "path";
import {
  copyFileSafe,
  fileExists,
  getPackageDir,
  writeText,
} from "../utils/files.js";
import { log } from "../utils/log.js";
import { initialProgressText } from "../utils/progress.js";
import type { InitOptions } from "../types.js";

/**
 * `ralph init` — Create progress.txt and a template prd.json.
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const dir = resolve(options.dir);

  log.header("Ralph Init");
  log.info(`Target directory: ${dir}`);

  const prdPath = join(dir, "prd.json");
  const templatePath = join(getPackageDir(), "templates", "prd.json.example");
  const progressPath = join(dir, "progress.txt");

  if (!(await fileExists(templatePath))) {
    log.error(`Could not find bundled PRD template at ${templatePath}`);
    process.exit(1);
  }

  if ((await fileExists(prdPath)) && !options.force) {
    log.warn("prd.json already exists. Use --force to overwrite.");
  } else {
    await copyFileSafe(templatePath, prdPath);
    log.success("Created prd.json from bundled template");
  }

  if ((await fileExists(progressPath)) && !options.force) {
    log.warn("progress.txt already exists. Use --force to overwrite.");
  } else {
    await writeText(progressPath, initialProgressText());
    log.success("Created progress.txt");
  }

  console.log("");
  log.info("Next steps:");
  log.step("1. Replace the template values in prd.json with your feature's finalSuccessCriteria and planner context");
  log.step("2. Run `ralph validate` to check the PRD shape");
  log.step("3. Run `ralph run [cycles]` to start the planner-routed agent loop");
}
