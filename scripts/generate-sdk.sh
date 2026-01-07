#!/usr/bin/env bash
set -euo pipefail

SDK_KEY="$1"
VERSION="$2"
TEMP_DIR="$3"
DOCS_DIR="$4"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/sdks.json"
CONFIGS_DIR="$SCRIPT_DIR/configs"

source "$SCRIPT_DIR/lib/common.sh"

get_config() {
    local path="$1"
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; console.log(c && c.$path !== undefined ? c.$path : '')"
}

get_config_array() {
    local path="$1"
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; const v = c && c.$path; if(Array.isArray(v)) console.log(v.join(' '));"
}

DISPLAY_NAME=$(get_config "displayName")
REPO=$(get_config "repo")
TAG_PATTERN=$(get_config "tagPattern")
TAG_FORMAT=$(get_config "tagFormat")
GENERATOR=$(get_config "generator")
REQUIRED=$(get_config "required")
SDK_PATH=$(get_config "sdkPath")
SDK_PATHS=$(get_config_array "sdkPaths")
PACKAGES=$(get_config_array "packages")
MIN_VERSION=$(get_config "minVersion")

if [[ -z "$DISPLAY_NAME" ]]; then
    echo "  ❌ SDK '$SDK_KEY' not found in configuration"
    exit 1
fi

echo "  → $DISPLAY_NAME version: $VERSION"

# determine versions to process
VERSIONS_TO_PROCESS=""

if [[ "$VERSION" == "all" ]]; then
    echo "  → Discovering all versions..."
    ALL_VERSIONS=$(get_all_versions "$REPO" "$TAG_PATTERN")
    
    if [[ -z "$ALL_VERSIONS" ]]; then
        if [[ "$REQUIRED" == "true" ]]; then
            echo "  ❌ No tags found for $DISPLAY_NAME"
            exit 1
        else
            echo "  ⚠️  No tags found, skipping..."
            exit 0
        fi
    fi
    
    # filter by minVersion if set
    if [[ -n "$MIN_VERSION" ]]; then
        ALL_VERSIONS=$(filter_min_version "$ALL_VERSIONS" "$MIN_VERSION")
        echo "  → Filtered to versions >= $MIN_VERSION"
    fi
    
    # apply limit if set (from SDK_VERSION_LIMIT env var)
    if [[ -n "${SDK_VERSION_LIMIT:-}" && "$SDK_VERSION_LIMIT" =~ ^[0-9]+$ ]]; then
        ALL_VERSIONS=$(echo "$ALL_VERSIONS" | head -n "$SDK_VERSION_LIMIT")
        echo "  → Limited to last $SDK_VERSION_LIMIT versions"
    fi
    
    TOTAL_COUNT=$(echo "$ALL_VERSIONS" | wc -l | tr -d ' ')
    EXISTING_COUNT=$(count_sdk_versions "$SDK_KEY" "$DOCS_DIR")
    
    echo ""
    echo "  📊 Version Discovery Report:"
    echo "     Total tags found: $TOTAL_COUNT"
    echo "     Already generated: $EXISTING_COUNT"
    
    # filter to only missing versions
    MISSING_VERSIONS=""
    SKIP_COUNT=0
    for version in $ALL_VERSIONS; do
        if version_exists "$SDK_KEY" "$version" "$DOCS_DIR"; then
            ((SKIP_COUNT++)) || true
        else
            if [[ -z "$MISSING_VERSIONS" ]]; then
                MISSING_VERSIONS="$version"
            else
                MISSING_VERSIONS="$MISSING_VERSIONS $version"
            fi
        fi
    done
    
    MISSING_COUNT=$(echo "$MISSING_VERSIONS" | wc -w | tr -d ' ')
    echo "     To generate: $MISSING_COUNT"
    echo ""
    
    if [[ -z "$MISSING_VERSIONS" || "$MISSING_COUNT" -eq 0 ]]; then
        echo "  ✅ All versions already generated, nothing to do"
        exit 0
    fi
    
    VERSIONS_TO_PROCESS="$MISSING_VERSIONS"
