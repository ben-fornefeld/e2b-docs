#!/usr/bin/env bash

generate_typedoc() {
    local sdk_dir="$1"
    local configs_dir="$2"
    
    cd "$sdk_dir"
    
    if [[ -f "typedoc.json" ]]; then
        echo "  → Running TypeDoc with repo config..."
        npx typedoc --plugin typedoc-plugin-markdown \
            --plugin "$configs_dir/typedoc-theme.js" || {
            echo "  ❌ TypeDoc generation failed"
            return 1
        }
    else
        echo "  → Running TypeDoc with default config..."
        cp "$configs_dir/typedoc.json" ./typedoc.docs.json
        npx typedoc --options ./typedoc.docs.json \
            --plugin typedoc-plugin-markdown \
            --plugin "$configs_dir/typedoc-theme.js" || {
            echo "  ❌ TypeDoc generation failed"
            return 1
        }
    fi
    
    return 0
}

