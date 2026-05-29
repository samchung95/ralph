#!/usr/bin/env node

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ENCODINGS = {
  o200k_base: "gpt-tokenizer/encoding/o200k_base",
  cl100k_base: "gpt-tokenizer/encoding/cl100k_base",
  p50k_base: "gpt-tokenizer/encoding/p50k_base",
  r50k_base: "gpt-tokenizer/encoding/r50k_base",
};

const PHASE_PROMPTS = {
  planner: "PLANNER.md",
  developer: "DEVELOPER.md",
  uxui: "UXUI.md",
  documentation: "DOCUMENTATION.md",
  WEB_BROWSER_SAFE: "WEB_BROWSER_SAFE.md",
  WEB_BROWSER_BYPASS: "WEB_BROWSER_BYPASS.md",
};

const TEMPLATE_FILES = [
  "PLANNER.md",
  "DEVELOPER.md",
  "UXUI.md",
  "DOCUMENTATION.md",
  "WEB_BROWSER_SAFE.md",
  "WEB_BROWSER_BYPASS.md",
  "DOCTOR.md",
  "PROGRESS_INSTRUCT.md",
  "prd.json.example",
  path.join("skills", "ralph", "SKILL.md"),
  path.join("skills", "ralph-run", "SKILL.md"),
];

const LIVE_FILES = ["prd.json", "progress.txt"];
const PROGRESS_INSTRUCTIONS_PROMPT = "PROGRESS_INSTRUCT.md";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const tokenizerModule = ENCODINGS[options.encoding];
  if (!tokenizerModule) {
    throw new Error(
      `Unknown encoding '${options.encoding}'. Use one of: ${Object.keys(ENCODINGS).join(", ")}.`
    );
  }

  const { countTokens } = await import(tokenizerModule);
  const count = (text) => countText(text, countTokens);

  const templateFiles = await readFiles(options.templateDir, TEMPLATE_FILES);
  const liveFiles = await readFiles(options.dir, LIVE_FILES);

  const progressInstructions = templateFiles.find(
    (file) => file.relativePath === PROGRESS_INSTRUCTIONS_PROMPT
  );

  const templateRows = templateFiles.map((file) => ({
    label: file.relativePath,
    ...count(file.content),
    detail: relativeFromCwd(file.absolutePath),
  }));

  const liveRows = liveFiles.map((file) => ({
    label: file.relativePath,
    ...count(file.content),
    detail: relativeFromCwd(file.absolutePath),
  }));

  const runtimeRows = [];
  const runtimeWithLiveRows = [];
  const liveContext = joinFileContents(liveFiles);

  for (const [role, promptFile] of Object.entries(PHASE_PROMPTS)) {
    const rolePrompt = templateFiles.find((file) => file.relativePath === promptFile);
    if (!rolePrompt || !progressInstructions) {
      continue;
    }

    const runtimePrompt = composeRuntimePrompt(
      rolePrompt.content,
      progressInstructions.content
    );
    runtimeRows.push({
      label: role,
      ...count(runtimePrompt),
      detail: `${promptFile} + ${PROGRESS_INSTRUCTIONS_PROMPT}`,
    });

    runtimeWithLiveRows.push({
      label: role,
      ...count(`${runtimePrompt}\n\n${liveContext}`),
      detail: `${promptFile} + ${PROGRESS_INSTRUCTIONS_PROMPT} + live files`,
    });
  }

  const allTemplateContent = joinFileContents(templateFiles);
  const allLiveContent = joinFileContents(liveFiles);
  const allTemplateStats = count(allTemplateContent);
  const allLiveStats = count(allLiveContent);
  const allVisibleStats = count(`${allTemplateContent}\n\n${allLiveContent}`);
  const largestRuntime = maxBy(runtimeRows, (row) => row.tokens);
  const largestRuntimeWithLive = maxBy(runtimeWithLiveRows, (row) => row.tokens);

  const output = {
    encoding: options.encoding,
    templateDir: options.templateDir,
    projectDir: options.dir,
    summary: {
      allTemplates: allTemplateStats,
      liveFiles: allLiveStats,
      allTemplatesPlusLiveFiles: allVisibleStats,
      largestInjectedRuntimePrompt: largestRuntime
        ? { role: largestRuntime.label, tokens: largestRuntime.tokens }
        : null,
      largestRuntimePromptPlusLiveFiles: largestRuntimeWithLive
        ? { role: largestRuntimeWithLive.label, tokens: largestRuntimeWithLive.tokens }
        : null,
    },
    templateFiles: templateRows,
    liveFiles: liveRows,
    runtimePrompts: runtimeRows,
    runtimePromptsPlusLiveFiles: runtimeWithLiveRows,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  printReport(output, options.limit);
}

function parseArgs(args) {
  const defaults = {
    dir: process.cwd() === packageDir ? path.resolve(packageDir, "..") : process.cwd(),
    templateDir: path.join(packageDir, "templates"),
    encoding: "o200k_base",
    json: false,
    help: false,
    limit: null,
  };

  const options = { ...defaults };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return args[i];
    };

    if (arg === "--dir" || arg === "-d") {
      options.dir = path.resolve(next());
    } else if (arg === "--template-dir") {
      options.templateDir = path.resolve(next());
    } else if (arg === "--encoding") {
      options.encoding = next();
    } else if (arg === "--limit") {
      const limit = Number(next());
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit must be a positive number.");
      }
      options.limit = limit;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function readFiles(baseDir, relativePaths) {
  const files = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.resolve(baseDir, relativePath);
    if (!existsSync(absolutePath)) {
      continue;
    }
    files.push({
      relativePath,
      absolutePath,
      content: await readFile(absolutePath, "utf8"),
    });
  }

  return files;
}