else
    # single version (latest or specific)
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
    
    if version_exists "$SDK_KEY" "$RESOLVED_VERSION" "$DOCS_DIR"; then
        echo "  ✓ $RESOLVED_VERSION already exists, skipping"
        exit 0
    fi
    
    VERSIONS_TO_PROCESS="$RESOLVED_VERSION"
fi

# track generation results
GENERATED_COUNT=0
FAILED_COUNT=0
FAILED_VERSIONS=""

# process each version
for RESOLVED_VERSION in $VERSIONS_TO_PROCESS; do
    echo ""
    echo "  📦 Generating $RESOLVED_VERSION..."
    
    # use version-specific temp dir for isolation
    REPO_DIR="$TEMP_DIR/${SDK_KEY}-${RESOLVED_VERSION}"
    GIT_TAG=$(echo "$TAG_FORMAT" | sed "s/{version}/${RESOLVED_VERSION#v}/")
    
    # attempt generation with error handling
    if ! (
        set -e
        
        clone_repo "$REPO" "$GIT_TAG" "$REPO_DIR"
        
        SDK_DIR=""
        if [[ -n "$SDK_PATH" ]]; then
            SDK_DIR="$REPO_DIR/$SDK_PATH"
            if [[ ! -d "$SDK_DIR" ]]; then
                echo "  ❌ SDK directory not found: $SDK_DIR"
                exit 1
            fi
        elif [[ -n "$SDK_PATHS" ]]; then
            SDK_DIR=$(find_sdk_directory "$REPO_DIR" $SDK_PATHS) || true
            if [[ -z "$SDK_DIR" ]]; then
                echo "  ⚠️  SDK directory not found in any of: $SDK_PATHS"
                exit 1
            fi
        else
            SDK_DIR="$REPO_DIR"
        fi
        
        install_dependencies_cached "$SDK_DIR" "$GENERATOR" "$TEMP_DIR"
        
        source "$SCRIPT_DIR/generators/${GENERATOR}.sh"
        
        case "$GENERATOR" in
            typedoc)
                generate_typedoc "$SDK_DIR" "$CONFIGS_DIR"
                ;;
            pydoc)
                SUBMODULES=$(node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; const v = c?.submodules?.['e2b.template']; if(Array.isArray(v)) console.log(v.join(' '));" || echo "")
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
        
        if [[ -d "$SDK_DIR/sdk_ref" ]]; then
            flatten_markdown "$SDK_DIR/sdk_ref"
            
            copy_to_docs "$SDK_DIR/sdk_ref" \
                "$DOCS_DIR/docs/sdk-reference/$SDK_KEY/$RESOLVED_VERSION" \
                "$DISPLAY_NAME" "$RESOLVED_VERSION"
        else
            echo "  ⚠️  No sdk_ref directory found"
            exit 1
        fi
    ); then
        echo "  ❌ Failed to generate $RESOLVED_VERSION"
        ((FAILED_COUNT++)) || true
        if [[ -z "$FAILED_VERSIONS" ]]; then
            FAILED_VERSIONS="$RESOLVED_VERSION"
        else
            FAILED_VERSIONS="$FAILED_VERSIONS $RESOLVED_VERSION"
        fi
        # continue to next version instead of failing
        continue
    fi
    
    echo "  ✅ Complete: $RESOLVED_VERSION"
    ((GENERATED_COUNT++)) || true
    
    # cleanup version-specific temp dir to save space
    rm -rf "$REPO_DIR"
done

# print summary
echo ""
echo "  📊 Generation Summary for $DISPLAY_NAME:"
echo "     Successfully generated: $GENERATED_COUNT"
if [[ $FAILED_COUNT -gt 0 ]]; then
    echo "     Failed: $FAILED_COUNT ($FAILED_VERSIONS)"
fi

# exit with error if all failed and required
if [[ $GENERATED_COUNT -eq 0 && "$REQUIRED" == "true" && -n "$VERSIONS_TO_PROCESS" ]]; then
    echo "  ❌ All versions failed to generate"
    exit 1
fi
