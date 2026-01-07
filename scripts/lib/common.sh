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

# get all locally generated versions for an SDK (only those with MDX files)
get_local_versions() {
    local sdk_key="$1"
    local docs_dir="$2"
    local sdk_ref_dir="$docs_dir/docs/sdk-reference/$sdk_key"
    
    if [[ ! -d "$sdk_ref_dir" ]]; then
        return 0
    fi
    
    find "$sdk_ref_dir" -maxdepth 1 -type d \( -name "v*" -o -name "[0-9]*" \) 2>/dev/null | \
        while read -r dir; do
            # only include if has MDX files
            if [[ -n "$(ls -A "$dir"/*.mdx 2>/dev/null)" ]]; then
                basename "$dir"
            fi
        done | sort
}

# find missing versions using set difference (faster than looping)
find_missing_versions() {
    local remote_versions="$1"
    local local_versions="$2"
    
    if [[ -z "$local_versions" ]]; then
        echo "$remote_versions"
        return 0
    fi
    
    # use comm to find versions in remote but not in local
    comm -13 \
        <(echo "$local_versions") \
        <(echo "$remote_versions" | sort)
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
            poetry install --quiet 2>/dev/null || pip install --break-system-packages pydoc-markdown 2>&1
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

# convert to title case, handling snake_case
to_title_case() {
    local str="$1"
    if [[ -z "$str" ]]; then
        echo ""
        return
    fi
    
    # replace underscores with spaces, then capitalize each word
    local result=""
    local word_start=true
    
    for (( i=0; i<${#str}; i++ )); do
        local char="${str:$i:1}"
        if [[ "$char" == "_" ]]; then
            result="$result "
            word_start=true
        elif [[ "$word_start" == true ]]; then
            result="$result$(echo "$char" | tr '[:lower:]' '[:upper:]')"
            word_start=false
        else
            result="$result$char"
        fi
    done
    
    echo "$result"
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
    
    # remove standalone index.md files (not needed for Mintlify)
    rm -f index.md
    
    shopt -s nullglob
    for file in *.md; do
        local mdx_file="${file%.md}.mdx"
        local title=$(to_title_case "$(basename "$file" .md)")
        {
            echo "---"
            echo "sidebarTitle: \"$title\""
            echo "mode: \"center\""
            echo "---"
            echo ""
            cat "$file"
        } > "$mdx_file"
        rm "$file"
    done
    
    for file in *.mdx; do
        if ! head -n1 "$file" | grep -q "^---$"; then
            local tmp_file="${file}.tmp"
            local title=$(to_title_case "$(basename "$file" .mdx)")
            {
                echo "---"
                echo "sidebarTitle: \"$title\""
                echo "mode: \"center\""
                echo "---"
                echo ""
                cat "$file"
            } > "$tmp_file"
            mv "$tmp_file" "$file"
        fi
    done
    shopt -u nullglob
    
    # remove index.mdx files (not needed for Mintlify)
    rm -f index.mdx
}

copy_to_docs() {
    local src_dir="$1"
    local target_dir="$2"
    local sdk_name="$3"
    local version="$4"
    
    # remove any literal "*.mdx" file that might have been created by error
    rm -f "$src_dir/*.mdx" 2>/dev/null
    
    # use find to count actual .mdx files (not globs)
    local mdx_count=$(find "$src_dir" -maxdepth 1 -name "*.mdx" -type f 2>/dev/null | wc -l | tr -d ' ')
    
    if [[ "$mdx_count" -eq 0 ]]; then
        echo "  ❌ No MDX files generated - documentation generation failed"
        echo "  ❌ This indicates a problem with the doc generator (typedoc/pydoc)"
        return 1
    fi
    
    # verify files are valid (not empty, not just "*.mdx")
    local has_valid_file=false
    while IFS= read -r -d '' file; do
        local filename=$(basename "$file")
        # check if filename is literally "*.mdx" or file is empty
        if [[ "$filename" == "*.mdx" ]]; then
            echo "  ❌ Found invalid file: $filename (glob pattern, not a real file)"
            rm -f "$file"
            continue
        fi
        if [[ ! -s "$file" ]]; then
            echo "  ⚠️  Found empty file: $filename"
            continue
        fi
        has_valid_file=true
    done < <(find "$src_dir" -maxdepth 1 -name "*.mdx" -type f -print0)
    
    if [[ "$has_valid_file" != "true" ]]; then
        echo "  ❌ No valid MDX files generated - all files are empty or invalid"
        return 1
    fi
    
    # recount after cleanup
    mdx_count=$(find "$src_dir" -maxdepth 1 -name "*.mdx" -type f 2>/dev/null | wc -l | tr -d ' ')
    
    if [[ "$mdx_count" -eq 0 ]]; then
        echo "  ❌ No valid MDX files to copy"
        return 1
    fi
    
    # only create directory if we have files to copy
    mkdir -p "$target_dir"
    
    echo "  → Copying $mdx_count files to $target_dir"
    if find "$src_dir" -maxdepth 1 -name "*.mdx" -type f -exec cp {} "$target_dir/" \; 2>/dev/null; then
        echo "  → Generated files:"
        ls -la "$target_dir"
        echo "  ✅ $sdk_name $version complete"
        return 0
    else
        echo "  ❌ Failed to copy MDX files"
        # cleanup empty directory if copy failed
        rmdir "$target_dir" 2>/dev/null || true
        return 1
    fi
}

