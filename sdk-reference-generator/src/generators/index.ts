import type { SDKConfig, GenerationContext } from '../types.js';
import { generateTypedoc } from './typedoc.js';
import { generatePydoc } from './pydoc.js';
import { generateCli } from './cli.js';

export async function runGenerator(
  sdkDir: string,
  config: SDKConfig,
  ctx: GenerationContext
): Promise<void> {
  switch (config.generator) {
    case 'typedoc':
      await generateTypedoc(sdkDir, ctx.configsDir);
      break;

    case 'pydoc':
      await generatePydoc(sdkDir, config.packages || [], config.submodules);
      break;

    case 'cli':
      await generateCli(sdkDir);
      break;

    default:
      throw new Error(`Unknown generator: ${config.generator}`);
  }
}

export { generateTypedoc } from './typedoc.js';
export { generatePydoc } from './pydoc.js';
export { generateCli } from './cli.js';
