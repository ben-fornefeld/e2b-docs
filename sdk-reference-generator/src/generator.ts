import fs from "fs-extra";
import path from "path";
import type {
  SDKConfig,
  GenerationContext,
  GenerationResult,
} from "./types.js";
import { getSDKConfig } from "./lib/config.js";
import {
  fetchRemoteTags,
  cloneAtTag,
  resolveLatestVersion,
} from "./lib/git.js";
import {
  fetchLocalVersions,
  filterByMinVersion,
  diffVersions,
  versionExists,
} from "./lib/versions.js";
import { flattenMarkdown, copyToDocs, locateSDKDir } from "./lib/files.js";
import { installWithCache } from "./lib/install.js";
import { runGenerator } from "./generators/index.js";
import { buildSDKPath } from "./lib/utils.js";
import { CONSTANTS } from "./lib/constants.js";

async function generateVersion(
  sdkKey: string,
  config: SDKConfig,
  version: string,
  ctx: GenerationContext
): Promise<void> {
  const repoDir = path.join(ctx.tempDir, `${sdkKey}-${version}`);

  try {
    const tagName = config.tagFormat.replace(
      "{version}",
      version.replace(/^v/, "")
    );

    await cloneAtTag(config.repo, tagName, repoDir);

    const sdkDir = await locateSDKDir(repoDir, config.sdkPath, config.sdkPaths);
    if (!sdkDir) {
      throw new Error(
        `SDK path not found: ${config.sdkPath || config.sdkPaths?.join(", ")}`
      );
    }

    await installWithCache(sdkDir, config.generator, ctx.tempDir);

    await runGenerator(sdkDir, config, ctx);

    const generatedDocsDir = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
    if (!(await fs.pathExists(generatedDocsDir))) {
      throw new Error("No sdk_ref directory generated");
    }

    await flattenMarkdown(generatedDocsDir);

    const destDir = buildSDKPath(ctx.docsDir, sdkKey, version);
    const success = await copyToDocs(
      generatedDocsDir,
      destDir,
      config.displayName,
      version
    );

    if (!success) {
      throw new Error("Failed to copy generated files");
    }
  } finally {
    await fs.remove(repoDir);
  }
}

export async function generateSDK(
  sdkKey: string,
  versionArg: string,
  ctx: GenerationContext
): Promise<GenerationResult> {
  const config = await getSDKConfig(sdkKey);

  if (!config) {
    console.log(`  ❌ SDK '${sdkKey}' not found in config`);
    return { generated: 0, failed: 1, failedVersions: [sdkKey] };
  }

  console.log(`  → ${config.displayName} version: ${versionArg}`);

  let versionsToProcess: string[] = [];

  if (versionArg === "all") {
    console.log("  → Discovering all versions...");

    let remote = await fetchRemoteTags(config.repo, config.tagPattern);

    if (remote.length === 0) {
      if (config.required) {
        console.log("  ❌ No tags found");
        return { generated: 0, failed: 1, failedVersions: ["no-tags"] };
      }
      console.log("  ⚠️  No tags found, skipping...");
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (config.minVersion) {
      remote = filterByMinVersion(remote, config.minVersion);
      console.log(`  → Filtered to versions >= ${config.minVersion}`);
    }

    if (ctx.limit && ctx.limit > 0) {
      remote = remote.slice(0, ctx.limit);
      console.log(`  → Limited to last ${ctx.limit} versions`);
    }

    const local = await fetchLocalVersions(sdkKey, ctx.docsDir);

    console.log("");
    console.log("  📊 Version Discovery:");
    console.log(`     Remote: ${remote.length}`);
    console.log(`     Local: ${local.length}`);

    const missing = diffVersions(remote, local);

    console.log(`     Missing: ${missing.length}`);
    console.log("");

    if (missing.length === 0) {
      console.log("  ✅ Nothing to generate");
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    versionsToProcess = missing;
  } else {
    const resolved = await resolveLatestVersion(
      config.repo,
      config.tagPattern,
      versionArg
    );

    if (!resolved) {
      if (config.required) {
        console.log("  ❌ No tags found");
        return { generated: 0, failed: 1, failedVersions: ["no-tags"] };
      }
      console.log("  ⚠️  No tags found, skipping...");
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (await versionExists(sdkKey, resolved, ctx.docsDir)) {
      console.log(`  ✓ ${resolved} already exists`);
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    versionsToProcess = [resolved];
  }

  let generated = 0;
  let failed = 0;
  const failedVersions: string[] = [];

  for (const version of versionsToProcess) {
    console.log("");
    console.log(`  📦 Generating ${version}...`);

    try {
      await generateVersion(sdkKey, config, version, ctx);
      console.log(`  ✅ Complete: ${version}`);
      generated++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Failed: ${version} - ${msg}`);
      failed++;
      failedVersions.push(version);
    }
  }

  console.log("");
  console.log("  📊 Summary:");
  console.log(`     Generated: ${generated}`);
  if (failed > 0) {
    console.log(`     Failed: ${failed} (${failedVersions.join(" ")})`);
  }

  if (failed > 0) {
    if (config.required) {
      console.log("");
      console.log("  ❌ WORKFLOW ABORTED: Required SDK has failures");
      console.log(`  ❌ Failed: ${failedVersions.join(" ")}`);
      process.exit(1);
    } else if (generated === 0) {
      console.log("");
      console.log("  ❌ WORKFLOW ABORTED: All versions failed");
      console.log(`  ❌ Failed: ${failedVersions.join(" ")}`);
      process.exit(1);
    }
  }

  return { generated, failed, failedVersions };
}
