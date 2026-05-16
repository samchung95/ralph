import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const cliRoot = process.cwd();
const repoRoot = join(cliRoot, "..");
const packageJsonPath = join(cliRoot, "package.json");
const rootPackageJsonPath = join(repoRoot, "package.json");
const workflowPath = join(repoRoot, ".github", "workflows", "npm-release.yml");
const cliNpmIgnorePath = join(cliRoot, ".npmignore");

test("package metadata supports npm publishing and git dependency installs", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(packageJson.name, "@samuelchung/ralph-cli");
  assert.equal(packageJson.publishConfig?.access, "public");
  assert.equal(packageJson.scripts?.prepare, "npm run build");
  assert.equal(packageJson.scripts?.test, "node --test tests/*.test.mjs");
  assert.match(packageJson.scripts?.prepublishOnly ?? "", /typecheck/);
  assert.match(packageJson.scripts?.prepublishOnly ?? "", /build/);
  assert.match(packageJson.scripts?.prepublishOnly ?? "", /npm test/);
});

test("repository root exposes the built CLI for GitHub dependency installs", async () => {
  const [rootPackageJson, cliPackageJson] = await Promise.all([
    readFile(rootPackageJsonPath, "utf8").then(JSON.parse),
    readFile(packageJsonPath, "utf8").then(JSON.parse),
  ]);

  assert.equal(rootPackageJson.private, true);
  assert.equal(rootPackageJson.name, cliPackageJson.name);
  assert.equal(rootPackageJson.version, cliPackageJson.version);
  assert.equal(rootPackageJson.type, "module");
  assert.equal(rootPackageJson.bin?.ralph, "cli/dist/index.js");
  assert.equal(
    rootPackageJson.scripts?.prepare,
    "npm --prefix cli ci && npm --prefix cli run build"
  );
  assert.deepEqual(rootPackageJson.dependencies, cliPackageJson.dependencies);
  assert.ok(rootPackageJson.files?.includes("cli/dist"));
  assert.ok(rootPackageJson.files?.includes("cli/templates"));
});

test("nested npm ignore keeps built dist eligible for root GitHub package", async () => {
  const npmIgnore = await readFile(cliNpmIgnorePath, "utf8");
  const ignoredEntries = npmIgnore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(ignoredEntries.includes("node_modules"));
  assert.equal(ignoredEntries.includes("dist"), false);
});

test("npm release workflow validates release tags and staging branches before publish", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(workflow, /branches:\s*\n\s*- "staging\/v\*\.\*\.\*-.*"/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /node-version:\s*"24"/);
  assert.match(workflow, /package-manager-cache:\s*false/);
  assert.doesNotMatch(workflow, /cache-dependency-path/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run pack:dry-run/);
  assert.match(workflow, /expected="v\$\{version\}"/);
  assert.match(workflow, /\[\[ "\$\{ref_name\}" != "\$\{expected\}" \]\]/);
  assert.match(workflow, /npm publish --access public/);
  assert.match(workflow, /if:\s*\$\{\{\s*github\.ref_type == 'tag' && startsWith\(github\.ref_name, 'v'\)\s*\}\}/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/);
});
