import fs from "fs-extra";
import path from "path";
import { loadConfig } from "./lib/config.js";
import { sortVersionsDescending } from "./lib/utils.js";
import { CONSTANTS } from "./lib/constants.js";
import type {
  NavigationDropdown,
  NavigationDropdownWithOrder,
} from "./types.js";

async function getVersions(sdkDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(sdkDir, { withFileTypes: true });

    const versions = entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        return /^v?\d+\.\d+\.\d+/.test(e.name);
      })
      .map((e) => e.name);

    return sortVersionsDescending(versions);
  } catch {
    return [];
  }
}

async function getModules(versionDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(versionDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(CONSTANTS.MDX_EXTENSION))
      .map((e) => e.name.replace(CONSTANTS.MDX_EXTENSION, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function buildNavigation(
  docsDir: string
): Promise<NavigationDropdown[]> {
  const config = await loadConfig();
  const sdkRefDir = path.join(docsDir, CONSTANTS.DOCS_SDK_REF_PATH);

  if (!(await fs.pathExists(sdkRefDir))) {
    console.log("⚠️  SDK reference directory not found:", sdkRefDir);
    return [];
  }

  const navigation: NavigationDropdownWithOrder[] = [];

  for (const [sdkKey, sdkConfig] of Object.entries(config.sdks)) {
    const sdkDir = path.join(sdkRefDir, sdkKey);

    if (!(await fs.pathExists(sdkDir))) {
      console.log(`   Skipping ${sdkKey} (not found)`);
      continue;
    }

    const versions = await getVersions(sdkDir);
    if (versions.length === 0) {
      console.log(`   Skipping ${sdkKey} (no versions)`);
      continue;
    }

    console.log(`   Found ${sdkKey}: ${versions.length} versions`);

    const dropdown: NavigationDropdownWithOrder = {
      dropdown: sdkConfig.displayName,
      icon: sdkConfig.icon,
      versions: await Promise.all(
        versions.map(async (version, index) => {
          const versionDir = path.join(sdkDir, version);
          const modules = await getModules(versionDir);
          const displayVersion = version.startsWith("v")
            ? version
            : `v${version}`;

          return {
            version: displayVersion,
            default: index === 0,
            pages: modules.map(
              (module) =>
                `${CONSTANTS.DOCS_SDK_REF_PATH}/${sdkKey}/${version}/${module}`
            ),
          };
        })
      ),
      _order: sdkConfig.order,
    };

    navigation.push(dropdown);
  }

  return navigation
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...rest }) => rest);
}

export async function mergeNavigation(
  navigation: NavigationDropdown[],
  docsDir: string
): Promise<void> {
  const docsJsonPath = path.join(docsDir, "docs.json");

  if (!(await fs.pathExists(docsJsonPath))) {
    console.log("❌ docs.json not found");
    process.exit(1);
  }

  const docsJson = await fs.readJSON(docsJsonPath);

  const anchors = docsJson.navigation?.anchors;
  if (!anchors) {
    console.log("❌ No anchors found in docs.json");
    process.exit(1);
  }

  const sdkRefIndex = anchors.findIndex(
    (a: { anchor?: string }) => a.anchor === CONSTANTS.SDK_REFERENCE_ANCHOR
  );

  if (sdkRefIndex === -1) {
    console.log(
      `❌ ${CONSTANTS.SDK_REFERENCE_ANCHOR} anchor not found in docs.json`
    );
    process.exit(1);
  }

  const validDropdowns = navigation.filter(
    (d) => d.versions && d.versions.length > 0
  );

  if (validDropdowns.length === 0) {
    console.log("⚠️  No SDK versions found, keeping existing docs.json");
    return;
  }

  anchors[sdkRefIndex] = {
    anchor: CONSTANTS.SDK_REFERENCE_ANCHOR,
    icon: "brackets-curly",
    dropdowns: validDropdowns,
  };

  await fs.writeJSON(docsJsonPath, docsJson, { spaces: 2 });
  const content = await fs.readFile(docsJsonPath, "utf-8");
  if (!content.endsWith("\n")) {
    await fs.appendFile(docsJsonPath, "\n");
  }

  console.log(
    `✅ Updated docs.json with ${validDropdowns.length} SDK dropdowns`
  );

  for (const dropdown of validDropdowns) {
    const totalVersions = dropdown.versions.length;
    const totalPages = dropdown.versions.reduce(
      (sum, v) => sum + (v.pages?.length || 0),
      0
    );
    console.log(
      `   - ${dropdown.dropdown}: ${totalVersions} versions, ${totalPages} pages`
    );
  }
}
