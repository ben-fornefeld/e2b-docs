#!/usr/bin/env bash

# CLI documentation generator
# Builds CLI and generates documentation using commands2md utility

generate_cli_docs() {
    local sdk_dir="$1"
    
    cd "$sdk_dir"
    
    # build CLI first
    echo "  → Building CLI..."
    if command -v pnpm &> /dev/null; then
        pnpm run build 2>&1 || npx tsup 2>&1 || {
            echo "  ❌ CLI build failed"
            return 1
        }
    else
        npm run build 2>&1 || npx tsup 2>&1 || {
            echo "  ❌ CLI build failed"
            return 1
        }
    fi
    
    # generate documentation using the CLI's commands2md utility
    echo "  → Generating documentation..."
    mkdir -p sdk_ref
    
    # the CLI has a special script for generating docs
    if [[ -f "scripts/commands2md.js" ]]; then
        node scripts/commands2md.js sdk_ref 2>/dev/null || {
            # fallback: try running the built CLI
            node dist/index.js docs --output sdk_ref 2>/dev/null || true
        }
    else
        # try common doc generation commands
        node dist/index.js docs --output sdk_ref 2>/dev/null || \
        node dist/index.js generate-docs --output sdk_ref 2>/dev/null || true
    fi
    
    # rename .md to .mdx
    cd sdk_ref
    for file in *.md; do
        [[ -f "$file" ]] && mv "$file" "${file%.md}.mdx"
    done
    
    return 0
}

