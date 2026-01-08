import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

export async function generateTypedoc(
  sdkDir: string,
  configsDir: string
): Promise<void> {
  const hasRepoConfig = await fs.pathExists(path.join(sdkDir, 'typedoc.json'));

  if (hasRepoConfig) {
    console.log('  → Running TypeDoc with repo config...');
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
        stdio: 'pipe',
      }
    );
  } else {
    console.log('  → Running TypeDoc with default config...');
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
        stdio: 'pipe',
      }
    );
  }
}
