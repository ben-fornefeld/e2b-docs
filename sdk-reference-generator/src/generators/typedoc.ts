import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { log } from '../lib/log.js';

async function getTypedocOutputDir(sdkDir: string): Promise<string> {
  const configPath = path.join(sdkDir, 'typedoc.json');
  
  if (await fs.pathExists(configPath)) {
    try {
      const config = await fs.readJSON(configPath);
      return config.out || 'sdk_ref';
    } catch {
      return 'sdk_ref';
    }
  }
  
  return 'sdk_ref';
}

export async function generateTypedoc(
  sdkDir: string,
  configsDir: string
): Promise<string> {
  const hasRepoConfig = await fs.pathExists(path.join(sdkDir, 'typedoc.json'));
  const outputDir = await getTypedocOutputDir(sdkDir);

  if (hasRepoConfig) {
    log.info('Running TypeDoc with repo config...', 1);
    await execa(
      'npx',
      [
        'typedoc',
        '--plugin',
        'typedoc-plugin-markdown',
        '--plugin',
        path.join(configsDir, 'typedoc-theme.cjs'),
      ],
      {
        cwd: sdkDir,
        stdio: 'inherit',
      }
    );
  } else {
    log.info('Running TypeDoc with default config...', 1);
    await fs.copy(
      path.join(configsDir, 'typedoc.json'),
      path.join(sdkDir, 'typedoc.docs.json')
    );

    await execa(
      'npx',
      [
        'typedoc',
        '--options',
        './typedoc.docs.json',
        '--plugin',
        'typedoc-plugin-markdown',
        '--plugin',
        path.join(configsDir, 'typedoc-theme.cjs'),
      ],
      {
        cwd: sdkDir,
        stdio: 'inherit',
      }
    );
  }

  return path.join(sdkDir, outputDir);
}
