// Git hook templates + installers for kb_init.
//
// The hook templates contain shell scripts written to .git/hooks/ at the
// user's machine. Each starts with `# kb-mcp managed` so installGitHooks
// can safely re-overwrite them on subsequent kb_init runs while preserving
// user-customized hooks.
//
// __dirname resolves to knowledge/_mcp/lib here; `path.join(__dirname, '..')`
// matches the previous from-tools/init.js resolution. The baked-in absolute
// paths inside the template literals are the same in both locations.

const fs = require('fs')
const path = require('path')

// Hooks check local path first, then fall back to the MCP server's own location.
// This makes them work whether or not the MCP server is installed inside the project.
// On Windows, convert C:\... paths to /c/... so Git's sh.exe (MSYS2) can resolve them.
const toShPath = p => process.platform === 'win32'
  ? p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
  : p
const _LINT_SCRIPT = toShPath(path.join(__dirname, '../scripts/lint-standalone.js'))
const _SERVER_SCRIPT = toShPath(path.join(__dirname, '../server.js'))

const PRE_COMMIT_HOOK = `#!/bin/sh
# kb-mcp managed — updated by kb_init. Do not remove this line.
# Warn if Tier 1 auto-generated files are staged
STAGED=$(git diff --cached --name-only 2>/dev/null)
TIER1=$(echo "$STAGED" | grep -E "knowledge/_index\\.yaml|knowledge/sync/drift-log/" || true)
if [ -n "$TIER1" ]; then
  printf "[kb] WARNING: Auto-generated files are staged for commit:\\n" >&2
  echo "$TIER1" | while IFS= read -r f; do printf "[kb]   %s\\n" "$f" >&2; done
  printf "[kb] These are managed by kb-mcp and will be overwritten. Consider: git restore --staged <file>\\n" >&2
fi

LOCAL="knowledge/_mcp/scripts/lint-standalone.js"
BUNDLED="${_LINT_SCRIPT}"
if [ -f "$LOCAL" ]; then node "$LOCAL"
elif [ -f "$BUNDLED" ]; then node "$BUNDLED"
fi
`

