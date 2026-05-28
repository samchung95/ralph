import { basename, join } from "path";
import { mkdir } from "fs/promises";
import { copyFileSafe, fileExists } from "./files.js";

export async function archiveRunFiles(
  dir: string,
  label: string,
  filePaths: string[]
): Promise<string> {
  const archiveDir = await createArchiveDir(dir, label);

  for (const filePath of filePaths) {
    if (await fileExists(filePath)) {
      await copyFileSafe(filePath, join(archiveDir, basename(filePath)));
    }
  }

  return archiveDir;
}

export function archiveLabelFromBranch(branchName: string | undefined | null): string {
  return slugifyArchiveLabel(branchName || "run");
}

async function createArchiveDir(dir: string, label: string): Promise<string> {
  const archiveRoot = join(dir, "archive");
  await mkdir(archiveRoot, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  const baseName = `${timestamp}-${slugifyArchiveLabel(label)}`;

  let suffix = 1;
  while (true) {
    const folderName =
      suffix === 1 ? baseName : `${baseName}-${String(suffix).padStart(2, "0")}`;
    const archiveDir = join(archiveRoot, folderName);

    if (!(await fileExists(archiveDir))) {
      await mkdir(archiveDir, { recursive: true });
      return archiveDir;
    }

    suffix += 1;
  }
}

function slugifyArchiveLabel(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "run";
}
