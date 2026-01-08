import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { CONSTANTS } from "../lib/constants.js";
import { log } from "../lib/log.js";

async function processMdx(file: string): Promise<void> {
  let content = await fs.readFile(file, "utf-8");

  content = content.replace(/<a[^>]*>.*?<\/a>/g, "");
  content = content
    .split("\n")
    .filter((line) => !line.startsWith("# "))
    .join("\n");
  content = content.replace(/^(## .+) Objects$/gm, "$1");
  content = content.replace(/^####/gm, "###");

  await fs.writeFile(file, content);
}

async function processPackage(pkg: string, sdkDir: string): Promise<boolean> {
  const rawName = pkg.split(".").pop() || pkg;
  const name = rawName.replace(/^e2b_/, "");

  log.step(`Processing ${pkg}`, 2);

  const outputFile = path.join(
    sdkDir,
    CONSTANTS.SDK_REF_DIR,
    `${name}${CONSTANTS.MDX_EXTENSION}`
  );

  try {
    const result = await execa("poetry", ["run", "pydoc-markdown", "-p", pkg], {
      cwd: sdkDir,
      stdio: "pipe",
    });

    const rawContent = result.stdout.trim();
    if (rawContent.length < 50) {
      log.warn(`${pkg} generated no content - skipping`, 2);
      return false;
    }

    await fs.writeFile(outputFile, result.stdout);
    await processMdx(outputFile);

    const stat = await fs.stat(outputFile);
    if (stat.size < 100) {
      log.warn(`${pkg} has no meaningful content - removing`, 2);
      await fs.remove(outputFile);
      return false;
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.warn(`Failed to generate docs for ${pkg}: ${msg}`, 2);
    await fs.remove(outputFile);
    return false;
  }
}

export async function generatePydoc(
  sdkDir: string,
  allowedPackages: readonly string[]
): Promise<string> {
  const outputDir = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
  await fs.ensureDir(outputDir);

  log.info(
    `Attempting to generate docs for ${allowedPackages.length} packages`,
    1
  );

  let successful = 0;
  for (const pkg of allowedPackages) {
    const result = await processPackage(pkg, sdkDir);
    if (result) successful++;
  }

  log.step(
    `Generated docs for ${successful}/${allowedPackages.length} packages`,
    1
  );

  return outputDir;
}
