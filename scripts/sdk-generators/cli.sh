#!/usr/bin/env bash

set -euo pipefail

# CLI Reference Generator
# Usage: ./cli.sh <version> <temp_dir> <docs_dir>

VERSION="$1"
TEMP_DIR="$2"
DOCS_DIR="$3"

echo "  → CLI version: $VERSION"

# determine the git tag to clone
if [[ "$VERSION" == "latest" ]]; then
    # get latest CLI tag from e2b repo (format: @e2b/cli@X.Y.Z)
    VERSION=$(git ls-remote --tags --refs https://github.com/e2b-dev/e2b.git | \
              grep 'refs/tags/@e2b/cli@' | \
              sed 's/.*refs\/tags\/@e2b\/cli@/v/' | \
              sort -V | tail -1) || true
    
    if [[ -z "$VERSION" ]]; then
        echo "  ❌ No CLI tags found"
        exit 1
    fi
    echo "  → Resolved latest to: $VERSION"
fi

# convert version to git tag format (v2.2.0 -> @e2b/cli@2.2.0)
GIT_TAG="@e2b/cli@${VERSION#v}"

# clone e2b repo at specific version
REPO_DIR="$TEMP_DIR/e2b-cli"
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

CLI_DIR="$REPO_DIR/packages/cli"
if [[ ! -d "$CLI_DIR" ]]; then
    echo "  ❌ Directory not found: $CLI_DIR"
    echo "  → Checking repo structure..."
    ls -la "$REPO_DIR" || true
    exit 1
fi

cd "$CLI_DIR"

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

# build and generate
echo "  → Building CLI..."
npx tsup

echo "  → Generating documentation..."
mkdir -p sdk_ref
NODE_ENV=development node dist/index.js -cmd2md

# process output - files should already be flat (auth.md, sandbox.md, etc.)
cd sdk_ref

# rename .md to .mdx
for file in *.md; do
    if [[ -f "$file" ]]; then
        mv "$file" "${file%.md}.mdx"
    fi
done

# copy to docs repo
TARGET_DIR="$DOCS_DIR/docs/sdk-reference/cli/$VERSION"
mkdir -p "$TARGET_DIR"

echo "  → Copying files to $TARGET_DIR"
cp *.mdx "$TARGET_DIR/" 2>/dev/null || echo "  ⚠️  No MDX files to copy"

# list generated files
echo "  → Generated files:"
ls -la "$TARGET_DIR" 2>/dev/null || echo "  ⚠️  No files generated"

echo "  ✅ CLI $VERSION complete"

