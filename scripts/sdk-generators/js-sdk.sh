#!/usr/bin/env bash

set -euo pipefail

# JavaScript SDK Reference Generator
# Usage: ./js-sdk.sh <version> <temp_dir> <docs_dir>

VERSION="$1"
TEMP_DIR="$2"
DOCS_DIR="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$SCRIPT_DIR/../configs"

echo "  → JS SDK version: $VERSION"

# determine the git tag to clone
if [[ "$VERSION" == "latest" ]]; then
    # get latest tag from e2b repo (format: e2b@X.Y.Z)
    VERSION=$(git ls-remote --tags --refs https://github.com/e2b-dev/e2b.git | \
              grep 'refs/tags/e2b@' | \
              sed 's/.*refs\/tags\/e2b@/v/' | \
              sort -V | tail -1) || true
    
    if [[ -z "$VERSION" ]]; then
        echo "  ❌ No JS SDK tags found"
        exit 1
    fi
    echo "  → Resolved latest to: $VERSION"
fi

# convert version to git tag format (v2.9.0 -> e2b@2.9.0)
GIT_TAG="e2b@${VERSION#v}"

# clone e2b repo at specific version
REPO_DIR="$TEMP_DIR/e2b-js-sdk"
if [[ ! -d "$REPO_DIR" ]]; then
    echo "  → Cloning e2b repo at $GIT_TAG..."
    git clone --depth 1 --branch "$GIT_TAG" \
        https://github.com/e2b-dev/e2b.git \
        "$REPO_DIR" 2>/dev/null || {
        echo "  ⚠️  Tag $GIT_TAG not found, trying branch main..."
        git clone --depth 1 \
            https://github.com/e2b-dev/e2b.git \
            "$REPO_DIR"
    }
fi

JS_SDK_DIR="$REPO_DIR/packages/js-sdk"
if [[ ! -d "$JS_SDK_DIR" ]]; then
    echo "  ❌ Directory not found: $JS_SDK_DIR"
    echo "  → Checking repo structure..."
    ls -la "$REPO_DIR" || true
    exit 1
fi

cd "$JS_SDK_DIR"

# install dependencies (use pnpm if available, fallback to npm)
echo "  → Installing dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install --ignore-scripts 2>&1 || {
        echo "  ⚠️  pnpm install failed, trying npm..."
        npm install --legacy-peer-deps 2>&1
    }
else
    npm install --legacy-peer-deps 2>&1
fi

# copy typedoc config to temp location
cp "$CONFIGS_DIR/typedoc.json" ./typedoc.docs.json

# generate using TypeDoc
echo "  → Running TypeDoc..."
npx typedoc --options ./typedoc.docs.json \
    --plugin typedoc-plugin-markdown \
    --plugin "$CONFIGS_DIR/typedoc-theme.js"

# process generated files - flatten structure for Mintlify
cd sdk_ref

# remove README if exists
rm -f README.md

# flatten nested structure: move all files to root level
find . -mindepth 2 -type f -name "*.md" | while read -r file; do
    # get the parent directory name as module name
    dir=$(dirname "$file")
    filename=$(basename "$file")
    
    if [[ "$filename" == "page.md" || "$filename" == "index.md" ]]; then
        # use directory name as file name
        module=$(basename "$dir")
        mv "$file" "./${module}.md" 2>/dev/null || true
    else
        # move file to root
        mv "$file" "./" 2>/dev/null || true
    fi
done

# remove empty directories
find . -type d -empty -delete 2>/dev/null || true

# rename .md to .mdx
for file in *.md; do
    if [[ -f "$file" ]]; then
        mv "$file" "${file%.md}.mdx"
    fi
done

# copy to docs repo
TARGET_DIR="$DOCS_DIR/docs/sdk-reference/js-sdk/$VERSION"
mkdir -p "$TARGET_DIR"

echo "  → Copying files to $TARGET_DIR"
cp *.mdx "$TARGET_DIR/" 2>/dev/null || echo "  ⚠️  No MDX files to copy"

# list generated files
echo "  → Generated files:"
ls -la "$TARGET_DIR" 2>/dev/null || echo "  ⚠️  No files generated"

echo "  ✅ JS SDK $VERSION complete"

