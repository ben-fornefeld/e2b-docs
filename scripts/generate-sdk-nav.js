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
          order: sdk.order,
          family: sdk.family,
          language: sdk.language,
          standalone: sdk.standalone
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
    
    // accept both "v2.9.0" and "2.9.0" formats
    const versions = entries
      .filter(e => {
        if (!e.isDirectory()) return false;
        // match version patterns: v1.2.3 or 1.2.3
        return /^v?\d+\.\d+\.\d+/.test(e.name);
      })
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
 * Groups SDKs by family (e.g., sdk, code-interpreter, desktop)
 */
function generateNavigation() {
  const SDK_CONFIGS = loadSdkConfigs();
  const navigation = [];

  // check if sdk-reference directory exists
  if (!fs.existsSync(SDK_REF_DIR)) {
    console.log('⚠️  SDK reference directory not found:', SDK_REF_DIR);
    return navigation;
  }

  // group SDKs by family
  const families = {};
  for (const [sdkKey, config] of Object.entries(SDK_CONFIGS)) {
    const family = config.family || sdkKey;
    if (!families[family]) {
      families[family] = {
        name: getFamilyDisplayName(family),
        icon: getFirstIcon(family, config.icon),
        order: Math.min(...[config.order]), // use lowest order in family
        standalone: config.standalone || false,
        languages: []
      };
    }
    // update order to be the minimum across all SDKs in family
    families[family].order = Math.min(families[family].order, config.order);
    families[family].languages.push({ key: sdkKey, config });
  }

  // process each family
  for (const [familyKey, family] of Object.entries(families)) {
    // get versions from first language (they should all match)
    const firstLang = family.languages[0];
    const firstSdkDir = path.join(SDK_REF_DIR, firstLang.key);
    
    if (!fs.existsSync(firstSdkDir)) {
      console.log(`   Skipping ${familyKey} (not found)`);
      continue;
    }

    const versions = getVersions(firstSdkDir);
    if (versions.length === 0) {
      console.log(`   Skipping ${familyKey} (no versions)`);
      continue;
    }

    console.log(`   Found ${familyKey}: ${versions.length} versions, ${family.languages.length} languages`);

    // create dropdown for this family
    const dropdown = {
      dropdown: family.name,
      icon: family.icon,
      versions: versions.map((version, index) => {
        const displayVersion = version.startsWith('v') ? version : `v${version}`;
        
        // standalone SDKs (like CLI) - pages directly under version
        if (family.standalone) {
          const versionDir = path.join(firstSdkDir, version);
          const modules = getModules(versionDir);
          
          return {
            version: displayVersion,
            default: index === 0,
            pages: modules.map(module => 
              `docs/sdk-reference/${firstLang.key}/${version}/${module}`
            )
          };
        }
        
        // multi-language SDKs - groups for each language
        const groups = family.languages.map(lang => {
          const sdkDir = path.join(SDK_REF_DIR, lang.key);
          const versionDir = path.join(sdkDir, version);
          
          if (!fs.existsSync(versionDir)) {
            return null;
          }
          
          const modules = getModules(versionDir);
          
          return {
            group: lang.config.language || lang.config.name,
            icon: lang.config.icon, // add icon for the language
            pages: modules.map(module => 
              `docs/sdk-reference/${lang.key}/${version}/${module}`
            )
          };
        }).filter(Boolean);

        return {
          version: displayVersion,
          default: index === 0,
          groups
        };
      })
    };

    navigation.push({ ...dropdown, _order: family.order });
  }

  // sort by order and remove _order field
  return navigation
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...rest }) => rest);
}

/**
 * Get display name for SDK family
 */
function getFamilyDisplayName(family) {
  const names = {
    'cli': 'CLI',
    'sdk': 'SDK',
    'code-interpreter': 'Code Interpreter SDK',
    'desktop': 'Desktop SDK'
  };
  return names[family] || family;
}

/**
 * Get icon for SDK family (prefer brackets-curly for multi-language SDKs)
 */
function getFirstIcon(family, defaultIcon) {
  if (family === 'sdk' || family === 'code-interpreter' || family === 'desktop') {
    return 'brackets-curly';
  }
  return defaultIcon;
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
    const totalPages = sdk.versions.reduce((sum, v) => {
      if (v.pages) {
        return sum + v.pages.length;
      } else if (v.groups) {
        return sum + v.groups.reduce((s, g) => s + g.pages.length, 0);
      }
      return sum;
    }, 0);
    console.log(`   - ${sdk.dropdown}: ${sdk.versions.length} versions, ${totalPages} pages`);
  }
}

main();
