#!/usr/bin/env bash

set -euo pipefail

# Python SDK Reference Generator
# Usage: ./python-sdk.sh <version> <temp_dir> <docs_dir>

VERSION="$1"
TEMP_DIR="$2"
DOCS_DIR="$3"

echo "  → Python SDK version: $VERSION"

# determine the git tag to clone
if [[ "$VERSION" == "latest" ]]; then
    # get latest tag from e2b repo (format: e2b@X.Y.Z)
    VERSION=$(git ls-remote --tags --refs https://github.com/e2b-dev/e2b.git | \
              grep 'refs/tags/e2b@' | \
              sed 's/.*refs\/tags\/e2b@/v/' | \
              sort -V | tail -1) || true
    
    if [[ -z "$VERSION" ]]; then
        echo "  ❌ No Python SDK tags found"
        exit 1
    fi
    echo "  → Resolved latest to: $VERSION"
fi

# convert version to git tag format (v2.9.0 -> e2b@2.9.0)
GIT_TAG="e2b@${VERSION#v}"

# clone e2b repo at specific version
REPO_DIR="$TEMP_DIR/e2b-python-sdk"
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

cd "$REPO_DIR/packages/python-sdk"

# install poetry and dependencies
echo "  → Installing dependencies with poetry..."
poetry install --quiet 2>/dev/null || pip install pydoc-markdown

# packages to generate docs for
packages=("sandbox_sync" "sandbox_async" "exceptions" "template" "template_sync" "template_async")
template_submodules=("logger" "readycmd")

# create output directory
mkdir -p sdk_ref

# function to process generated markdown
process_mdx() {
    local file=$1
    # remove package path display
    sed -i'' -e '/<a[^>]*>.*<\/a>/d' "${file}" 2>/dev/null || true
    # remove empty hyperlinks
    sed -i'' -e '/^# /d' "${file}" 2>/dev/null || true
    # remove " Objects" from lines starting with "##"
    sed -i'' -e '/^## / s/ Objects$//' "${file}" 2>/dev/null || true
    # replace lines starting with "####" with "###"
    sed -i'' -e 's/^####/###/' "${file}" 2>/dev/null || true
}

echo "  → Generating documentation for packages..."

for package in "${packages[@]}"; do
    echo "    → Processing e2b.${package}..."
    
    # generate raw SDK reference markdown file
    poetry run pydoc-markdown -p "e2b.${package}" > "sdk_ref/${package}.mdx" 2>/dev/null || {
        echo "    ⚠️  Failed to generate docs for ${package}"
        continue
    }
    
    # process the generated markdown
    process_mdx "sdk_ref/${package}.mdx"
done

# generate documentation for template submodules
for submodule in "${template_submodules[@]}"; do
    echo "    → Processing e2b.template.${submodule}..."
    
    # generate raw SDK reference markdown file
    poetry run pydoc-markdown -p "e2b.template.${submodule}" > "sdk_ref/${submodule}.mdx" 2>/dev/null || {
        echo "    ⚠️  Failed to generate docs for template.${submodule}"
        continue
    }
    
    # process the generated markdown
    process_mdx "sdk_ref/${submodule}.mdx"
done

# copy to docs repo
TARGET_DIR="$DOCS_DIR/docs/sdk-reference/python-sdk/$VERSION"
mkdir -p "$TARGET_DIR"

echo "  → Copying files to $TARGET_DIR"
cd sdk_ref
cp *.mdx "$TARGET_DIR/" 2>/dev/null || echo "  ⚠️  No MDX files to copy"

# list generated files
echo "  → Generated files:"
ls -la "$TARGET_DIR" 2>/dev/null || echo "  ⚠️  No files generated"

echo "  ✅ Python SDK $VERSION complete"

