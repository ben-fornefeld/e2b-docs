import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import { CONSTANTS } from "../lib/constants.js";

export async function generateCli(sdkDir: string): Promise<void> {
  console.log("  → Building CLI...");

  try {
    await execa("pnpm", ["run", "build"], {
      cwd: sdkDir,
      stdio: "pipe",
    });
  } catch {
    await execa("npx", ["tsup"], {
      cwd: sdkDir,
      stdio: "pipe",
    });
  }

  console.log("  → Generating documentation...");

  await fs.ensureDir(path.join(sdkDir, CONSTANTS.SDK_REF_DIR));

  await execa("node", ["dist/index.js", "-cmd2md"], {
    cwd: sdkDir,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "pipe",
  });

  const sdkRef = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
  const mdFiles = await glob(`*${CONSTANTS.MD_EXTENSION}`, { cwd: sdkRef });

  for (const file of mdFiles) {
    const srcPath = path.join(sdkRef, file);
    const destPath = srcPath.replace(
      CONSTANTS.MD_EXTENSION,
      CONSTANTS.MDX_EXTENSION
    );
    await fs.move(srcPath, destPath);
  }
}
