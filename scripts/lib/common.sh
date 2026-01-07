#!/usr/bin/env bash

resolve_version() {
    local repo="$1"
    local tag_pattern="$2"
    local version="$3"
    
    if [[ "$version" != "latest" ]]; then
        echo "$version"
        return 0
    fi
    
    local sed_escaped_pattern=$(echo "$tag_pattern" | sed 's/[\/&@]/\\&/g')
    
    local resolved
    resolved=$(git ls-remote --tags --refs "$repo" 2>/dev/null | \
               grep "refs/tags/${tag_pattern}" | \
               sed "s|.*refs/tags/${sed_escaped_pattern}|v|" | \
               sort -V | tail -1) || true
    
    if [[ -z "$resolved" ]]; then
        return 1
    fi
    
    echo "$resolved"
}

clone_repo() {
    local repo="$1"
    local git_tag="$2"
    local target_dir="$3"
    
    if [[ -d "$target_dir" ]]; then
        return 0
    fi
    
    echo "  → Cloning repo at $git_tag..."
    git clone --depth 1 --branch "$git_tag" "$repo" "$target_dir" 2>/dev/null || {
        echo "  ⚠️  Tag $git_tag not found, trying branch main..."
        git clone --depth 1 "$repo" "$target_dir"
    }
}

find_sdk_directory() {
    local base_dir="$1"
    shift
    
    for path in "$@"; do
        local full_path="${base_dir}/${path}"
        if [[ -d "$full_path" ]]; then
            echo "$full_path"
            return 0
        fi
    done
    
    return 1
}

install_dependencies() {
    local sdk_dir="$1"
    local generator="$2"
    
    cd "$sdk_dir"
    
    echo "  → Installing dependencies..."
    case "$generator" in
        typedoc)
            if command -v pnpm &> /dev/null; then
                pnpm install --ignore-scripts 2>&1 || {
                    echo "  ⚠️  pnpm failed, trying npm..."
                    npm install --legacy-peer-deps 2>&1
                }
            else
                npm install --legacy-peer-deps 2>&1
            fi
            ;;
        pydoc)
            poetry install --quiet 2>/dev/null || pip install pydoc-markdown
            ;;
        cli)
            if command -v pnpm &> /dev/null; then
                pnpm install 2>&1 || npm install 2>&1
            else
                npm install 2>&1
            fi
            ;;
    esac
}

flatten_markdown() {
    local sdk_ref_dir="$1"
    
    cd "$sdk_ref_dir"
    rm -f README.md
    
    find . -mindepth 2 -type f -name "*.md" 2>/dev/null | while read -r file; do
        local dir=$(dirname "$file")
        local filename=$(basename "$file")
        
        if [[ "$filename" == "page.md" || "$filename" == "index.md" ]]; then
            local module=$(basename "$dir")
            mv "$file" "./${module}.md" 2>/dev/null || true
        else
            mv "$file" "./" 2>/dev/null || true
        fi
    done
    
    find . -type d -empty -delete 2>/dev/null || true
    
    shopt -s nullglob
    for file in *.md; do
        local mdx_file="${file%.md}.mdx"
        {
            echo "---"
            echo "sidebarTitle: \"$(basename "$file" .md)\""
            echo "mode: \"center\""
            echo "---"
            echo ""
            cat "$file"
        } > "$mdx_file"
        rm "$file"
    done
    shopt -u nullglob
    
    for file in *.mdx; do
        if ! head -n1 "$file" | grep -q "^---$"; then
            local tmp_file="${file}.tmp"
            {
                echo "---"
                echo "sidebarTitle: \"$(basename "$file" .mdx)\""
                echo "mode: \"center\""
                echo "---"
                echo ""
                cat "$file"
            } > "$tmp_file"
            mv "$tmp_file" "$file"
        fi
    done
}

copy_to_docs() {
    local src_dir="$1"
    local target_dir="$2"
    local sdk_name="$3"
    local version="$4"
    
    mkdir -p "$target_dir"
    
    echo "  → Copying files to $target_dir"
    if cp "$src_dir"/*.mdx "$target_dir/" 2>/dev/null; then
        echo "  → Generated files:"
        ls -la "$target_dir"
        echo "  ✅ $sdk_name $version complete"
        return 0
    else
        echo "  ⚠️  No MDX files to copy"
        return 1
    fi
}

