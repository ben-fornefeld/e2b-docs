#!/usr/bin/env bash

fetch_remote_tags() {
    local repo="$1"
    local tag_pattern="$2"
    local escaped_pattern=$(echo "$tag_pattern" | sed 's/[\/&@]/\\&/g')
    
    git ls-remote --tags --refs "$repo" 2>/dev/null | \
        grep "refs/tags/${tag_pattern}" | \
        sed "s|.*refs/tags/${escaped_pattern}|v|" | \
        sort -V -r
}

version_exists() {
    local sdk_key="$1"
    local version="$2"
    local docs_dir="$3"
    local version_dir="$docs_dir/docs/sdk-reference/$sdk_key/$version"
    
    [[ -d "$version_dir" ]] && [[ -n "$(ls -A "$version_dir"/*.mdx 2>/dev/null)" ]]
}

fetch_local_versions() {
    local sdk_key="$1"
    local docs_dir="$2"
    local sdk_dir="$docs_dir/docs/sdk-reference/$sdk_key"
    
    [[ ! -d "$sdk_dir" ]] && return 0
    
    find "$sdk_dir" -maxdepth 1 -type d \( -name "v*" -o -name "[0-9]*" \) 2>/dev/null | \
        while read -r dir; do
            [[ -n "$(ls -A "$dir"/*.mdx 2>/dev/null)" ]] && basename "$dir"
        done | sort
}

diff_versions() {
    local remote="$1"
    local local="$2"
    
    [[ -z "$local" ]] && echo "$remote" && return 0
    
    comm -13 <(echo "$local") <(echo "$remote" | sort)
}

