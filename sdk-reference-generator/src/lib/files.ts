import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { createFrontmatter } from './utils.js';
import { CONSTANTS } from './constants.js';

export function toTitleCase(str: string): string {
  if (!str) return '';

  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function addFrontmatter(
  file: string,
  title: string
): Promise<void> {
  const content = await fs.readFile(file, 'utf-8');

  if (content.startsWith('---')) {
    return;
  }

  await fs.writeFile(file, createFrontmatter(title) + content);
}

export async function flattenMarkdown(refDir: string): Promise<void> {
  await fs.remove(path.join(refDir, 'README.md'));
  await fs.remove(path.join(refDir, 'index.md'));

  const nestedFiles = await glob('**/*.md', {
    cwd: refDir,
    ignore: '*.md',
  });

  for (const file of nestedFiles) {
    const filename = path.basename(file);
    const dirName = path.basename(path.dirname(file));

    let targetName: string;
    if (filename === 'page.md' || filename === 'index.md') {
      targetName = `${dirName}.md`;
    } else {
      targetName = filename;
    }

    const sourcePath = path.join(refDir, file);
    const targetPath = path.join(refDir, targetName);

    await fs.move(sourcePath, targetPath, { overwrite: true });
  }

  const dirs = await glob('**/', { cwd: refDir });
  for (const dir of dirs.reverse()) {
    const dirPath = path.join(refDir, dir);
    try {
      const files = await fs.readdir(dirPath);
      if (files.length === 0) {
        await fs.remove(dirPath);
      }
    } catch {
      // ignore
    }
  }

  const mdFiles = await glob('*.md', { cwd: refDir });

  for (const file of mdFiles) {
    const fullPath = path.join(refDir, file);
    const title = toTitleCase(path.basename(file, CONSTANTS.MD_EXTENSION));
    const content = await fs.readFile(fullPath, 'utf-8');

    const mdxPath = fullPath.replace(CONSTANTS.MD_EXTENSION, CONSTANTS.MDX_EXTENSION);
    await fs.writeFile(mdxPath, createFrontmatter(title) + content);
    await fs.remove(fullPath);
  }

  const mdxFiles = await glob(`*${CONSTANTS.MDX_EXTENSION}`, { cwd: refDir });

  for (const file of mdxFiles) {
    const fullPath = path.join(refDir, file);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (!content.startsWith('---')) {
      const title = toTitleCase(path.basename(file, CONSTANTS.MDX_EXTENSION));
      await addFrontmatter(fullPath, title);
    }
  }

  await fs.remove(path.join(refDir, `index${CONSTANTS.MDX_EXTENSION}`));
}

export async function validateMdxFiles(srcDir: string): Promise<number> {
  await fs.remove(path.join(srcDir, `*${CONSTANTS.MDX_EXTENSION}`));

  const files = await glob(`*${CONSTANTS.MDX_EXTENSION}`, { cwd: srcDir });

  let validCount = 0;
  for (const file of files) {
    if (file === `*${CONSTANTS.MDX_EXTENSION}`) continue;

    const fullPath = path.join(srcDir, file);
    const stat = await fs.stat(fullPath);

    if (stat.size === 0) continue;

    validCount++;
  }

  return validCount;
}

export async function copyToDocs(
  srcDir: string,
  destDir: string,
  sdkName: string,
  version: string
): Promise<boolean> {
  const count = await validateMdxFiles(srcDir);

  if (count === 0) {
    console.log('  ❌ No MDX files generated - doc generator failed');
    return false;
  }

  await fs.ensureDir(destDir);

  console.log(`  → Copying ${count} files to ${destDir}`);

  const files = await glob(`*${CONSTANTS.MDX_EXTENSION}`, { cwd: srcDir });

  for (const file of files) {
    if (file === `*${CONSTANTS.MDX_EXTENSION}`) continue;

    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    const stat = await fs.stat(srcPath);

    if (stat.size > 0) {
      await fs.copy(srcPath, destPath);
    }
  }

  console.log(`  ✅ ${sdkName} ${version} complete`);
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

