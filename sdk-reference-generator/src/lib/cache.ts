import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import type { GeneratorType } from '../types.js';

const LOCKFILES: Record<GeneratorType, string[]> = {
  typedoc: ['pnpm-lock.yaml', 'package-lock.json'],
  cli: ['pnpm-lock.yaml', 'package-lock.json'],
  pydoc: ['poetry.lock'],
};

async function findLockfileUp(
  dir: string,
  filename: string
): Promise<string | null> {
  let current = dir;

  while (current !== '/' && current !== '.') {
    const lockPath = path.join(current, filename);
    if (await fs.pathExists(lockPath)) {
      return lockPath;
    }
    current = path.dirname(current);
  }

  return null;
}

export async function hashLockfile(
  sdkDir: string,
  generator: GeneratorType
): Promise<string | null> {
  const lockfiles = LOCKFILES[generator];

  for (const filename of lockfiles) {
    const lockPath = await findLockfileUp(sdkDir, filename);
    if (lockPath) {
      const content = await fs.readFile(lockPath, 'utf-8');
      return createHash('md5').update(content).digest('hex');
    }
  }

  return null;
}

export async function isCached(
  hash: string,
  generator: GeneratorType,
  tempDir: string
): Promise<boolean> {
  const marker = path.join(tempDir, '.deps-cache', `${generator}-${hash}`, '.installed');
  return fs.pathExists(marker);
}

export async function markCached(
  hash: string,
  generator: GeneratorType,
  tempDir: string
): Promise<void> {
  const marker = path.join(tempDir, '.deps-cache', `${generator}-${hash}`, '.installed');
  await fs.ensureDir(path.dirname(marker));
  await fs.writeFile(marker, '');
}

