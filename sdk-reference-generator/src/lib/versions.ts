import fs from "fs-extra";
import path from "path";
import semver from "semver";
import {
  stripVersionPrefix,
  sortVersionsDescending,
  isValidVersion,
  normalizeVersion,
} from "./utils.js";
import { CONSTANTS } from "./constants.js";

export { isValidVersion };

export function versionGte(v1: string, v2: string): boolean {
  try {
    return semver.gte(stripVersionPrefix(v1), stripVersionPrefix(v2));
  } catch {
    return stripVersionPrefix(v1) >= stripVersionPrefix(v2);
  }
}

export function filterByMinVersion(
  versions: string[],
  minVersion?: string
): string[] {
  if (!minVersion) return versions;
  return versions.filter((v) => versionGte(v, minVersion));
}

export async function fetchLocalVersions(
  sdkKey: string,
  docsDir: string
): Promise<string[]> {
  const sdkDir = path.join(docsDir, CONSTANTS.DOCS_SDK_REF_PATH, sdkKey);

  if (!(await fs.pathExists(sdkDir))) {
    return [];
  }

  const entries = await fs.readdir(sdkDir, { withFileTypes: true });
  const versions: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isValidVersion(entry.name)) continue;

    const versionDir = path.join(sdkDir, entry.name);
    const files = await fs.readdir(versionDir);
    const hasMdx = files.some((f) => f.endsWith(CONSTANTS.MDX_EXTENSION));

    if (hasMdx) {
      // normalize to "v" prefix for consistent comparison with remote versions
      versions.push(normalizeVersion(entry.name));
    }
  }

  return sortVersionsDescending(versions);
}

export function diffVersions(remote: string[], local: string[]): string[] {
  const localSet = new Set(local);
  return remote.filter((v) => !localSet.has(v));
}

export async function versionExists(
  sdkKey: string,
  version: string,
  docsDir: string
): Promise<boolean> {
  const normalized = normalizeVersion(version);
  const stripped = stripVersionPrefix(version);

  // check both "v1.0.0" and "1.0.0" directories for backward compatibility
  const candidates = [normalized, stripped];

  for (const candidate of candidates) {
    const versionDir = path.join(
      docsDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      sdkKey,
      candidate
    );

    if (await fs.pathExists(versionDir)) {
      const files = await fs.readdir(versionDir);
      if (files.some((f) => f.endsWith(CONSTANTS.MDX_EXTENSION))) {
        return true;
      }
    }
  }

  return false;
}
