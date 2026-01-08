import fs from "fs-extra";
import path from "path";
import type {
  SDKConfig,
  GenerationContext,
  GenerationResult,
} from "./types.js";
import { getSDKConfig } from "./lib/config.js";
import { log } from "./lib/log.js";
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
    const versionWithoutV = version.replace(/^v/, "");
    const tagName = config.tagFormat.replace("{version}", versionWithoutV);

    await cloneAtTag(config.repo, tagName, repoDir);

    const sdkDir = await locateSDKDir(repoDir, config.sdkPath, config.sdkPaths);
    if (!sdkDir) {
      throw new Error(
        `SDK path not found: ${config.sdkPath || config.sdkPaths?.join(", ")}`
      );
    }

    await installWithCache(sdkDir, config.generator, ctx.tempDir);

    const generatedDocsDir = await runGenerator(sdkDir, config, ctx);

    const sdkRefDir = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
    if (generatedDocsDir !== sdkRefDir) {
      log.info(`Normalizing ${path.basename(generatedDocsDir)} to sdk_ref`, 1);
      await fs.move(generatedDocsDir, sdkRefDir);
    }

    await flattenMarkdown(sdkRefDir);

    const destDir = buildSDKPath(ctx.docsDir, sdkKey, version);
    const success = await copyToDocs(
      sdkRefDir,
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
    log.error(`SDK '${sdkKey}' not found in config`, 1);
    return { generated: 0, failed: 1, failedVersions: [sdkKey] };
  }

  log.info(`${config.displayName} version: ${versionArg}`, 1);

  let versionsToProcess: string[] = [];

  if (versionArg === "all") {
    log.info("Discovering all versions...", 1);

    let remote = await fetchRemoteTags(config.repo, config.tagPattern);

    if (remote.length === 0) {
      if (config.required) {
        log.error("No tags found", 1);
        return { generated: 0, failed: 1, failedVersions: ["no-tags"] };
      }
      log.warn("No tags found, skipping...", 1);
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (config.minVersion) {
      remote = filterByMinVersion(remote, config.minVersion);
      log.info(`Filtered to versions >= ${config.minVersion}`, 1);
    }

    if (ctx.limit && ctx.limit > 0) {
      remote = remote.slice(0, ctx.limit);
      log.info(`Limited to last ${ctx.limit} versions`, 1);
    }

    const local = await fetchLocalVersions(sdkKey, ctx.docsDir);

    log.blank();
    log.step("Version Discovery", 1);
    log.stats(
      [
        { label: "Remote", value: remote.length },
        { label: "Local", value: local.length },
      ],
      1
    );

    const missing = ctx.force ? remote : diffVersions(remote, local);

    log.stats(
      [
        {
          label: ctx.force ? "To Generate (forced)" : "Missing",
          value: missing.length,
        },
      ],
      1
    );
    log.blank();

    if (missing.length === 0) {
      log.success("Nothing to generate", 1);
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (ctx.force && local.length > 0) {
      log.warn("FORCE MODE: Will regenerate existing versions", 1);
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
        log.error("No tags found", 1);
        return { generated: 0, failed: 1, failedVersions: ["no-tags"] };
      }
      log.warn("No tags found, skipping...", 1);
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (!ctx.force && (await versionExists(sdkKey, resolved, ctx.docsDir))) {
      log.success(`${resolved} already exists`, 1);
      return { generated: 0, failed: 0, failedVersions: [] };
    }

    if (ctx.force) {
      log.warn("FORCE MODE: Will regenerate existing version", 1);
    }

    versionsToProcess = [resolved];
  }

  let generated = 0;
  let failed = 0;
  const failedVersions: string[] = [];

  for (const version of versionsToProcess) {
    log.blank();
    log.step(`Generating ${version}`, 1);

    try {
      await generateVersion(sdkKey, config, version, ctx);
      log.success(`Complete: ${version}`, 1);
      generated++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Failed: ${version} - ${msg}`, 1);
      failed++;
      failedVersions.push(version);
    }
  }

  log.blank();
  log.step("Summary", 1);
  log.stats(
    [
      { label: "Generated", value: generated },
      ...(failed > 0
        ? [
            {
              label: "Failed",
              value: `${failed} (${failedVersions.join(" ")})`,
            },
          ]
        : []),
    ],
    1
  );

  if (failed > 0) {
    if (config.required) {
      log.blank();
      log.error("WORKFLOW ABORTED: Required SDK has failures", 1);
      log.error(`Failed: ${failedVersions.join(" ")}`, 1);
      process.exit(1);
    } else if (generated === 0) {
      log.blank();
      log.error("WORKFLOW ABORTED: All versions failed", 1);
      log.error(`Failed: ${failedVersions.join(" ")}`, 1);
      process.exit(1);
    }
  }

  return { generated, failed, failedVersions };
}
