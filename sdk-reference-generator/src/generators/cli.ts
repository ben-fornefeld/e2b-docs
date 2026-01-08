import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import { CONSTANTS } from "../lib/constants.js";
import { log } from "../lib/log.js";

export async function generateCli(sdkDir: string): Promise<string> {
  log.info("Building CLI...", 1);

  try {
    await execa("pnpm", ["run", "build"], {
      cwd: sdkDir,
      stdio: "inherit",
    });
  } catch (error) {
    log.warn("pnpm build failed, trying tsup...", 1);
    await execa("npx", ["tsup"], {
      cwd: sdkDir,
      stdio: "inherit",
    });
  }

  log.info("Generating documentation...", 1);

  const outputDir = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
  await fs.ensureDir(outputDir);

  await execa("node", ["dist/index.js", "-cmd2md"], {
    cwd: sdkDir,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  });

  const mdFiles = await glob(`*${CONSTANTS.MD_EXTENSION}`, { cwd: outputDir });

  for (const file of mdFiles) {
    const srcPath = path.join(outputDir, file);
    const destPath = srcPath.replace(
      CONSTANTS.MD_EXTENSION,
      CONSTANTS.MDX_EXTENSION
    );
    await fs.move(srcPath, destPath);
  }

  return outputDir;
}
