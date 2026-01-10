import semver from "semver";
import path from "path";
import { CONSTANTS } from "./constants.js";

export function normalizeVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}

export function stripVersionPrefix(version: string): string {
  return version.replace(/^v/, "");
}

export function isValidVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+/.test(version);
}

export function sortVersionsDescending(versions: string[]): string[] {
  return versions.sort((a, b) => {
    try {
      return semver.rcompare(stripVersionPrefix(a), stripVersionPrefix(b));
    } catch {
      return b.localeCompare(a);
    }
  });
}

export function createFrontmatter(title: string): string {
  return `---
sidebarTitle: "${title}"
---

`;
}

export function buildSDKPath(
  docsDir: string,
  sdkKey: string,
  version: string
): string {
  return path.join(docsDir, CONSTANTS.DOCS_SDK_REF_PATH, sdkKey, version);
}
