#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..');
const DOCS_JSON_PATH = path.join(DOCS_DIR, 'docs.json');
const SDK_NAV_PATH = path.join(DOCS_DIR, 'sdk_navigation.json');

function main() {
  console.log('🔄 Merging SDK navigation into docs.json...');

  if (!fs.existsSync(SDK_NAV_PATH)) {
    console.log('⚠️  sdk_navigation.json not found, skipping merge');
    return;
  }

  const docsJson = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, 'utf-8'));
  const sdkNav = JSON.parse(fs.readFileSync(SDK_NAV_PATH, 'utf-8'));

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

  const validDropdowns = sdkNav.filter(d => d.versions && d.versions.length > 0);
  
  if (validDropdowns.length === 0) {
    console.log('⚠️  No SDK versions found, keeping existing docs.json');
    return;
  }

  anchors[sdkRefIndex] = {
    anchor: 'SDK Reference',
    icon: 'brackets-curly',
    dropdowns: validDropdowns
  };

  fs.writeFileSync(DOCS_JSON_PATH, JSON.stringify(docsJson, null, 2) + '\n');

  console.log(`✅ Updated docs.json with ${validDropdowns.length} SDK dropdowns`);
  
  for (const dropdown of validDropdowns) {
    const totalVersions = dropdown.versions.length;
    const totalPages = dropdown.versions.reduce((sum, v) => sum + (v.pages?.length || 0), 0);
    console.log(`   - ${dropdown.dropdown}: ${totalVersions} versions, ${totalPages} pages`);
  }
}

main();

