import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { CONSTANTS } from '../lib/constants.js';

async function processMdx(file: string): Promise<void> {
  let content = await fs.readFile(file, 'utf-8');

  content = content.replace(/<a[^>]*>.*?<\/a>/g, '');

  content = content
    .split('\n')
    .filter((line) => !line.startsWith('# '))
    .join('\n');

  content = content.replace(/^(## .+) Objects$/gm, '$1');

  content = content.replace(/^####/gm, '###');

  await fs.writeFile(file, content);
}

async function processPackage(
  pkg: string,
  sdkDir: string
): Promise<boolean> {
  const rawName = pkg.split('.').pop() || pkg;
  const name = rawName.replace(/^e2b_/, '');

  console.log(`    → Processing ${pkg}...`);

  const outputFile = path.join(sdkDir, CONSTANTS.SDK_REF_DIR, `${name}${CONSTANTS.MDX_EXTENSION}`);

  try {
    const result = await execa('poetry', ['run', 'pydoc-markdown', '-p', pkg], {
      cwd: sdkDir,
      stdio: 'pipe',
    });

    await fs.writeFile(outputFile, result.stdout);
    await processMdx(outputFile);
    return true;
  } catch {
    console.log(`    ⚠️  Failed to generate docs for ${pkg}`);
    await fs.remove(outputFile);
    return false;
  }
}

export async function generatePydoc(
  sdkDir: string,
  packages: string[],
  submodules?: Record<string, string[]>
): Promise<void> {
  await fs.ensureDir(path.join(sdkDir, CONSTANTS.SDK_REF_DIR));

  console.log('  → Generating documentation for packages...');

  for (const pkg of packages) {
    await processPackage(pkg, sdkDir);
  }

  if (submodules) {
    for (const [parentPkg, submoduleNames] of Object.entries(submodules)) {
      for (const submod of submoduleNames) {
        const fullPkg = `${parentPkg}.${submod}`;
        await processPackage(fullPkg, sdkDir);
      }
    }
  }
}

