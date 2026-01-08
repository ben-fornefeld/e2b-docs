#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { initConfig, getAllSDKKeys } from './lib/config.js';
import { generateSDK } from './generator.js';
import { buildNavigation, mergeNavigation } from './navigation.js';
import type { GenerationContext, GenerationResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIGS_DIR = path.join(SCRIPT_DIR, 'configs');

initConfig(SCRIPT_DIR);

const program = new Command()
  .name('generate-sdk-reference')
  .description('Generate SDK reference documentation')
  .option('--sdk <name>', 'SDK to generate (or "all")', 'all')
  .option('--version <version>', 'Version to generate (or "all", "latest")', 'all')
  .option('--limit <n>', 'Limit number of versions to generate', parseInt)
  .parse();

const opts = program.opts<{
  sdk: string;
  version: string;
  limit?: number;
}>();

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-gen-'));

  console.log('🚀 SDK Reference Generator');
  console.log(`   SDK: ${opts.sdk}`);
  console.log(`   Version: ${opts.version}`);
  if (opts.limit) {
    console.log(`   Limit: ${opts.limit} versions`);
  }
  console.log(`   Temp dir: ${tempDir}`);
  console.log('');

  const ctx: GenerationContext = {
    tempDir,
    docsDir: DOCS_DIR,
    configsDir: CONFIGS_DIR,
    limit: opts.limit,
  };

  try {
    const sdkKeys =
      opts.sdk === 'all' ? await getAllSDKKeys() : [opts.sdk];

    const results: Map<string, GenerationResult> = new Map();

    for (const sdkKey of sdkKeys) {
      console.log(`📦 Generating ${sdkKey}...`);
      const result = await generateSDK(sdkKey, opts.version, ctx);
      results.set(sdkKey, result);
    }

    console.log('');
    console.log('📝 Generating navigation JSON...');
    const navigation = await buildNavigation(DOCS_DIR);

    console.log('');
    console.log('🔄 Merging navigation into docs.json...');
    await mergeNavigation(navigation, DOCS_DIR);

    console.log('');
    console.log('✅ SDK reference generation complete');

    let totalGenerated = 0;
    let totalFailed = 0;

    for (const [sdkKey, result] of results) {
      totalGenerated += result.generated;
      totalFailed += result.failed;
    }

    if (totalGenerated > 0 || totalFailed > 0) {
      console.log('');
      console.log('📊 Final Summary:');
      console.log(`   Total generated: ${totalGenerated}`);
      if (totalFailed > 0) {
        console.log(`   Total failed: ${totalFailed}`);
      }
    }
  } finally {
    await fs.remove(tempDir);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

