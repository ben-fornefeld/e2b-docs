import { execa } from 'execa';
import type { GeneratorType } from '../types.js';
import { hashLockfile, isCached, markCached } from './cache.js';

async function installDependencies(
  sdkDir: string,
  generator: GeneratorType
): Promise<void> {
  console.log('  → Installing dependencies...');

  switch (generator) {
    case 'typedoc': {
      try {
        await execa(
          'pnpm',
          ['install', '--ignore-scripts', '--prefer-offline'],
          {
            cwd: sdkDir,
            stdio: 'pipe',
          }
        );
      } catch {
        console.log('  ⚠️  pnpm failed, trying npm...');
        await execa(
          'npm',
          ['install', '--legacy-peer-deps', '--prefer-offline'],
          {
            cwd: sdkDir,
            stdio: 'pipe',
          }
        );
      }
      break;
    }

    case 'cli': {
      try {
        await execa('pnpm', ['install', '--prefer-offline'], {
          cwd: sdkDir,
          stdio: 'pipe',
        });
      } catch {
        await execa('npm', ['install', '--prefer-offline'], {
          cwd: sdkDir,
          stdio: 'pipe',
        });
      }
      break;
    }

    case 'pydoc': {
      try {
        await execa('poetry', ['install', '--quiet'], {
          cwd: sdkDir,
          stdio: 'pipe',
        });
      } catch {
        await execa(
          'pip',
          ['install', '--break-system-packages', 'pydoc-markdown'],
          {
            cwd: sdkDir,
            stdio: 'pipe',
          }
        );
      }
      break;
    }
  }
}

export async function installWithCache(
  sdkDir: string,
  generator: GeneratorType,
  tempDir: string
): Promise<void> {
  if (generator === 'pydoc') {
    const hash = await hashLockfile(sdkDir, generator);

    if (hash && (await isCached(hash, generator, tempDir))) {
      console.log('  → Poetry dependencies cached (lockfile unchanged)');
      return;
    }

    await installDependencies(sdkDir, generator);

    if (hash) {
      await markCached(hash, generator, tempDir);
    }
  } else {
    await installDependencies(sdkDir, generator);
  }
}
