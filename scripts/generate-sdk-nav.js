#!/usr/bin/env node

/**
 * SDK Navigation Generator
 * Scans the docs/sdk-reference directory and generates Mintlify-compatible navigation JSON.
 * 
 * Reads SDK configuration from sdks.json for display names, icons, and ordering.
 */

const fs = require('fs');
const path = require('path');

// try to use semver for sorting, fall back to basic string comparison
let semver;
try {
  semver = require('semver');
} catch {
  semver = null;
}

const SCRIPT_DIR = __dirname;
const DOCS_DIR = path.join(SCRIPT_DIR, '..');
const SDK_REF_DIR = path.join(DOCS_DIR, 'docs', 'sdk-reference');
const CONFIG_FILE = path.join(SCRIPT_DIR, 'sdks.json');
const OUTPUT_FILE = path.join(DOCS_DIR, 'sdk_navigation.json');

/**
 * Load SDK configuration from sdks.json
 */
function loadSdkConfigs() {
  try {
    const config = require(CONFIG_FILE);
    return Object.fromEntries(
      Object.entries(config.sdks).map(([key, sdk]) => [
        key,
        {
          name: sdk.displayName,
          icon: sdk.icon,
          order: sdk.order
        }
      ])
    );
  } catch (err) {
    console.error('Failed to load sdks.json:', err.message);
    process.exit(1);
  }
}

/**
 * Get all version directories for an SDK
 */
function getVersions(sdkDir) {
  try {
    const entries = fs.readdirSync(sdkDir, { withFileTypes: true });
    const versions = entries
      .filter(e => e.isDirectory() && e.name.startsWith('v'))
      .map(e => e.name);
    
    // sort versions (latest first)
    if (semver) {
      return versions.sort((a, b) => {
        const cleanA = a.replace(/^v/, '');
        const cleanB = b.replace(/^v/, '');
        try {
          return semver.rcompare(cleanA, cleanB);
        } catch {
          return b.localeCompare(a);
        }
      });
    }
    
    // fallback: basic string sort (won't handle semver correctly)
    return versions.sort().reverse();
  } catch {
    return [];
  }
}

/**
 * Get all MDX modules in a version directory
 */
function getModules(versionDir) {
  try {
    const entries = fs.readdirSync(versionDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.mdx'))
      .map(e => e.name.replace('.mdx', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Generate navigation structure for all SDKs
 */
function generateNavigation() {
  const SDK_CONFIGS = loadSdkConfigs();
  const navigation = [];

  // check if sdk-reference directory exists
  if (!fs.existsSync(SDK_REF_DIR)) {
    console.log('⚠️  SDK reference directory not found:', SDK_REF_DIR);
    return navigation;
  }

  // process each SDK from config
  for (const [sdkKey, config] of Object.entries(SDK_CONFIGS)) {
    const sdkDir = path.join(SDK_REF_DIR, sdkKey);
    
    if (!fs.existsSync(sdkDir)) {
      console.log(`   Skipping ${sdkKey} (not found)`);
      continue;
    }

    const versions = getVersions(sdkDir);
    if (versions.length === 0) {
      console.log(`   Skipping ${sdkKey} (no versions)`);
      continue;
    }

    console.log(`   Found ${sdkKey}: ${versions.length} versions`);

    const dropdown = {
      dropdown: config.name,
      icon: config.icon,
      versions: versions.map((version, index) => {
        const versionDir = path.join(sdkDir, version);
        const modules = getModules(versionDir);

        return {
          // mark first version as @latest
          version: index === 0 ? `${version}@latest` : version,
          groups: [
            {
              group: `${config.name} ${version}`,
              pages: modules.map(module => 
                `docs/sdk-reference/${sdkKey}/${version}/${module}`
              )
            }
          ]
        };
      })
    };

    // store with order for sorting
    navigation.push({ ...dropdown, _order: config.order });
  }

  // sort by order and remove _order field
  return navigation
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...rest }) => rest);
}

/**
 * Main entry point
 */
function main() {
  console.log('📝 Generating SDK navigation...');
  console.log(`   Config: ${CONFIG_FILE}`);
  console.log(`   Source: ${SDK_REF_DIR}`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('');

  const navigation = generateNavigation();

  // write output file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(navigation, null, 2));

  console.log('');
  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`   Found ${navigation.length} SDKs`);
  
  // summary
  for (const sdk of navigation) {
    const totalPages = sdk.versions.reduce((sum, v) => 
      sum + v.groups.reduce((s, g) => s + g.pages.length, 0), 0
    );
    console.log(`   - ${sdk.dropdown}: ${sdk.versions.length} versions, ${totalPages} pages`);
  }
}

main();
