#!/usr/bin/env bash

set -euo pipefail

# SDK Reference Documentation Generator
# Usage: ./generate-sdk-reference.sh [--sdk <sdk-name>] [--version <version>]
#        ./generate-sdk-reference.sh --all
#
# Examples:
#   ./generate-sdk-reference.sh --sdk js-sdk --version v2.9.0
#   ./generate-sdk-reference.sh --sdk python-sdk --version v2.9.0
#   ./generate-sdk-reference.sh --all --version latest

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# defaults
SDK_TYPE="all"
VERSION="latest"

# parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sdk)
            # only set if value is non-empty and not another flag
            if [[ -n "${2:-}" && ! "$2" =~ ^-- ]]; then
                SDK_TYPE="$2"
                shift 2
            else
                shift
            fi
            ;;
        --version)
            # only set if value is non-empty and not another flag
            if [[ -n "${2:-}" && ! "$2" =~ ^-- ]]; then
                VERSION="$2"
                shift 2
            else
                shift
            fi
            ;;
        --all)
            SDK_TYPE="all"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# create temp directory for cloning repos
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "🚀 SDK Reference Generator"
echo "   SDK: $SDK_TYPE"
echo "   Version: $VERSION"
echo "   Temp dir: $TEMP_DIR"
echo ""

# helper to run individual SDK generators
run_generator() {
    local sdk="$1"
    local version="$2"
    local generator="$SCRIPT_DIR/sdk-generators/${sdk}.sh"
    
    if [[ -f "$generator" ]]; then
        echo "📦 Generating $sdk..."
        chmod +x "$generator"
        "$generator" "$version" "$TEMP_DIR" "$DOCS_DIR"
    else
        echo "⚠️  Generator not found: $generator"
    fi
}

case "$SDK_TYPE" in
    js-sdk)
        run_generator "js-sdk" "$VERSION"
        ;;
    python-sdk)
        run_generator "python-sdk" "$VERSION"
        ;;
    cli)
        run_generator "cli" "$VERSION"
        ;;
    code-interpreter-js-sdk)
        run_generator "code-interpreter-js-sdk" "$VERSION"
        ;;
    code-interpreter-python-sdk)
        run_generator "code-interpreter-python-sdk" "$VERSION"
        ;;
    desktop-js-sdk)
        run_generator "desktop-js-sdk" "$VERSION"
        ;;
    desktop-python-sdk)
        run_generator "desktop-python-sdk" "$VERSION"
        ;;
    all)
        # generate all SDKs from main e2b repo
        run_generator "js-sdk" "$VERSION"
        run_generator "python-sdk" "$VERSION"
        run_generator "cli" "$VERSION"
        
        # generate SDKs from external repos
        run_generator "code-interpreter-js-sdk" "$VERSION"
        run_generator "code-interpreter-python-sdk" "$VERSION"
        run_generator "desktop-js-sdk" "$VERSION"
        run_generator "desktop-python-sdk" "$VERSION"
        ;;
    *)
        echo "❌ Unknown SDK type: $SDK_TYPE"
        echo "   Valid options: js-sdk, python-sdk, cli, code-interpreter-js-sdk,"
        echo "                  code-interpreter-python-sdk, desktop-js-sdk,"
        echo "                  desktop-python-sdk, all"
        exit 1
        ;;
esac

# generate navigation JSON after all SDKs are generated
echo ""
echo "📝 Generating navigation JSON..."
node "$SCRIPT_DIR/generate-sdk-nav.js"

# merge navigation into docs.json
echo ""
echo "🔄 Merging navigation into docs.json..."
node "$SCRIPT_DIR/merge-sdk-nav.js"

echo ""
echo "✅ SDK reference generation complete"

