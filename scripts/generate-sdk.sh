#!/usr/bin/env bash
set -euo pipefail

# Universal SDK Generator
# Usage: ./generate-sdk.sh <sdk-key> <version> <temp_dir> <docs_dir>
#
# This script replaces all individual SDK generator scripts by reading
# configuration from sdks.json and using shared utility functions.

SDK_KEY="$1"
VERSION="$2"
TEMP_DIR="$3"
DOCS_DIR="$4"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/sdks.json"
CONFIGS_DIR="$SCRIPT_DIR/configs"

# source shared utilities
source "$SCRIPT_DIR/lib/common.sh"

# helper to read config values using node
get_config() {
    local path="$1"
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; console.log(c && c.$path !== undefined ? c.$path : '')"
}

get_config_array() {
    local path="$1"
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; const v = c && c.$path; if(Array.isArray(v)) console.log(v.join(' '));"
}

# read SDK configuration
DISPLAY_NAME=$(get_config "displayName")
REPO=$(get_config "repo")
TAG_PATTERN=$(get_config "tagPattern")
TAG_FORMAT=$(get_config "tagFormat")
GENERATOR=$(get_config "generator")
REQUIRED=$(get_config "required")
SDK_PATH=$(get_config "sdkPath")
SDK_PATHS=$(get_config_array "sdkPaths")
PACKAGES=$(get_config_array "packages")

# validate configuration
if [[ -z "$DISPLAY_NAME" ]]; then
    echo "  ❌ SDK '$SDK_KEY' not found in configuration"
    exit 1
fi

echo "  → $DISPLAY_NAME version: $VERSION"

# resolve version
RESOLVED_VERSION=$(resolve_version "$REPO" "$TAG_PATTERN" "$VERSION") || true

if [[ -z "$RESOLVED_VERSION" ]]; then
    if [[ "$REQUIRED" == "true" ]]; then
        echo "  ❌ No tags found for $DISPLAY_NAME"
        exit 1
    else
        echo "  ⚠️  No tags found, skipping..."
        exit 0
    fi
fi
echo "  → Resolved to: $RESOLVED_VERSION"

# build git tag from format
GIT_TAG=$(echo "$TAG_FORMAT" | sed "s/{version}/${RESOLVED_VERSION#v}/")

# clone repo
REPO_DIR="$TEMP_DIR/${SDK_KEY}"
clone_repo "$REPO" "$GIT_TAG" "$REPO_DIR"

# find SDK directory
SDK_DIR=""
if [[ -n "$SDK_PATH" ]]; then
    # single path specified
    SDK_DIR="$REPO_DIR/$SDK_PATH"
    if [[ ! -d "$SDK_DIR" ]]; then
        echo "  ❌ SDK directory not found: $SDK_DIR"
        if [[ "$REQUIRED" == "true" ]]; then
            exit 1
        else
            exit 0
        fi
    fi
elif [[ -n "$SDK_PATHS" ]]; then
    # multiple paths to try
    SDK_DIR=$(find_sdk_directory "$REPO_DIR" $SDK_PATHS) || true
    if [[ -z "$SDK_DIR" ]]; then
        echo "  ⚠️  SDK directory not found in any of: $SDK_PATHS"
        echo "  → Repo structure:"
        ls -la "$REPO_DIR" 2>/dev/null || true
        ls -la "$REPO_DIR/packages" 2>/dev/null || true
        if [[ "$REQUIRED" == "true" ]]; then
            exit 1
        else
            exit 0
        fi
    fi
else
    # default to repo root
    SDK_DIR="$REPO_DIR"
fi

# install dependencies
install_dependencies "$SDK_DIR" "$GENERATOR"

# source and run the appropriate generator
source "$SCRIPT_DIR/generators/${GENERATOR}.sh"

case "$GENERATOR" in
    typedoc)
        generate_typedoc "$SDK_DIR" "$CONFIGS_DIR"
        ;;
    pydoc)
        # build submodules string if exists
        SUBMODULES=""
        if [[ "$SDK_KEY" == "python-sdk" ]]; then
            SUBMODULES="e2b.template.logger e2b.template.readycmd"
        fi
        generate_pydoc "$SDK_DIR" "$PACKAGES" "$SUBMODULES"
        ;;
    cli)
        generate_cli_docs "$SDK_DIR"
        ;;
    *)
        echo "  ❌ Unknown generator: $GENERATOR"
        exit 1
        ;;
esac

# flatten markdown structure (for TypeDoc output)
if [[ -d "$SDK_DIR/sdk_ref" ]]; then
    flatten_markdown "$SDK_DIR/sdk_ref"
    
    # copy to docs repo
    copy_to_docs "$SDK_DIR/sdk_ref" \
        "$DOCS_DIR/docs/sdk-reference/$SDK_KEY/$RESOLVED_VERSION" \
        "$DISPLAY_NAME" "$RESOLVED_VERSION"
else
    echo "  ⚠️  No sdk_ref directory found"
fi

