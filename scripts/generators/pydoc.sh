#!/usr/bin/env bash

# pydoc-markdown generator for Python SDKs
# Generates markdown documentation using pydoc-markdown

# process generated mdx files (cleanup formatting)
process_mdx() {
    local file="$1"
    local tmp_file="${file}.tmp"
    
    # remove package path display links
    sed '/<a[^>]*>.*<\/a>/d' "${file}" > "${tmp_file}" && mv "${tmp_file}" "${file}"
    # remove h1 headers
    sed '/^# /d' "${file}" > "${tmp_file}" && mv "${tmp_file}" "${file}"
    # remove " Objects" suffix from h2 headers
    sed '/^## / s/ Objects$//' "${file}" > "${tmp_file}" && mv "${tmp_file}" "${file}"
    # convert h4 to h3
    sed 's/^####/###/' "${file}" > "${tmp_file}" && mv "${tmp_file}" "${file}"
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

