import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { CONSTANTS } from './constants.js';
import { log } from './log.js';

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalMdxFiles: number;
    totalSDKs: number;
    totalVersions: number;
  };
}

export async function verifyGeneratedDocs(
  docsDir: string
): Promise<VerificationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = { totalMdxFiles: 0, totalSDKs: 0, totalVersions: 0 };

  const sdkRefDir = path.join(docsDir, CONSTANTS.DOCS_SDK_REF_PATH);

  if (!(await fs.pathExists(sdkRefDir))) {
    errors.push('SDK reference directory does not exist');
    return { valid: false, errors, warnings, stats };
  }

  const sdkDirs = await fs.readdir(sdkRefDir, { withFileTypes: true });

  for (const sdkEntry of sdkDirs) {
    if (!sdkEntry.isDirectory()) continue;

    stats.totalSDKs++;
    const sdkPath = path.join(sdkRefDir, sdkEntry.name);
    const versionDirs = await fs.readdir(sdkPath, { withFileTypes: true });

    for (const versionEntry of versionDirs) {
      if (!versionEntry.isDirectory()) continue;
      if (!/^v?\d+\.\d+\.\d+/.test(versionEntry.name)) continue;

      stats.totalVersions++;
      const versionPath = path.join(sdkPath, versionEntry.name);

      const mdxFiles = await glob(`*${CONSTANTS.MDX_EXTENSION}`, {
        cwd: versionPath,
      });

      if (mdxFiles.length === 0) {
        warnings.push(
          `${sdkEntry.name}/${versionEntry.name} has no MDX files`
        );
        continue;
      }

      for (const file of mdxFiles) {
        const filePath = path.join(versionPath, file);
        const stat = await fs.stat(filePath);

        if (stat.size === 0) {
          errors.push(
            `Empty file: ${sdkEntry.name}/${versionEntry.name}/${file}`
          );
        } else {
          stats.totalMdxFiles++;

          const content = await fs.readFile(filePath, 'utf-8');
          if (!content.startsWith('---')) {
            errors.push(
              `Missing frontmatter: ${sdkEntry.name}/${versionEntry.name}/${file}`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

export async function verifyDocsJson(docsDir: string): Promise<boolean> {
  const docsJsonPath = path.join(docsDir, 'docs.json');

  if (!(await fs.pathExists(docsJsonPath))) {
    log.error('docs.json not found');
    return false;
  }

  try {
    const docsJson = await fs.readJSON(docsJsonPath);

    const anchors = docsJson.navigation?.anchors;
    if (!Array.isArray(anchors)) {
      log.error('Invalid docs.json: navigation.anchors is not an array');
      return false;
    }

    const sdkRefAnchor = anchors.find(
      (a: { anchor?: string }) => a.anchor === CONSTANTS.SDK_REFERENCE_ANCHOR
    );

    if (!sdkRefAnchor) {
      log.error(`${CONSTANTS.SDK_REFERENCE_ANCHOR} anchor not found in docs.json`);
      return false;
    }

    if (!Array.isArray(sdkRefAnchor.dropdowns)) {
      log.error('SDK Reference anchor has no dropdowns array');
      return false;
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to parse docs.json: ${msg}`);
    return false;
  }
}

