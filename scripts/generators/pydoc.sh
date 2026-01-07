#!/usr/bin/env bash

process_mdx() {
    local file="$1"
    local tmp="${file}.tmp"
    
    sed '/<a[^>]*>.*<\/a>/d' "$file" > "$tmp" && mv "$tmp" "$file"
    sed '/^# /d' "$file" > "$tmp" && mv "$tmp" "$file"
    sed '/^## / s/ Objects$//' "$file" > "$tmp" && mv "$tmp" "$file"
    sed 's/^####/###/' "$file" > "$tmp" && mv "$tmp" "$file"
}

process_package() {
    local pkg="$1"
    local sdk_dir="$2"
    local name="${pkg##*.}"
    name="${name#e2b_}"
    
    echo "    → Processing $pkg..."
    
    if poetry run pydoc-markdown -p "$pkg" > "$sdk_dir/sdk_ref/${name}.mdx" 2>/dev/null; then
        process_mdx "$sdk_dir/sdk_ref/${name}.mdx"
    else
        echo "    ⚠️  Failed to generate docs for $pkg"
        rm -f "$sdk_dir/sdk_ref/${name}.mdx"
    fi
}

generate_pydoc() {
    local sdk_dir="$1"
    local packages="$2"
    local submodules="$3"
    
    cd "$sdk_dir"
    mkdir -p sdk_ref
    
    echo "  → Generating documentation for packages..."
    
    for pkg in $packages; do
        process_package "$pkg" "$sdk_dir"
    done
    
    for submod in $submodules; do
        process_package "$submod" "$sdk_dir"
    done
    
    return 0
}
