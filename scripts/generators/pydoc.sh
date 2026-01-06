#!/usr/bin/env bash

# pydoc-markdown generator for Python SDKs
# Generates markdown documentation using pydoc-markdown

# process generated mdx files (cleanup formatting)
process_mdx() {
    local file="$1"
    # remove package path display links
    sed -i'' -e '/<a[^>]*>.*<\/a>/d' "${file}" 2>/dev/null || true
    # remove h1 headers
    sed -i'' -e '/^# /d' "${file}" 2>/dev/null || true
    # remove " Objects" suffix from h2 headers
    sed -i'' -e '/^## / s/ Objects$//' "${file}" 2>/dev/null || true
    # convert h4 to h3
    sed -i'' -e 's/^####/###/' "${file}" 2>/dev/null || true
}

generate_pydoc() {
    local sdk_dir="$1"
    local packages="$2"
    local submodules="$3"
    
    cd "$sdk_dir"
    mkdir -p sdk_ref
    
    echo "  → Generating documentation for packages..."
    
    # generate for each main package
    for pkg in $packages; do
        local output_name="${pkg##*.}"  # get last part after dot
        echo "    → Processing ${pkg}..."
        
        if poetry run pydoc-markdown -p "$pkg" > "sdk_ref/${output_name}.mdx" 2>/dev/null; then
            process_mdx "sdk_ref/${output_name}.mdx"
        else
            echo "    ⚠️  Failed to generate docs for ${pkg}"
            rm -f "sdk_ref/${output_name}.mdx"
        fi
    done
    
    # generate for submodules if provided
    if [[ -n "$submodules" ]]; then
        for submod in $submodules; do
            local output_name="${submod##*.}"
            echo "    → Processing ${submod}..."
            
            if poetry run pydoc-markdown -p "$submod" > "sdk_ref/${output_name}.mdx" 2>/dev/null; then
                process_mdx "sdk_ref/${output_name}.mdx"
            else
                echo "    ⚠️  Failed to generate docs for ${submod}"
                rm -f "sdk_ref/${output_name}.mdx"
            fi
        done
    fi
    
    return 0
}

