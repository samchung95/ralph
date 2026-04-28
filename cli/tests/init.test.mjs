import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), "dist", "index.js");
const templatePath = join(process.cwd(), "templates", "prd.json.example");

test("init creates progress.txt and prd.json from the bundled template", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ralph-init-"));

  try {
    await execFileAsync(process.execPath, [cliPath, "init", "--dir", dir]);

    const [actualPrd, expectedPrd, progress] = await Promise.all([
      readFile(join(dir, "prd.json"), "utf8"),
      readFile(templatePath, "utf8"),
      readFile(join(dir, "progress.txt"), "utf8"),
    ]);

    assert.equal(actualPrd, expectedPrd);
    assert.match(progress, /Ralph Progress/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init preserves an existing prd.json unless force is used", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ralph-init-"));
  const customPrd = "{\n  \"custom\": true\n}\n";

  try {
    await writeFile(join(dir, "prd.json"), customPrd, "utf8");

    await execFileAsync(process.execPath, [cliPath, "init", "--dir", dir]);
    assert.equal(await readFile(join(dir, "prd.json"), "utf8"), customPrd);

    await execFileAsync(process.execPath, [
      cliPath,
      "init",
      "--dir",
      dir,
      "--force",
    ]);
    assert.equal(
      await readFile(join(dir, "prd.json"), "utf8"),
      await readFile(templatePath, "utf8")
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
