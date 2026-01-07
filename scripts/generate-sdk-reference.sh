#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/sdks.json"

SDK_TYPE="all"
VERSION="latest"

while [[ $# -gt 0 ]]; do
    case $1 in
        --sdk)
            if [[ -n "${2:-}" && ! "$2" =~ ^-- ]]; then
                SDK_TYPE="$2"
                shift 2
            else
                shift
            fi
            ;;
        --version)
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

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "🚀 SDK Reference Generator"
echo "   SDK: $SDK_TYPE"
echo "   Version: $VERSION"
echo "   Temp dir: $TEMP_DIR"
echo ""

get_sdk_list() {
    node -e "console.log(Object.keys(require('$CONFIG_FILE').sdks).join(' '))"
}

run_generator() {
    local sdk="$1"
    local version="$2"
    
    echo "📦 Generating $sdk..."
    chmod +x "$SCRIPT_DIR/generate-sdk.sh"
    "$SCRIPT_DIR/generate-sdk.sh" "$sdk" "$version" "$TEMP_DIR" "$DOCS_DIR" || {
        echo "  ⚠️  Generator failed for $sdk"
        return 0
    }
}

if [[ "$SDK_TYPE" == "all" ]]; then
    SDK_LIST=$(get_sdk_list)
    for sdk in $SDK_LIST; do
        run_generator "$sdk" "$VERSION"
    done
else
    run_generator "$SDK_TYPE" "$VERSION"
fi

echo ""
echo "📝 Generating navigation JSON..."
node "$SCRIPT_DIR/generate-sdk-nav.js"

echo ""
echo "🔄 Merging navigation into docs.json..."
node "$SCRIPT_DIR/merge-sdk-nav.js"

echo ""
echo "✅ SDK reference generation complete"