const PRE_PUSH_HOOK = `#!/bin/sh
# kb-mcp managed — updated by kb_init. Do not remove this line.

# ── Submodule branch guard ────────────────────────────────────────────────────
if [ -f .gitmodules ]; then
  PARENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
  REMOTE_REF=$(git rev-parse @{upstream} 2>/dev/null) || REMOTE_REF=""
  TMPFILE=$(mktemp)
  MISMATCH=""
  SHARED_WARN=""
  git config --file .gitmodules --get-regexp 'submodule\\..*\\.path' > "$TMPFILE" 2>/dev/null
  while IFS= read -r line; do
    key=$(printf '%s' "$line" | awk '{print $1}')
    subpath=$(printf '%s' "$line" | awk '{print $2}')
    subname=$(printf '%s' "$key" | sed 's/submodule\\.\\(.*\\)\\.path/\\1/')

    IS_SHARED=$(git config --file .gitmodules submodule."$subname".kb-shared 2>/dev/null)
    if [ "$IS_SHARED" = "true" ]; then
      # Shared — no branch enforcement, but warn if pointer changed
      LOCAL_SUB=$(git ls-tree HEAD "$subpath" 2>/dev/null | awk '{print $3}')
      if [ -n "$REMOTE_REF" ]; then
        REMOTE_SUB=$(git ls-tree "$REMOTE_REF" "$subpath" 2>/dev/null | awk '{print $3}')
      else
        _BASE=$(git rev-parse "origin/main" 2>/dev/null || git rev-parse "origin/master" 2>/dev/null || echo "")
        REMOTE_SUB=$(git ls-tree "$_BASE" "$subpath" 2>/dev/null | awk '{print $3}')
      fi
      if [ "$LOCAL_SUB" != "$REMOTE_SUB" ]; then
        SHARED_WARN="$SHARED_WARN\\n  $subpath"
      fi
      continue
    fi

    # Owned — check if pointer changed in this push
    LOCAL_SUB=$(git ls-tree HEAD "$subpath" 2>/dev/null | awk '{print $3}')
    if [ -n "$REMOTE_REF" ]; then
      REMOTE_SUB=$(git ls-tree "$REMOTE_REF" "$subpath" 2>/dev/null | awk '{print $3}')
    else
      _BASE=$(git rev-parse "origin/main" 2>/dev/null || git rev-parse "origin/master" 2>/dev/null || echo "")
      REMOTE_SUB=$(git ls-tree "$_BASE" "$subpath" 2>/dev/null | awk '{print $3}')
    fi
    [ "$LOCAL_SUB" = "$REMOTE_SUB" ] && continue

    SUB_BRANCH=$(git -C "$subpath" symbolic-ref --short HEAD 2>/dev/null)
    if [ -n "$SUB_BRANCH" ] && [ "$SUB_BRANCH" != "$PARENT_BRANCH" ]; then
      MISMATCH="$MISMATCH\\n  $subpath  (on '$SUB_BRANCH', expected '$PARENT_BRANCH')"
    fi
  done < "$TMPFILE"
  rm -f "$TMPFILE"

  if [ -n "$MISMATCH" ]; then
    printf "[kb] ERROR: Submodule branch mismatch — push blocked.\\n" >&2
    printf "[kb] Parent is on '%s' but these submodules are not:%b\\n" "$PARENT_BRANCH" "$MISMATCH" >&2
    printf "[kb]\\n" >&2
    printf "[kb] If the submodule is NOT part of this feature (accidental staging):\\n" >&2
    printf "[kb]   git restore --staged <submodule-path>/\\n" >&2
    printf "[kb]\\n" >&2
    printf "[kb] If the submodule IS part of this feature:\\n" >&2
    printf "[kb]   cd <submodule> && git checkout %s\\n" "$PARENT_BRANCH" >&2
    exit 1
  fi

  if [ -n "$SHARED_WARN" ]; then
    printf "[kb] WARNING: Shared submodule pointer(s) updated:%b\\n" "$SHARED_WARN" >&2
    printf "[kb] These affect all projects consuming the module(s). Ensure changes are mergeable to main.\\n" >&2
  fi
fi

LOCAL="knowledge/_mcp/server.js"
BUNDLED="${_SERVER_SCRIPT}"
SERVER="$LOCAL"
[ -f "$BUNDLED" ] && SERVER="$BUNDLED"

# ── Branch-aware drift handling ───────────────────────────────────────────────
#
# Protected branches (default: main|master, configurable via
# \`git config kb.protectedBranches "main|master|release"\`):
#   Run full drift + conform detection, stage + auto-commit the queue files
#   into this push. Preserves the original "PM sees drifts immediately on
#   remote" behavior.
#
# Feature branches:
#   Run detection in readonly mode (no fs writes, no commit). Print the
#   pending-entry count as a hint, exit 0. Authors publish via the
#   "Publish drift" command in the extension when they're ready.
PUSHED_BRANCH="\${PARENT_BRANCH:-$(git symbolic-ref --short HEAD 2>/dev/null)}"
PROTECTED_PATTERN=$(git config kb.protectedBranches 2>/dev/null)
[ -z "$PROTECTED_PATTERN" ] && PROTECTED_PATTERN="main|master"
IS_PROTECTED=0
case "$PUSHED_BRANCH" in
  "") IS_PROTECTED=0 ;;
  *) printf '%s' "$PUSHED_BRANCH" | grep -Eq "^($PROTECTED_PATTERN)\\$" && IS_PROTECTED=1 ;;
esac

if [ "$IS_PROTECTED" = "1" ]; then
  # Protected branch — full detection + auto-commit (original behavior).
  node -e "
const drift = require('$SERVER/../tools/drift');
drift.runTool({ remote: '$1' }).then(result => {
  if (result.error) {
    process.stderr.write('[kb-drift] skipped: ' + result.error + '\\\\n');
    return;
  }
  const c = result.code_entries || 0;
  const k = result.kb_entries || 0;
  if (c > 0) process.stderr.write('[kb-drift] ' + c + ' code→KB entry(s) added to knowledge/sync/code-drift.md\\\\n');
  if (k > 0) process.stderr.write('[kb-drift] ' + k + ' KB→code entry(s) added to knowledge/sync/kb-drift.md\\\\n');
  if (result.message) process.stderr.write('[kb-drift] ' + result.message + '\\\\n');
  if (c > 0 || k > 0) process.stderr.write('[kb-drift] ↑ Clean drift for files you touched before opening a PR.\\\\n');
  if (c > 0 || k > 0) process.stderr.write('[kb-drift]   Run kb_drift in Claude to review and resolve.\\\\n');
}).catch(() => {});
" 2>&1 || true

  if [ -f "$SERVER/../tools/conform.js" ]; then
  node -e "
const conform = require('$SERVER/../tools/conform');
conform.runTool({}).then(result => {
  if (result.error) {
    process.stderr.write('[kb-conform] skipped: ' + result.error + '\\\\n');
    return;
  }
  const requested = (result.requested_evaluations || []).length;
  if (requested > 0) {
    process.stderr.write('[kb-conform] ' + requested + ' rule evaluation(s) need agent judgment — run kb_conform in Claude before opening a PR.\\\\n');
  }
  if ((result.sprawl_warnings || []).length > 0) {
    for (const w of result.sprawl_warnings) {
      process.stderr.write('[kb-conform] sprawl: standard \"' + w.standard_id + '\" has ' + w.rule_count + ' rules (threshold ' + w.threshold + ')\\\\n');
    }
  }
}).catch(() => {});
" 2>&1 || true
  fi

  # Commit drift files so they travel with the push — PM sees them on remote immediately.
  # Guard against re-entry: if this hook already created a drift commit, skip.
  if [ -z "$KB_DRIFT_COMMITTING" ]; then
    git add knowledge/sync/code-drift.md knowledge/sync/kb-drift.md knowledge/sync/standards-drift.md knowledge/sync/standards-backlog.md 2>/dev/null || true
    if ! git diff --cached --quiet -- knowledge/sync/code-drift.md knowledge/sync/kb-drift.md knowledge/sync/standards-drift.md knowledge/sync/standards-backlog.md 2>/dev/null; then
      KB_DRIFT_COMMITTING=1 git commit -m "chore(kb): update drift queue" 2>/dev/null && printf '[kb-drift] drift/conform queues committed — included in this push\\n' >&2 || true
    fi
  fi
else
  # Feature branch — advisory readonly run only. No fs writes, no commit.
  node -e "
const drift = require('$SERVER/../tools/drift');
drift.runTool({ remote: '$1', readonly: true, include_diffs: false }).then(result => {
  if (result.error) return;
  const state = result._state || {};
  const c = (state.codeEntries || []).length;
  const k = (state.kbEntries || []).length;
  const total = c + k;
  if (total > 0) {
    process.stderr.write('[kb-drift] ' + total + ' unpublished drift entr' + (total === 1 ? 'y' : 'ies') + ' on this branch (' + c + ' code→KB, ' + k + ' KB→code).\\\\n');
    process.stderr.write('[kb-drift]   Run \"Publish drift\" in the extension to include them in your push.\\\\n');
  }
}).catch(() => {});
" 2>&1 || true

  if [ -f "$SERVER/../tools/conform.js" ]; then
  node -e "
const conform = require('$SERVER/../tools/conform');
conform.runTool({ readonly: true, include_diffs: false }).then(result => {
  if (result.error) return;
  const requested = (result.requested_evaluations || []).length;
  const flagged = ((result._state && result._state.entries) || []).length;
  if (requested > 0 || flagged > 0) {
    const parts = [];
    if (flagged > 0) parts.push(flagged + ' auto-flagged');
    if (requested > 0) parts.push(requested + ' need agent judgment');
    process.stderr.write('[kb-conform] ' + parts.join(', ') + ' — readonly preview only on feature branches.\\\\n');
  }
}).catch(() => {});
" 2>&1 || true
  fi
fi
`

