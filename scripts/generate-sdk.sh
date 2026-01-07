#!/usr/bin/env bash
set -euo pipefail

SDK_KEY="$1"
VERSION_ARG="$2"
TEMP_DIR="$3"
DOCS_DIR="$4"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/sdks.json"
CONFIGS_DIR="$SCRIPT_DIR/configs"

source "$SCRIPT_DIR/lib/common.sh"

read_config() {
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; console.log(c && c.$1 !== undefined ? c.$1 : '')"
}

read_config_array() {
    node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; const v = c && c.$1; if(Array.isArray(v)) console.log(v.join(' '));"
}

DISPLAY_NAME=$(read_config "displayName")
REPO=$(read_config "repo")
TAG_PATTERN=$(read_config "tagPattern")
TAG_FORMAT=$(read_config "tagFormat")
GENERATOR=$(read_config "generator")
IS_REQUIRED=$(read_config "required")
SDK_PATH=$(read_config "sdkPath")
SDK_PATHS=$(read_config_array "sdkPaths")
PACKAGES=$(read_config_array "packages")
MIN_VERSION=$(read_config "minVersion")

[[ -z "$DISPLAY_NAME" ]] && echo "  ❌ SDK '$SDK_KEY' not found in config" && exit 1

echo "  → $DISPLAY_NAME version: $VERSION_ARG"

PENDING_VERSIONS=""

if [[ "$VERSION_ARG" == "all" ]]; then
    echo "  → Discovering all versions..."
    REMOTE_VERSIONS=$(fetch_remote_tags "$REPO" "$TAG_PATTERN")
    
    if [[ -z "$REMOTE_VERSIONS" ]]; then
        [[ "$IS_REQUIRED" == "true" ]] && echo "  ❌ No tags found" && exit 1
        echo "  ⚠️  No tags found, skipping..."
        exit 0
    fi
    
    [[ -n "$MIN_VERSION" ]] && \
        REMOTE_VERSIONS=$(filter_by_min_version "$REMOTE_VERSIONS" "$MIN_VERSION") && \
        echo "  → Filtered to versions >= $MIN_VERSION"
    
    [[ -n "${SDK_VERSION_LIMIT:-}" ]] && [[ "$SDK_VERSION_LIMIT" =~ ^[0-9]+$ ]] && \
        REMOTE_VERSIONS=$(echo "$REMOTE_VERSIONS" | head -n "$SDK_VERSION_LIMIT") && \
        echo "  → Limited to last $SDK_VERSION_LIMIT versions"
    
    TOTAL=$(echo "$REMOTE_VERSIONS" | wc -l | tr -d ' ')
    LOCAL_VERSIONS=$(fetch_local_versions "$SDK_KEY" "$DOCS_DIR")
    EXISTING=$(echo "$LOCAL_VERSIONS" | wc -l | tr -d ' ')
    [[ -z "$LOCAL_VERSIONS" ]] && EXISTING=0
    
    echo ""
    echo "  📊 Version Discovery:"
    echo "     Remote: $TOTAL"
    echo "     Local: $EXISTING"
    
    if [[ $TOTAL -eq $EXISTING && $EXISTING -gt 0 ]]; then
        echo "  → Quick check: verifying..."
        MISSING=$(diff_versions "$REMOTE_VERSIONS" "$LOCAL_VERSIONS")
        [[ -z "$MISSING" ]] && echo "  ✅ All $TOTAL versions exist" && exit 0
    else
        MISSING=$(diff_versions "$REMOTE_VERSIONS" "$LOCAL_VERSIONS")
    fi
    
    MISSING_COUNT=$(echo "$MISSING" | wc -l | tr -d ' ')
    [[ -z "$MISSING" ]] && MISSING_COUNT=0
    
    echo "     Missing: $MISSING_COUNT"
    echo ""
    
    [[ $MISSING_COUNT -eq 0 ]] && echo "  ✅ Nothing to generate" && exit 0
    
    PENDING_VERSIONS="$MISSING"