is_valid_version() {
    [[ "$1" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

version_gte() {
    local v1="${1#v}"
    local v2="${2#v}"
    local higher=$(printf '%s\n%s' "$v1" "$v2" | sort -V -r | head -n1)
    [[ "$higher" == "$v1" ]]
}

filter_by_min_version() {
    local versions="$1"
    local min="$2"
    
    [[ -z "$min" ]] && echo "$versions" && return 0
    
    echo "$versions" | while IFS= read -r v; do
        [[ -n "$v" ]] && version_gte "$v" "$min" && echo "$v"
    done
}

resolve_latest_version() {
    local repo="$1"
    local tag_pattern="$2"
    local version="$3"
    
    [[ "$version" != "latest" ]] && echo "$version" && return 0
    
    local escaped=$(echo "$tag_pattern" | sed 's/[\/&@]/\\&/g')
    git ls-remote --tags --refs "$repo" 2>/dev/null | \
        grep "refs/tags/${tag_pattern}" | \
        sed "s|.*refs/tags/${escaped}|v|" | \
        sort -V | tail -1
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

locate_sdk_dir() {
    local repo_dir="$1"
    shift
    
    for path in "$@"; do
        [[ -d "$repo_dir/$path" ]] && echo "$repo_dir/$path" && return 0
    done
    
    return 1
}

find_lockfile_up() {
    local dir="$1"
    local filename="$2"
    
    while [[ "$dir" != "/" && "$dir" != "." ]]; do
        [[ -f "$dir/$filename" ]] && echo "$dir/$filename" && return 0
        dir=$(dirname "$dir")
    done
    return 1
}

hash_lockfile() {
    local sdk_dir="$1"
    local generator="$2"
    local lockfile=""
    
    case "$generator" in
        typedoc|cli)
            lockfile=$(find_lockfile_up "$sdk_dir" "pnpm-lock.yaml") || \
            lockfile=$(find_lockfile_up "$sdk_dir" "package-lock.json") || true
            ;;
        pydoc)
            lockfile=$(find_lockfile_up "$sdk_dir" "poetry.lock") || true
            ;;
    esac
    
    if [[ -n "$lockfile" && -f "$lockfile" ]]; then
        command -v md5 &>/dev/null && md5 -q "$lockfile" || md5sum "$lockfile" | cut -d' ' -f1
    fi
}

install_with_cache() {
    local sdk_dir="$1"
    local generator="$2"
    local temp_dir="$3"
    
    if [[ "$generator" == "pydoc" ]]; then
        local hash=$(hash_lockfile "$sdk_dir" "$generator")
        local marker="$temp_dir/.deps-cache/pydoc-$hash/.installed"
        
        if [[ -n "$hash" && -f "$marker" ]]; then
            echo "  → Poetry dependencies cached (lockfile unchanged)"
            return 0
        fi
        
        install_dependencies "$sdk_dir" "$generator"
        
        if [[ -n "$hash" ]]; then
            mkdir -p "$(dirname "$marker")"
            touch "$marker"
        fi
    else
        install_dependencies "$sdk_dir" "$generator"
    fi
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

to_title_case() {
    local str="$1"
    [[ -z "$str" ]] && return 0
    
    local result=""
    local capitalize_next=true
    
    for (( i=0; i<${#str}; i++ )); do
        local char="${str:$i:1}"
        if [[ "$char" == "_" ]]; then
            result="$result "
            capitalize_next=true
        elif [[ "$capitalize_next" == true ]]; then
            result="$result$(echo "$char" | tr '[:lower:]' '[:upper:]')"
            capitalize_next=false
        else
            result="$result$char"
        fi
    done
    
    echo "$result"
}

add_frontmatter() {
    local file="$1"
    local title=$(to_title_case "$(basename "$file" .mdx)")
    local tmp="${file}.tmp"
    
    {
        echo "---"
        echo "sidebarTitle: \"$title\""
        echo "mode: \"center\""
        echo "---"
        echo ""
        cat "$file"
    } > "$tmp"
    mv "$tmp" "$file"
}

flatten_markdown() {
    local ref_dir="$1"
    cd "$ref_dir"
    
    rm -f README.md index.md
    
    find . -mindepth 2 -type f -name "*.md" 2>/dev/null | while read -r file; do
        local filename=$(basename "$file")
        if [[ "$filename" == "page.md" || "$filename" == "index.md" ]]; then
            mv "$file" "./$(basename "$(dirname "$file")").md" 2>/dev/null || true
        else
            mv "$file" "./" 2>/dev/null || true
        fi
    done
    
    find . -type d -empty -delete 2>/dev/null || true
    
    shopt -s nullglob
    for file in *.md; do
        local title=$(to_title_case "$(basename "$file" .md)")
        {
            echo "---"
            echo "sidebarTitle: \"$title\""
            echo "mode: \"center\""
            echo "---"
            echo ""
            cat "$file"
        } > "${file%.md}.mdx"
        rm "$file"
    done
    
    for file in *.mdx; do
        head -n1 "$file" | grep -q "^---$" || add_frontmatter "$file"
    done
    shopt -u nullglob
    
    rm -f index.mdx
}

validate_mdx_files() {
    local src_dir="$1"
    rm -f "$src_dir/*.mdx"
    
    local valid_count=0
    while IFS= read -r -d '' file; do
        local name=$(basename "$file")
        if [[ "$name" == "*.mdx" ]]; then
            rm -f "$file"
        elif [[ ! -s "$file" ]]; then
            continue
        else
            ((valid_count++)) || true
        fi
    done < <(find "$src_dir" -maxdepth 1 -name "*.mdx" -type f -print0)
    
    echo "$valid_count"
}

copy_to_docs() {
    local src="$1"
    local dest="$2"
    local sdk_name="$3"
    local version="$4"
    
    local count=$(validate_mdx_files "$src")
    
    if [[ "$count" -eq 0 ]]; then
        echo "  ❌ No MDX files generated - doc generator failed"
        return 1
    fi
    
    mkdir -p "$dest"
    
    echo "  → Copying $count files to $dest"
    if find "$src" -maxdepth 1 -name "*.mdx" -type f ! -size 0 -exec cp {} "$dest/" \; 2>/dev/null; then
        echo "  ✅ $sdk_name $version complete"
        return 0
    else
        rmdir "$dest" 2>/dev/null || true
        return 1
    fi
}

