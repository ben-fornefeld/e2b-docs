import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { CONSTANTS } from "../lib/constants.js";
import { log } from "../lib/log.js";

async function discoverPythonPackages(
  sdkDir: string,
  basePackage: string
): Promise<string[]> {
  try {
    const script = `
import warnings
warnings.filterwarnings('ignore')

import sys
import pkgutil
import importlib

try:
    base = importlib.import_module('${basePackage}')
    modules = []
    
    for importer, modname, ispkg in pkgutil.iter_modules(base.__path__, base.__name__ + '.'):
        modules.append(modname)
    
    if modules:
        print('\\n'.join(sorted(modules)))
except ImportError:
    pass
`;

    const result = await execa(
      "poetry",
      ["run", "python", "-W", "ignore", "-c", script],
      {
        cwd: sdkDir,
        stdio: "pipe",
        reject: false,
      }
    );

    if (result.exitCode !== 0) {
      log.warn(`Discovery failed for ${basePackage} (using fallback)`, 1);
      return [];
    }

    const packages = result.stdout
      .split("\n")
      .filter(Boolean)
      .filter((pkg) => !pkg.includes("__pycache__"));

    if (packages.length > 0) {
      log.info(`Discovered ${packages.length} packages from ${basePackage}`, 1);
    }

    return packages;
  } catch (error) {
    log.warn("Discovery failed (using fallback)", 1);
    return [];
  }
}

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
  fallbackPackages: readonly string[],
  submodules?: Record<string, readonly string[]>,
  basePackage: string = "e2b"
): Promise<string> {
  const outputDir = path.join(sdkDir, CONSTANTS.SDK_REF_DIR);
  await fs.ensureDir(outputDir);

  log.info("Discovering Python packages...", 1);
  const discovered = await discoverPythonPackages(sdkDir, basePackage);

  const packagesToProcess =
    discovered.length > 0 ? discovered : fallbackPackages;

  if (discovered.length > 0) {
    log.info(`Found ${packagesToProcess.length} packages (auto-discovered)`, 1);
  } else if (fallbackPackages.length > 0) {
    log.info(`Using ${fallbackPackages.length} fallback packages`, 1);
  }

  let successful = 0;
  for (const pkg of packagesToProcess) {
    const result = await processPackage(pkg, sdkDir);
    if (result) successful++;
  }

  log.step(
    `Generated docs for ${successful}/${packagesToProcess.length} packages`,
    1
  );

  if (submodules) {
    for (const [parentPkg, submoduleNames] of Object.entries(submodules)) {
      for (const submod of submoduleNames) {
        const fullPkg = `${parentPkg}.${submod}`;
        await processPackage(fullPkg, sdkDir);
      }
    }
  }

  return outputDir;
}
