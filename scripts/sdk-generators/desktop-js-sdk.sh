#!/usr/bin/env bash

set -euo pipefail

# Desktop JavaScript SDK Reference Generator
# Usage: ./desktop-js-sdk.sh <version> <temp_dir> <docs_dir>

VERSION="$1"
TEMP_DIR="$2"
DOCS_DIR="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$SCRIPT_DIR/../configs"

echo "  → Desktop JS SDK version: $VERSION"

# determine the git tag to clone
if [[ "$VERSION" == "latest" ]]; then
    # get latest tag from desktop repo (format: @e2b/desktop@X.Y.Z)
    VERSION=$(git ls-remote --tags --refs https://github.com/e2b-dev/desktop.git | \
              grep 'refs/tags/@e2b/desktop@' | \
              sed 's/.*refs\/tags\/@e2b\/desktop@/v/' | \
              sort -V | tail -1) || true
    
    if [[ -z "$VERSION" ]]; then
        echo "  ⚠️  No JS SDK tags found, skipping..."
        exit 0
    fi
    echo "  → Resolved latest to: $VERSION"
fi

# convert version to git tag format
GIT_TAG="@e2b/desktop@${VERSION#v}"

# clone desktop repo at specific version
REPO_DIR="$TEMP_DIR/desktop"
if [[ ! -d "$REPO_DIR" ]]; then
    echo "  → Cloning desktop repo at $GIT_TAG..."
    git clone --depth 1 --branch "$GIT_TAG" \
        https://github.com/e2b-dev/desktop.git \
        "$REPO_DIR" 2>/dev/null || {
        echo "  ⚠️  Tag $GIT_TAG not found, trying branch main..."
        git clone --depth 1 \
            https://github.com/e2b-dev/desktop.git \
            "$REPO_DIR"
    }
fi

# find JS SDK directory - try common locations
JS_DIR=""
for dir in "$REPO_DIR/js" "$REPO_DIR/packages/js-sdk" "$REPO_DIR/packages/sdk" "$REPO_DIR/js-sdk"; do
    if [[ -d "$dir" ]]; then
        JS_DIR="$dir"
        break
    fi
done

if [[ -z "$JS_DIR" ]]; then
    echo "  ⚠️  No JS SDK directory found in desktop repo, skipping..."
    echo "  → Repo structure:"
    ls -la "$REPO_DIR" 2>/dev/null || true
    ls -la "$REPO_DIR/packages" 2>/dev/null || true
    exit 0
fi

cd "$JS_DIR"

# install dependencies
echo "  → Installing dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install --ignore-scripts 2>&1 || npm install --legacy-peer-deps 2>&1
else
    npm install --legacy-peer-deps 2>&1
fi

# check if there's a typedoc config, otherwise use our default
if [[ -f "typedoc.json" ]]; then
    echo "  → Running TypeDoc with repo config..."
    npx typedoc --plugin typedoc-plugin-markdown \
        --plugin "$CONFIGS_DIR/typedoc-theme.js"
else
    echo "  → Running TypeDoc with default config..."
    cp "$CONFIGS_DIR/typedoc.json" ./typedoc.docs.json
    npx typedoc --options ./typedoc.docs.json \
        --plugin typedoc-plugin-markdown \
        --plugin "$CONFIGS_DIR/typedoc-theme.js"
fi

# process generated files - flatten structure for Mintlify
cd sdk_ref

# remove README if exists
rm -f README.md

# flatten nested structure
find . -mindepth 2 -type f -name "*.md" | while read -r file; do
    dir=$(dirname "$file")
    filename=$(basename "$file")
    
    if [[ "$filename" == "page.md" || "$filename" == "index.md" ]]; then
        module=$(basename "$dir")
        mv "$file" "./${module}.md" 2>/dev/null || true
    else
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
TARGET_DIR="$DOCS_DIR/docs/sdk-reference/desktop-js-sdk/$VERSION"
mkdir -p "$TARGET_DIR"

echo "  → Copying files to $TARGET_DIR"
cp *.mdx "$TARGET_DIR/" 2>/dev/null || echo "  ⚠️  No MDX files to copy"

# list generated files
echo "  → Generated files:"
ls -la "$TARGET_DIR" 2>/dev/null || echo "  ⚠️  No files generated"

echo "  ✅ Desktop JS SDK $VERSION complete"

