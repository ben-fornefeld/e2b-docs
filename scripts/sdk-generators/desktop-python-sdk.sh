#!/usr/bin/env bash

set -euo pipefail

# Desktop Python SDK Reference Generator
# Usage: ./desktop-python-sdk.sh <version> <temp_dir> <docs_dir>

VERSION="$1"
TEMP_DIR="$2"
DOCS_DIR="$3"

echo "  → Desktop Python SDK version: $VERSION"

# determine the git tag to clone
if [[ "$VERSION" == "latest" ]]; then
    # get latest tag from desktop repo (format: e2b-desktop@X.Y.Z)
    VERSION=$(git ls-remote --tags --refs https://github.com/e2b-dev/desktop.git | \
              grep 'refs/tags/e2b-desktop@' | \
              sed 's/.*refs\/tags\/e2b-desktop@/v/' | \
              sort -V | tail -1) || true
    
    if [[ -z "$VERSION" ]]; then
        echo "  ⚠️  No Python SDK tags found, skipping..."
        exit 0
    fi
    echo "  → Resolved latest to: $VERSION"
fi

# convert version to git tag format
GIT_TAG="e2b-desktop@${VERSION#v}"

# clone desktop repo at specific version
REPO_DIR="$TEMP_DIR/desktop-python"
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

# find Python SDK directory - try common locations
PY_DIR=""
for dir in "$REPO_DIR/python" "$REPO_DIR/packages/python-sdk" "$REPO_DIR/packages/python" "$REPO_DIR/python-sdk"; do
    if [[ -d "$dir" ]]; then
        PY_DIR="$dir"
        break
    fi
done

if [[ -z "$PY_DIR" ]]; then
    echo "  ⚠️  No Python SDK directory found in desktop repo, skipping..."
    echo "  → Repo structure:"
    ls -la "$REPO_DIR" 2>/dev/null || true
    ls -la "$REPO_DIR/packages" 2>/dev/null || true
    exit 0
fi

cd "$PY_DIR"

# install dependencies
echo "  → Installing dependencies with poetry..."
poetry install --quiet 2>/dev/null || pip install pydoc-markdown

# packages to generate docs for
packages=("e2b_desktop")

# create output directory
mkdir -p sdk_ref

# function to process generated markdown
process_mdx() {
    local file=$1
    sed -i'' -e '/<a[^>]*>.*<\/a>/d' "${file}" 2>/dev/null || true
    sed -i'' -e '/^# /d' "${file}" 2>/dev/null || true
    sed -i'' -e '/^## / s/ Objects$//' "${file}" 2>/dev/null || true
    sed -i'' -e 's/^####/###/' "${file}" 2>/dev/null || true
}

echo "  → Generating documentation..."

for package in "${packages[@]}"; do
    echo "    → Processing ${package}..."
    
    poetry run pydoc-markdown -p "${package}" > "sdk_ref/sandbox.mdx" 2>/dev/null || {
        echo "    ⚠️  Failed to generate docs for ${package}"
        continue
    }
    
    process_mdx "sdk_ref/sandbox.mdx"
done

# copy to docs repo
TARGET_DIR="$DOCS_DIR/docs/sdk-reference/desktop-python-sdk/$VERSION"
mkdir -p "$TARGET_DIR"

echo "  → Copying files to $TARGET_DIR"
cd sdk_ref
cp *.mdx "$TARGET_DIR/" 2>/dev/null || echo "  ⚠️  No MDX files to copy"

# list generated files
echo "  → Generated files:"
ls -la "$TARGET_DIR" 2>/dev/null || echo "  ⚠️  No files generated"

echo "  ✅ Desktop Python SDK $VERSION complete"