function countText(text, countTokens) {
  return {
    tokens: countTokens(text),
    chars: [...text].length,
    words: text.trim() === "" ? 0 : text.trim().split(/\s+/u).length,
  };
}

function composeRuntimePrompt(rolePrompt, progressInstructions) {
  return `${rolePrompt.trimEnd()}\n\n---\n\n${progressInstructions.trimEnd()}\n`;
}

function joinFileContents(files) {
  return files
    .map((file) => `--- ${file.relativePath} ---\n${file.content.trimEnd()}`)
    .join("\n\n");
}

function maxBy(items, getValue) {
  let best = null;
  for (const item of items) {
    if (!best || getValue(item) > getValue(best)) {
      best = item;
    }
  }
  return best;
}

function printReport(output, limit) {
  console.log("Ralph Context Token Count");
  console.log(`Encoding: ${output.encoding}`);
  console.log(`Template dir: ${output.templateDir}`);
  console.log(`Project dir: ${output.projectDir}`);
  if (limit) {
    console.log(`Limit: ${limit.toLocaleString()} tokens`);
  }
  console.log("");

  printSummary(output.summary, limit);
  printTable("Composed Runtime Prompts", output.runtimePrompts, limit);
  printTable("Runtime Prompts + Live prd.json/progress.txt", output.runtimePromptsPlusLiveFiles, limit);
  printTable("Template Files", output.templateFiles, limit);
  printTable("Live Files", output.liveFiles, limit);

  console.log("");
  console.log("Note: Ralph injects one composed runtime prompt per phase, not every template at once.");
  console.log("The live-file rows show prd.json/progress.txt if the agent reads them during the phase.");
}

function printSummary(summary, limit) {
  const rows = [
    { label: "All template files", ...summary.allTemplates, detail: "" },
    { label: "Live prd.json/progress.txt", ...summary.liveFiles, detail: "" },
    { label: "All templates + live files", ...summary.allTemplatesPlusLiveFiles, detail: "" },
  ];

  if (summary.largestInjectedRuntimePrompt) {
    rows.push({
      label: `Largest injected phase (${summary.largestInjectedRuntimePrompt.role})`,
      tokens: summary.largestInjectedRuntimePrompt.tokens,
      chars: "",
      words: "",
      detail: "",
    });
  }

  if (summary.largestRuntimePromptPlusLiveFiles) {
    rows.push({
      label: `Largest phase + live files (${summary.largestRuntimePromptPlusLiveFiles.role})`,
      tokens: summary.largestRuntimePromptPlusLiveFiles.tokens,
      chars: "",
      words: "",
      detail: "",
    });
  }

  printTable("Summary", rows, limit);
}

function printTable(title, rows, limit) {
  if (rows.length === 0) {
    console.log(`${title}: no files found`);
    console.log("");
    return;
  }

  const renderedRows = rows.map((row) => ({
    label: row.label,
    tokens: formatNumber(row.tokens),
    percent: limit ? `${((row.tokens / limit) * 100).toFixed(1)}%` : "",
    chars: row.chars === "" ? "" : formatNumber(row.chars),
    words: row.words === "" ? "" : formatNumber(row.words),
    detail: row.detail ?? "",
  }));

  const headers = ["Item", "Tokens", limit ? "% Limit" : null, "Chars", "Words", "Details"].filter(Boolean);
  const keys = ["label", "tokens", limit ? "percent" : null, "chars", "words", "detail"].filter(Boolean);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...renderedRows.map((row) => String(row[keys[index]]).length)
    )
  );

  console.log(title);
  console.log(formatRow(headers, widths));
  console.log(formatRow(widths.map((width) => "-".repeat(width)), widths));
  for (const row of renderedRows) {
    console.log(formatRow(keys.map((key) => row[key]), widths));
  }
  console.log("");
}

function formatRow(values, widths) {
  return values
    .map((value, index) => String(value).padEnd(widths[index]))
    .join("  ");
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function relativeFromCwd(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  return relativePath.startsWith("..") ? filePath : relativePath || ".";
}

function printHelp() {
  console.log(`Usage: npm run token-count -- [options]

Counts Ralph prompt/template tokens with a real GPT tokenizer.

Options:
  -d, --dir <path>          Project directory containing prd.json/progress.txt.
                            Default: repo root when run from cli, otherwise cwd.
      --template-dir <path> Template directory. Default: cli/templates.
      --encoding <name>     o200k_base, cl100k_base, p50k_base, or r50k_base.
                            Default: o200k_base.
      --limit <tokens>      Show each row as a percentage of a context limit.
      --json                Print machine-readable JSON.
  -h, --help                Show this help.

Examples:
  npm run token-count
  npm run token-count -- --dir .. --limit 200000
  npm run token-count -- --encoding cl100k_base --json
`);
}
