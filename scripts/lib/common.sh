#!/usr/bin/env bash

# get all versions matching tag pattern (sorted newest first)
get_all_versions() {
    local repo="$1"
    local tag_pattern="$2"
    
    local sed_escaped_pattern=$(echo "$tag_pattern" | sed 's/[\/&@]/\\&/g')
    
    git ls-remote --tags --refs "$repo" 2>/dev/null | \
        grep "refs/tags/${tag_pattern}" | \
        sed "s|.*refs/tags/${sed_escaped_pattern}|v|" | \
        sort -V -r
}

# check if version documentation already exists
version_exists() {
    local sdk_key="$1"
    local version="$2"
    local docs_dir="$3"
    
    local version_dir="$docs_dir/docs/sdk-reference/$sdk_key/$version"
    [[ -d "$version_dir" ]] && [[ -n "$(ls -A "$version_dir"/*.mdx 2>/dev/null)" ]]
}

# validate version string format
is_valid_version() {
    local version="$1"
    [[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# compare two versions (returns 0 if v1 >= v2)
version_gte() {
    local v1="$1"
    local v2="$2"
    
    # strip 'v' prefix if present
    v1="${v1#v}"
    v2="${v2#v}"
    
    # use sort -V to compare versions
    local higher=$(printf '%s\n%s' "$v1" "$v2" | sort -V -r | head -n1)
    [[ "$higher" == "$v1" ]]
}

# filter versions to only those >= minVersion
filter_min_version() {
    local versions="$1"
    local min_version="$2"
    
    if [[ -z "$min_version" ]]; then
        echo "$versions"
        return 0
    fi
    
    echo "$versions" | while IFS= read -r version; do
        if [[ -n "$version" ]] && version_gte "$version" "$min_version"; then
            echo "$version"
        fi
    done
}

# count existing versions for an SDK
count_sdk_versions() {
    local sdk_key="$1"
    local docs_dir="$2"
    local sdk_ref_dir="$docs_dir/docs/sdk-reference/$sdk_key"
    
    if [[ ! -d "$sdk_ref_dir" ]]; then
        echo "0"
        return
    fi
    
    find "$sdk_ref_dir" -maxdepth 1 -type d \( -name "v*" -o -name "[0-9]*" \) 2>/dev/null | wc -l | tr -d ' '
}

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

# find lockfile, searching up directory tree
find_lockfile() {
    local dir="$1"
    local filename="$2"
    
    while [[ "$dir" != "/" && "$dir" != "." ]]; do
        if [[ -f "$dir/$filename" ]]; then
            echo "$dir/$filename"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    return 1
}

# compute hash of lockfile for caching
get_lockfile_hash() {
    local sdk_dir="$1"
    local generator="$2"
    
    local lockfile=""
    case "$generator" in
        typedoc|cli)
            lockfile=$(find_lockfile "$sdk_dir" "pnpm-lock.yaml") || \
            lockfile=$(find_lockfile "$sdk_dir" "package-lock.json") || true
            ;;
        pydoc)
            lockfile=$(find_lockfile "$sdk_dir" "poetry.lock") || true
            ;;
    esac
    
    if [[ -n "$lockfile" && -f "$lockfile" ]]; then
        # use md5 on macOS, md5sum on Linux
        if command -v md5 &>/dev/null; then
            md5 -q "$lockfile"
        else
            md5sum "$lockfile" | cut -d' ' -f1
        fi
    fi
}

# install dependencies with caching support
# for JS: relies on pnpm's global cache (~/.pnpm-store) with --prefer-offline
# for Python: tracks lockfile hash to skip redundant installs
install_dependencies_cached() {
    local sdk_dir="$1"
    local generator="$2"
    local temp_dir="$3"
    
    case "$generator" in
        typedoc|cli)
            # pnpm uses content-addressable storage with hardlinks
            # --prefer-offline makes it fast, no need to copy node_modules
            install_dependencies "$sdk_dir" "$generator"
            ;;
        pydoc)
            local lockfile_hash=$(get_lockfile_hash "$sdk_dir" "$generator")
            local cache_marker="$temp_dir/.deps-cache/pydoc-$lockfile_hash/.installed"
            
            if [[ -n "$lockfile_hash" && -f "$cache_marker" ]]; then
                echo "  → Poetry dependencies cached (lockfile unchanged)"
                return 0
            fi
            
            install_dependencies "$sdk_dir" "$generator"
            
            # mark as installed for future versions with same lockfile
            if [[ -n "$lockfile_hash" ]]; then
                mkdir -p "$(dirname "$cache_marker")"
                touch "$cache_marker"
            fi
            ;;
        *)
            install_dependencies "$sdk_dir" "$generator"
            ;;
    esac
}

install_dependencies() {
    local sdk_dir="$1"
    local generator="$2"
    
    cd "$sdk_dir"
    
    echo "  → Installing dependencies..."
    case "$generator" in
        typedoc)
            if command -v pnpm &> /dev/null; then
                pnpm install --ignore-scripts --prefer-offline 2>&1 || {
                    echo "  ⚠️  pnpm failed, trying npm..."
                    npm install --legacy-peer-deps --prefer-offline 2>&1
                }
            else
                npm install --legacy-peer-deps --prefer-offline 2>&1
            fi
            ;;
        pydoc)
            poetry install --quiet 2>/dev/null || pip install pydoc-markdown
            ;;
        cli)
            if command -v pnpm &> /dev/null; then
                pnpm install --prefer-offline 2>&1 || npm install --prefer-offline 2>&1
            else
                npm install --prefer-offline 2>&1
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