const POST_MERGE_HOOK = `#!/bin/sh
# kb-mcp managed — updated by kb_init. Do not remove this line.
# 1. Rebuild _index.yaml
LOCAL_REINDEX="knowledge/_mcp/tools/reindex.js"
BUNDLED_REINDEX="${path.join(__dirname, '../tools/reindex.js')}"
SCRIPT="$LOCAL_REINDEX"
[ -f "$BUNDLED_REINDEX" ] && SCRIPT="$BUNDLED_REINDEX"
node -e "require('./$SCRIPT').runTool({})" 2>/dev/null || true

# 2. Dedupe baseline lines in drift queues (merge=union may have duplicated them)
LOCAL_SERVER="knowledge/_mcp/server.js"
BUNDLED_SERVER="${_SERVER_SCRIPT}"
SERVER="$LOCAL_SERVER"
[ -f "$BUNDLED_SERVER" ] && SERVER="$BUNDLED_SERVER"
node -e "require('$SERVER/../tools/drift').runTool({ dedup_baselines: true }).catch(() => {})" 2>&1 || true

# 3. Run drift detection from ORIG_HEAD so cross-branch semantic conflicts are caught
ORIG_HEAD=$(cat .git/ORIG_HEAD 2>/dev/null || echo "")
if [ -n "$ORIG_HEAD" ]; then
  node -e "
const drift = require('$SERVER/../tools/drift');
drift.runTool({ since: '$ORIG_HEAD' }).then(result => {
  if (result.error) {
    process.stderr.write('[kb-drift] post-merge skipped: ' + result.error + '\\\\n');
    return;
  }
  const c = result.code_entries || 0;
  const k = result.kb_entries || 0;
  if (c > 0) process.stderr.write('[kb-drift] ' + c + ' code→KB entry(s) added to knowledge/sync/code-drift.md\\\\n');
  if (k > 0) process.stderr.write('[kb-drift] ' + k + ' KB→code entry(s) added to knowledge/sync/kb-drift.md\\\\n');
  if (c > 0 || k > 0) process.stderr.write('[kb-drift] ↑ Pulled drift — resolve before opening a PR if you touched these files.\\\\n');
  if (c > 0 || k > 0) process.stderr.write('[kb-drift]   Run kb_drift in Claude to review, then commit the updates.\\\\n');
}).catch(() => {});
" 2>&1 || true
fi
`

