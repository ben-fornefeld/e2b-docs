import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import { createFrontmatter } from "./utils.js";
import { CONSTANTS } from "./constants.js";
import { log } from "./log.js";

export function toTitleCase(str: string): string {
  if (!str) return "";

  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extracts a clean title from a flattened filename.
 * Removes directory prefixes added during flattening.
 *
 * @example
 * extractTitle('modules-Sandbox') // 'Sandbox'
 * extractTitle('classes-MyClass') // 'MyClass'
 * extractTitle('sandbox_sync') // 'Sandbox Sync'
 * extractTitle('modules-sandbox_sync') // 'Sandbox Sync'
 */
export function extractTitle(filename: string): string {
  if (!filename) return "";

  const prefixMatch = filename.match(/^([a-z]+-)+(.+)$/);

  if (prefixMatch) {
    const withoutPrefix = prefixMatch[2];
    return toTitleCase(withoutPrefix);
  }

  return toTitleCase(filename);
}

export async function addFrontmatter(
  file: string,
  title: string
): Promise<void> {
  const content = await fs.readFile(file, "utf-8");

  if (content.startsWith("---")) {
    return;
  }

  await fs.writeFile(file, createFrontmatter(title) + content);
}

async function removeUnwantedFiles(refDir: string): Promise<void> {
  await fs.remove(path.join(refDir, "README.md"));
  await fs.remove(path.join(refDir, "index.md"));
  await fs.remove(path.join(refDir, `index${CONSTANTS.MDX_EXTENSION}`));
}

async function flattenNestedFiles(refDir: string): Promise<void> {
  const nestedFiles = await glob("**/*.md", {
    cwd: refDir,
    ignore: "*.md",
  });

  const targetFiles = new Set<string>();
  const collisions: string[] = [];

  for (const file of nestedFiles) {
    const filename = path.basename(file);
    const parentDirName = path.basename(path.dirname(file));
    const dirPath = path.dirname(file).replace(/\//g, "-");

    let targetName: string;

    if (filename === "page.md" || filename === "index.md") {
      targetName = `${parentDirName}.md`;
    } else {
      const baseName = path.basename(filename, ".md");
      targetName = `${dirPath}-${baseName}.md`;
    }

    if (targetFiles.has(targetName)) {
      collisions.push(`${file} → ${targetName}`);
    }
    targetFiles.add(targetName);

    await fs.move(path.join(refDir, file), path.join(refDir, targetName), {
      overwrite: false,
    });
  }

  if (collisions.length > 0) {
    log.warn(`Detected ${collisions.length} filename collision(s):`, 1);
    collisions.forEach((c) => log.data(c, 2));
  }
  }

async function removeEmptyDirectories(refDir: string): Promise<void> {
  const dirs = await glob("**/", { cwd: refDir });
  for (const dir of dirs.reverse()) {
    const dirPath = path.join(refDir, dir);
    try {
      const files = await fs.readdir(dirPath);
      if (files.length === 0) {
        await fs.remove(dirPath);
      }
    } catch {}
  }
  }

async function convertMdToMdx(refDir: string): Promise<void> {
  const mdFiles = await glob("*.md", { cwd: refDir });

  for (const file of mdFiles) {
    const fullPath = path.join(refDir, file);
    const title = extractTitle(path.basename(file, CONSTANTS.MD_EXTENSION));
    const content = await fs.readFile(fullPath, "utf-8");

    const mdxPath = fullPath.replace(
      CONSTANTS.MD_EXTENSION,
      CONSTANTS.MDX_EXTENSION
    );
    await fs.writeFile(mdxPath, createFrontmatter(title) + content);
    await fs.remove(fullPath);
  }
  }

async function ensureFrontmatter(refDir: string): Promise<void> {
  const mdxFiles = await glob(`*${CONSTANTS.MDX_EXTENSION}`, { cwd: refDir });

  for (const file of mdxFiles) {
    const fullPath = path.join(refDir, file);
    const content = await fs.readFile(fullPath, "utf-8");

    if (!content.startsWith("---")) {
      const title = extractTitle(path.basename(file, CONSTANTS.MDX_EXTENSION));
      await addFrontmatter(fullPath, title);
    }
  }
}

export async function flattenMarkdown(refDir: string): Promise<void> {
  await removeUnwantedFiles(refDir);
  await flattenNestedFiles(refDir);
  await removeEmptyDirectories(refDir);
  await convertMdToMdx(refDir);
  await ensureFrontmatter(refDir);
}

async function getNonEmptyMdxFiles(dir: string): Promise<string[]> {
  const allFiles = await glob(`*${CONSTANTS.MDX_EXTENSION}`, { cwd: dir });
  const nonEmptyFiles: string[] = [];

  for (const file of allFiles) {
    const stat = await fs.stat(path.join(dir, file));
    if (stat.size > 0) {
      nonEmptyFiles.push(file);
    }
  }

  return nonEmptyFiles;
}

export async function copyToDocs(
  srcDir: string,
  destDir: string,
  sdkName: string,
  version: string
): Promise<boolean> {
  const files = await getNonEmptyMdxFiles(srcDir);

  if (files.length === 0) {
    log.error("No MDX files generated - doc generator failed", 1);
    return false;
  }

  await fs.ensureDir(destDir);
  log.info(`Copying ${files.length} files to ${destDir}`, 1);

  for (const file of files) {
    await fs.copy(path.join(srcDir, file), path.join(destDir, file));
  }

  log.success(`${sdkName} ${version} complete`, 1);
  return true;
}

export async function locateSDKDir(
  repoDir: string,
  sdkPath?: string,
  sdkPaths?: string[]
): Promise<string | null> {
  if (sdkPath) {
    const dir = path.join(repoDir, sdkPath);
    if (await fs.pathExists(dir)) {
      return dir;
    }
    return null;
  }

  if (sdkPaths) {
    for (const p of sdkPaths) {
      const dir = path.join(repoDir, p);
      if (await fs.pathExists(dir)) {
        return dir;
      }
    }
    return null;
  }

  return repoDir;
}
