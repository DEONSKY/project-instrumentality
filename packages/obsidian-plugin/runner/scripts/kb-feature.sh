#!/bin/sh
# kb-feature — submodule push helper for kb-mcp projects
# Ensures submodules are pushed before parent with correct upstream tracking.
# Branch creation in submodules is manual — this script only standardizes push order.
#
# Usage:
#   kb-feature push     Push involved submodules (with -u), then parent
#   kb-feature status   Show parent branch + each submodule's state
#   kb-feature help     Show this help message
#
# Merge order (when merging a feature branch back to main):
#   1. In each involved submodule: merge feature → main, push
#   2. In parent on main: git submodule update (pointer tracks submodule's main)
#   3. In parent: merge feature → main, push
#
# Wrong order leaves parent's main pointing to a submodule commit that only
# exists on a feature branch — anyone cloning gets a detached HEAD.

set -e

COMMAND="${1:-help}"

# Write submodule info to a temp file to avoid pipe-subshell issues.
# Each line: "<path> <is_shared>"
collect_submodules() {
  _TMPFILE=$(mktemp)
  if [ ! -f .gitmodules ]; then
    printf '%s' "$_TMPFILE"
    return
  fi
  git config --file .gitmodules --get-regexp 'submodule\..*\.path' | while IFS= read -r line; do
    subname=$(printf '%s' "$line" | awk '{print $1}' | sed 's/submodule\.\(.*\)\.path/\1/')
    subpath=$(printf '%s' "$line" | awk '{print $2}')
    is_shared=$(git config --file .gitmodules submodule."$subname".kb-shared 2>/dev/null || echo "false")
    printf '%s %s\n' "$subpath" "$is_shared"
  done > "$_TMPFILE"
  printf '%s' "$_TMPFILE"
}

pointer_changed() {
  _subpath="$1"
  _remote_ref=$(git rev-parse @{upstream} 2>/dev/null) || { printf 'true'; return; }
  _local_sha=$(git ls-tree HEAD "$_subpath" 2>/dev/null | awk '{print $3}')
  _remote_sha=$(git ls-tree "$_remote_ref" "$_subpath" 2>/dev/null | awk '{print $3}')
  [ "$_local_sha" != "$_remote_sha" ] && printf 'true' || printf 'false'
}

case "$COMMAND" in
  push)
    PARENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
    if [ -z "$PARENT_BRANCH" ]; then
      printf '[kb-feature] ERROR: HEAD is detached — cannot determine branch\n' >&2
      exit 1
    fi
    SUBS=$(collect_submodules)
    PUSH_FAILED=0
    while IFS= read -r entry; do
      [ -z "$entry" ] && continue
      subpath=$(printf '%s' "$entry" | awk '{print $1}')
      is_shared=$(printf '%s' "$entry" | awk '{print $2}')
      [ "$(pointer_changed "$subpath")" = "true" ] || continue
      if [ "$is_shared" = "true" ]; then
        sub_branch=$(git -C "$subpath" symbolic-ref --short HEAD 2>/dev/null)
        printf '[kb-feature] pushing shared submodule: %s (branch: %s)\n' "$subpath" "$sub_branch"
        git -C "$subpath" push -u origin "$sub_branch" || PUSH_FAILED=1
      else
        printf '[kb-feature] pushing owned submodule: %s (branch: %s)\n' "$subpath" "$PARENT_BRANCH"
        git -C "$subpath" push -u origin "$PARENT_BRANCH" || PUSH_FAILED=1
      fi
    done < "$SUBS"
    rm -f "$SUBS"
    if [ "$PUSH_FAILED" = "1" ]; then
      printf '[kb-feature] ERROR: submodule push failed — skipping parent push\n' >&2
      exit 1
    fi
    printf '[kb-feature] pushing parent\n'
    git push
    ;;
  status)
    PARENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || printf '(detached)')
    printf 'parent:  %s\n' "$PARENT_BRANCH"
    SUBS=$(collect_submodules)
    if [ ! -s "$SUBS" ]; then
      printf '  (no submodules detected)\n'
    else
      while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        subpath=$(printf '%s' "$entry" | awk '{print $1}')
        is_shared=$(printf '%s' "$entry" | awk '{print $2}')
        sub_branch=$(git -C "$subpath" symbolic-ref --short HEAD 2>/dev/null || printf '(detached)')
        changed=$(pointer_changed "$subpath")
        label=$([ "$is_shared" = "true" ] && printf 'shared' || printf 'owned')
        printf '  %-20s  branch=%-20s  pointer-changed=%-5s  [%s]\n' \
          "$subpath" "$sub_branch" "$changed" "$label"
      done < "$SUBS"
    fi
    rm -f "$SUBS"
    ;;
  help|--help|-h|"")
    cat <<'HELP'
kb-feature — submodule push helper for kb-mcp projects

Usage:
  kb-feature push     Push involved submodules (with -u), then parent
  kb-feature status   Show parent branch + each submodule's state
  kb-feature help     Show this help message

Push behavior:
  - Detects which submodule pointers changed vs remote
  - Owned submodules: pushed to parent's branch name
  - Shared submodules (kb-shared = true): pushed to their own branch name
  - If any submodule push fails, parent push is skipped
  - Parent is pushed last

Merge order (feature → main):
  1. In each involved submodule: merge feature → main, push
  2. In parent on main: git submodule update
  3. In parent: merge feature → main, push
HELP
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    printf 'Usage: kb-feature push | status | help\n' >&2
    exit 1
    ;;
esac
