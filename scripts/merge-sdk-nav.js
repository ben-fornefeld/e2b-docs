#!/usr/bin/env node

/**
 * Merge SDK Navigation into docs.json
 * 
 * This script merges the generated sdk_navigation.json into the docs.json
 * Mintlify configuration. It finds the "SDK Reference" anchor and replaces
 * its dropdowns with the generated navigation, enabling SDK and version selection.
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..');
const DOCS_JSON_PATH = path.join(DOCS_DIR, 'docs.json');
const SDK_NAV_PATH = path.join(DOCS_DIR, 'sdk_navigation.json');

function main() {
  console.log('🔄 Merging SDK navigation into docs.json...');

  // read files
  if (!fs.existsSync(SDK_NAV_PATH)) {
    console.log('⚠️  sdk_navigation.json not found, skipping merge');
    return;
  }

  const docsJson = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, 'utf-8'));
  const sdkNav = JSON.parse(fs.readFileSync(SDK_NAV_PATH, 'utf-8'));

  // find SDK Reference anchor
  const anchors = docsJson.navigation?.anchors;
  if (!anchors) {
    console.error('❌ No anchors found in docs.json');
    process.exit(1);
  }

  const sdkRefIndex = anchors.findIndex(a => a.anchor === 'SDK Reference');
  if (sdkRefIndex === -1) {
    console.error('❌ SDK Reference anchor not found in docs.json');
    process.exit(1);
  }

  // filter out empty dropdowns and update
  const validDropdowns = sdkNav.filter(d => d.versions && d.versions.length > 0);
  
  if (validDropdowns.length === 0) {
    console.log('⚠️  No SDK versions found, keeping existing docs.json');
    return;
  }

  // update SDK Reference anchor with generated navigation
  anchors[sdkRefIndex] = {
    anchor: 'SDK Reference',
    icon: 'brackets-curly',
    dropdowns: validDropdowns
  };

  // write updated docs.json
  fs.writeFileSync(DOCS_JSON_PATH, JSON.stringify(docsJson, null, 2) + '\n');

  console.log(`✅ Updated docs.json with ${validDropdowns.length} SDK dropdowns`);
  
  // summary
  for (const dropdown of validDropdowns) {
    const totalVersions = dropdown.versions.length;
    const totalPages = dropdown.versions.reduce((sum, v) => {
      if (v.pages) {
        return sum + v.pages.length;
      } else if (v.groups) {
        return sum + v.groups.reduce((s, g) => s + g.pages.length, 0);
      }
      return sum;
    }, 0);
    console.log(`   - ${dropdown.dropdown}: ${totalVersions} versions, ${totalPages} pages`);
  }
}

main();