else
    RESOLVED=$(resolve_latest_version "$REPO" "$TAG_PATTERN" "$VERSION_ARG")
    
    if [[ -z "$RESOLVED" ]]; then
        [[ "$IS_REQUIRED" == "true" ]] && echo "  ❌ No tags found" && exit 1
        echo "  ⚠️  No tags found, skipping..."
        exit 0
    fi
    
    version_exists "$SDK_KEY" "$RESOLVED" "$DOCS_DIR" && \
        echo "  ✓ $RESOLVED already exists" && exit 0
    
    PENDING_VERSIONS="$RESOLVED"
fi

generated=0
failed=0
failed_list=""

for version in $PENDING_VERSIONS; do
    echo ""
    echo "  📦 Generating $version..."
    
    repo_dir="$TEMP_DIR/${SDK_KEY}-${version}"
    git_tag=$(echo "$TAG_FORMAT" | sed "s/{version}/${version#v}/")
    
    if ! (
        set -e
        
        clone_repo "$REPO" "$git_tag" "$repo_dir"
        
        if [[ -n "$SDK_PATH" ]]; then
            sdk_dir="$repo_dir/$SDK_PATH"
            [[ ! -d "$sdk_dir" ]] && echo "  ❌ SDK path not found: $SDK_PATH" && exit 1
        elif [[ -n "$SDK_PATHS" ]]; then
            sdk_dir=$(locate_sdk_dir "$repo_dir" $SDK_PATHS)
            [[ -z "$sdk_dir" ]] && echo "  ❌ SDK not found in: $SDK_PATHS" && exit 1
        else
            sdk_dir="$repo_dir"
        fi
        
        install_with_cache "$sdk_dir" "$GENERATOR" "$TEMP_DIR"
        
        source "$SCRIPT_DIR/generators/${GENERATOR}.sh"
        
        case "$GENERATOR" in
            typedoc)
                generate_typedoc "$sdk_dir" "$CONFIGS_DIR"
                ;;
            pydoc)
                submodules=$(node -e "const c = require('$CONFIG_FILE').sdks['$SDK_KEY']; const v = c?.submodules?.['e2b.template']; if(Array.isArray(v)) console.log(v.join(' '));" || echo "")
                generate_pydoc "$sdk_dir" "$PACKAGES" "$submodules"
                ;;
            cli)
                generate_cli_docs "$sdk_dir"
                ;;
            *)
                echo "  ❌ Unknown generator: $GENERATOR" && exit 1
                ;;
        esac
        
        [[ ! -d "$sdk_dir/sdk_ref" ]] && echo "  ❌ No sdk_ref directory" && exit 1
        
        flatten_markdown "$sdk_dir/sdk_ref"
        copy_to_docs "$sdk_dir/sdk_ref" \
            "$DOCS_DIR/docs/sdk-reference/$SDK_KEY/$version" \
            "$DISPLAY_NAME" "$version"
    ); then
        echo "  ❌ Failed: $version"
        ((failed++)) || true
        failed_list="${failed_list:+$failed_list }$version"
        continue
    fi
    
    echo "  ✅ Complete: $version"
    ((generated++)) || true
    rm -rf "$repo_dir"
done

echo ""
echo "  📊 Summary:"
echo "     Generated: $generated"
[[ $failed -gt 0 ]] && echo "     Failed: $failed ($failed_list)"

if [[ $failed -gt 0 ]]; then
    if [[ "$IS_REQUIRED" == "true" ]]; then
        echo ""
        echo "  ❌ WORKFLOW ABORTED: Required SDK has failures"
        echo "  ❌ Failed: $failed_list"
        exit 1
    elif [[ $generated -eq 0 ]]; then
        echo ""
        echo "  ❌ WORKFLOW ABORTED: All versions failed"
        echo "  ❌ Failed: $failed_list"
        exit 1
    fi
fi
