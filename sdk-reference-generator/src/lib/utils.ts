import semver from "semver";
import path from "path";
import { CONSTANTS } from "./constants.js";

export function stripV(version: string): string {
  return version.replace(/^v/, "");
}

export function sortVersionsDescending(versions: string[]): string[] {
  return versions.sort((a, b) => {
    try {
      return semver.rcompare(stripV(a), stripV(b));
    } catch {
      return b.localeCompare(a);
    }
  });
}

export function createFrontmatter(title: string): string {
  return `---
sidebarTitle: "${title}"
mode: "center"
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
