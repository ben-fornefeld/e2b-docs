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
    
    # the CLI uses -cmd2md flag to generate markdown docs
    NODE_ENV=development node dist/index.js -cmd2md 2>&1 || {
        echo "  ⚠️  CLI doc generation failed"
        return 1
    }
    
    # rename .md to .mdx (if any .md files exist)
    cd sdk_ref
    shopt -s nullglob
    for file in *.md; do
        mv "$file" "${file%.md}.mdx"
    done
    shopt -u nullglob
    
    return 0
}