const POST_CHECKOUT_HOOK = `#!/bin/sh
# kb-mcp managed — updated by kb_init. Do not remove this line.
LOCAL="knowledge/_mcp/scripts/lint-standalone.js"
BUNDLED="${_LINT_SCRIPT}"
if [ -f "$LOCAL" ]; then node "$LOCAL"
elif [ -f "$BUNDLED" ]; then node "$BUNDLED"
fi
`

function installGitHooks() {
  const hooksDir = '.git/hooks'
  if (!fs.existsSync(hooksDir)) return []

  const hooks = {
    'pre-commit': PRE_COMMIT_HOOK,
    'pre-push': PRE_PUSH_HOOK,
    'post-merge': POST_MERGE_HOOK,
    'post-checkout': POST_CHECKOUT_HOOK
  }

  const installed = []
  Object.entries(hooks).forEach(([name, content]) => {
    const hookPath = path.join(hooksDir, name)
    const exists = fs.existsSync(hookPath)
    const isManagedByKb = exists && fs.readFileSync(hookPath, 'utf8').includes('# kb-mcp managed')

    if (!exists || isManagedByKb) {
      fs.writeFileSync(hookPath, content)
      fs.chmodSync(hookPath, '755')
      installed.push(exists ? `${name} (updated)` : name)
    }
  })

  // Install kb-feature.sh helper script (committed to repo, not in .git/)
  const kbFeatureSrc = path.join(__dirname, '../scripts/kb-feature.sh')
  if (fs.existsSync(kbFeatureSrc)) {
    fs.chmodSync(kbFeatureSrc, '755')
    installed.push('kb-feature.sh (scripts)')
  }

  return installed
}

/**
 * Detect submodules from .gitmodules and check if code_path_patterns
 * already include prefixed patterns for each submodule path.
 * Returns suggestions for missing patterns (informational only).
 */
function detectSubmodulePatternGaps(rules) {
  const gitmodulesPath = '.gitmodules'
  if (!fs.existsSync(gitmodulesPath)) return []
  const content = fs.readFileSync(gitmodulesPath, 'utf8')
  const blocks = content.split(/(?=\[submodule\s+"[^"]+"\])/).filter(b => b.trim())
  const patterns = rules ? rules.getCodePathPatterns() : []
  const allPaths = patterns.flatMap(p => p.paths || [])

  const suggestions = []
  for (const block of blocks) {
    const nameMatch = block.match(/\[submodule\s+"([^"]+)"\]/)
    const pathMatch = block.match(/path\s*=\s*(.+)/)
    if (!nameMatch || !pathMatch) continue
    const subPath = pathMatch[1].trim()
    const isShared = /kb-shared\s*=\s*true/.test(block)
    const hasCoverage = allPaths.some(p => p.startsWith(subPath + '/'))
    if (!hasCoverage) {
      suggestions.push({ path: subPath, isShared })
    }
  }
  return suggestions
}

function installMergeDrivers() {
  try {
    const gitConfigPath = '.git/config'
    if (!fs.existsSync(gitConfigPath)) return

    let config = fs.readFileSync(gitConfigPath, 'utf8')

    const reindexDriver = `\n[merge "kb-reindex"]\n\tdriver = node knowledge/_mcp/drivers/kb-reindex.js %O %A %B %L %P\n`
    const conflictDriver = `\n[merge "kb-conflict"]\n\tdriver = node knowledge/_mcp/drivers/kb-conflict.js %O %A %B %L %P\n`

    if (!config.includes('merge "kb-reindex"')) config += reindexDriver
    if (!config.includes('merge "kb-conflict"')) config += conflictDriver

    fs.writeFileSync(gitConfigPath, config)
  } catch (e) {
    console.warn('[init] Could not install merge drivers:', e.message)
  }
}

module.exports = {
  installGitHooks,
  installMergeDrivers,
  detectSubmodulePatternGaps,
  // Exported for tests / inspection — the hook strings themselves are baked
  // at module load time using __dirname, so consumers shouldn't try to
  // re-interpolate them from another location.
  PRE_COMMIT_HOOK,
  PRE_PUSH_HOOK,
  POST_MERGE_HOOK,
  POST_CHECKOUT_HOOK
}
