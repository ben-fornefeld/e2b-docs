import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { log } from "../lib/log.js";
import { buildTypedocConfig } from "../lib/config.js";
import { CONSTANTS } from "../lib/constants.js";
import type { TypedocConfig } from "../types.js";

const GENERATED_CONFIG_NAME = "typedoc.generated.json";

/**
 * Removes any existing typedoc config from the repo to prevent interference.
 */
async function cleanRepoConfigs(sdkDir: string): Promise<void> {
  const configFiles = ["typedoc.json", "typedoc.config.js", "typedoc.config.cjs"];

  for (const file of configFiles) {
    const filePath = path.join(sdkDir, file);
    if (await fs.pathExists(filePath)) {
      log.info(`Removing repo config: ${file}`, 1);
      await fs.remove(filePath);
    }
  }
}

export async function generateTypedoc(
  sdkDir: string,
  resolvedConfig: TypedocConfig,
  configsDir: string
): Promise<string> {
  // remove any existing repo configs to force our config
  await cleanRepoConfigs(sdkDir);

  // build full config with formatting defaults + SDK-specific settings
  const fullConfig = buildTypedocConfig(resolvedConfig);

  // write our generated config
  const configPath = path.join(sdkDir, GENERATED_CONFIG_NAME);
  await fs.writeJSON(configPath, fullConfig, { spaces: 2 });

  log.info("Running TypeDoc with generated config...", 1);
  log.data(`Entry points: ${resolvedConfig.entryPoints.join(", ")}`, 1);

  await execa(
    "npx",
    [
      "typedoc",
      "--options",
      `./${GENERATED_CONFIG_NAME}`,
      "--plugin",
      "typedoc-plugin-markdown",
      "--plugin",
      path.join(configsDir, "typedoc-theme.cjs"),
    ],
    {
      cwd: sdkDir,
      stdio: "inherit",
    }
  );

  return path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
}
