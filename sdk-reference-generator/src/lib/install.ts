import { execa } from 'execa';
import type { GeneratorType } from '../types.js';
import { hashLockfile, isCached, markCached } from './cache.js';
import { log } from './log.js';

async function installDependencies(
  sdkDir: string,
  generator: GeneratorType
): Promise<void> {
  log.info('Installing dependencies...', 1);

  switch (generator) {
    case 'typedoc':
    case 'cli': {
      const isTypedoc = generator === 'typedoc';
      const baseArgs = isTypedoc
        ? ['install', '--ignore-scripts', '--prefer-offline']
        : ['install', '--prefer-offline'];

      try {
        await execa('pnpm', baseArgs, {
          cwd: sdkDir,
          stdio: 'inherit',
        });
      } catch {
        log.warn('Trying with relaxed engine constraints...', 1);
        try {
          await execa('pnpm', ['--engine-strict=false', ...baseArgs], {
            cwd: sdkDir,
            stdio: 'inherit',
          });
        } catch {
          log.warn('pnpm failed, trying npm...', 1);
          await execa(
            'npm',
            ['install', '--legacy-peer-deps', '--force', '--prefer-offline'],
            {
              cwd: sdkDir,
              stdio: 'inherit',
            }
          );
        }
      }
      break;
    }

    case 'pydoc': {
      try {
        await execa('poetry', ['install', '--no-interaction'], {
          cwd: sdkDir,
          stdio: 'inherit',
        });
      } catch {
        log.warn('poetry failed, using global pydoc-markdown...', 1);
        await execa(
          'pip',
          ['install', '--break-system-packages', 'pydoc-markdown'],
          {
            cwd: sdkDir,
            stdio: 'inherit',
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
      log.info('Poetry dependencies cached (lockfile unchanged)', 1);
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
