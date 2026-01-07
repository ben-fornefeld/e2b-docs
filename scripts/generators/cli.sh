#!/usr/bin/env bash

generate_cli_docs() {
    local sdk_dir="$1"
    
    cd "$sdk_dir"
    
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
    
    echo "  → Generating documentation..."
    mkdir -p sdk_ref
    
    NODE_ENV=development node dist/index.js -cmd2md 2>&1 || {
        echo "  ⚠️  CLI doc generation failed"
        return 1
    }
    
    cd sdk_ref
    shopt -s nullglob
    for file in *.md; do
        mv "$file" "${file%.md}.mdx"
    done
    shopt -u nullglob
    
    return 0
}

