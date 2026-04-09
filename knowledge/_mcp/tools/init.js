const fs = require('fs')
const path = require('path')
const readline = require('readline')
const matter = require('gray-matter')
const yaml = require('js-yaml')
const { runTool: reindex } = require('./reindex')
const { runTool: scaffold } = require('./scaffold')
const { resolveFilePath } = require('../lib/kb-paths')

const KB_ROOT = 'knowledge'

const FOLDER_STRUCTURE = [
  'features',
  'flows',
  'data/schema',
  'validation',
  'ui',
  'integrations',
  'decisions',
  'standards/code',
  'standards/knowledge',
  'standards/process',
  '_templates/data',
  '_templates/ui',
  '_templates/standards',
  '_templates/prompts',
  '_prompt-overrides',
  'assets/design',
  'assets/screenshots',
  'exports',
  'sync',
  'sync/inbound',
  'sync/outbound'
]

const GIT_ATTRIBUTES = `knowledge/_index.yaml           merge=kb-reindex
knowledge/sync/code-drift.md    merge=union
knowledge/sync/kb-drift.md      merge=union
knowledge/sync/review-queue.md  merge=union
knowledge/sync/drift-log/**     merge=union
knowledge/sync/import-review.md merge=union
knowledge/sync/inbound/**       merge=union
knowledge/sync/outbound/**      merge=union
knowledge/features/**           merge=kb-conflict
knowledge/flows/**              merge=kb-conflict
knowledge/_rules.md             merge=kb-conflict
knowledge/assets/**             filter=lfs diff=lfs merge=lfs -text
`

const CURSOR_MCP = {
  mcpServers: {
    kb: {
      command: 'node',
      args: ['knowledge/_mcp/server.js']
    }
  }
}

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

# Commit drift files so they travel with the push — PM sees them on remote immediately
# Guard against re-entry: if this hook already created a drift commit, skip
if [ -z "$KB_DRIFT_COMMITTING" ]; then
  git add knowledge/sync/code-drift.md knowledge/sync/kb-drift.md 2>/dev/null || true
  if ! git diff --cached --quiet -- knowledge/sync/code-drift.md knowledge/sync/kb-drift.md 2>/dev/null; then
    KB_DRIFT_COMMITTING=1 git commit -m "chore(kb): update drift queue" 2>/dev/null && printf '[kb-drift] drift queue committed — included in this push\\n' >&2 || true
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

# 2. Run drift detection from ORIG_HEAD so cross-branch semantic conflicts are caught
ORIG_HEAD=$(cat .git/ORIG_HEAD 2>/dev/null || echo "")
if [ -n "$ORIG_HEAD" ]; then
  LOCAL_SERVER="knowledge/_mcp/server.js"
  BUNDLED_SERVER="${_SERVER_SCRIPT}"
  SERVER="$LOCAL_SERVER"
  [ -f "$BUNDLED_SERVER" ] && SERVER="$BUNDLED_SERVER"
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

async function runTool({ interactive = true, config = null } = {}) {
  let cfg = config

  if (interactive && !cfg && process.stdin.isTTY) {
    cfg = await promptConfig()
  } else if (!cfg) {
    cfg = getDefaultConfig()
  }

  const filesCreated = []

  // 1. Create folder structure
  FOLDER_STRUCTURE.forEach(folder => {
    const fullPath = path.join(KB_ROOT, folder)
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
      filesCreated.push(fullPath + '/')
    }
  })

  // 2. Write sync stub files
  const syncFiles = {
    'sync/code-drift.md': '<!-- AUTO-GENERATED by kb-mcp — resolve via kb_drift in Claude. Do not delete entries manually. -->\n\n# Code Drift Queue\n\nCode changed without matching KB update. PM/tech lead reviews each entry.\n',
    'sync/kb-drift.md': '<!-- AUTO-GENERATED by kb-mcp — resolve via kb_drift in Claude. Do not delete entries manually. -->\n\n# KB Drift Queue\n\nKB spec changed — review whether code still matches the updated spec.\n',
    'sync/drift-log/': null,  // directory — created below
    'sync/review-queue.md': '# Review Queue\n\nItems requiring human decision: semantic conflicts, challenge findings, lint violations.\n',
    'sync/import-review.md': '# Import Review\n\nChunks that could not be confidently classified during import.\n'
  }

  Object.entries(syncFiles).forEach(([rel, content]) => {
    const fullPath = path.join(KB_ROOT, rel)
    if (!fs.existsSync(fullPath)) {
      if (content === null) {
        fs.mkdirSync(fullPath, { recursive: true })
      } else {
        fs.writeFileSync(fullPath, content)
      }
      filesCreated.push(fullPath)
    }
  })

  // 3. Write _rules.md from config + detected stack
  const hints = detectStackHints()
  const rulesPath = path.join(KB_ROOT, '_rules.md')
  if (!fs.existsSync(rulesPath)) {
    const rulesContent = generateRulesContent(cfg, hints)
    fs.writeFileSync(rulesPath, rulesContent)
    filesCreated.push(rulesPath)
  } else if (hints.stack || hints.submoduleStacks?.length > 0) {
    // Re-init: update code_path_patterns if detected stacks changed, preserving other user edits
    const existing = fs.readFileSync(rulesPath, 'utf8')
    const parsed = matter(existing)
    const stacksSummary = buildStacksSummary(hints)
    const summaryKey = JSON.stringify([...stacksSummary].sort())
    // Backward compat: read old _detected_stack (string) or new _detected_stacks (array)
    const existingRaw = parsed.data._detected_stacks
      || (parsed.data._detected_stack ? [parsed.data._detected_stack] : ['unknown'])
    const existingKey = JSON.stringify([].concat(existingRaw).sort())
    if (summaryKey !== existingKey) {
      const newPatternsYaml = generateCodePathPatterns(hints)
      // Replace the code_path_patterns section in the raw file
      const updatedContent = existing.replace(
        /code_path_patterns:[\s\S]*?(?=\n\w|\n---)/,
        newPatternsYaml + '\n'
      )
      if (updatedContent !== existing) {
        // Update _detected_stacks in front-matter, remove old singular field
        const updatedParsed = matter(updatedContent)
        updatedParsed.data._detected_stacks = stacksSummary
        delete updatedParsed.data._detected_stack
        const final = matter.stringify(updatedParsed.content, updatedParsed.data)
        fs.writeFileSync(rulesPath, final)
        filesCreated.push(rulesPath + ' (updated code_path_patterns)')
      }
    }
  }

  // 4. Copy templates from _mcp internal templates
  copyTemplates(filesCreated)

  // 4b. Scaffold standard stubs from all detected presets (deduplicated)
  const scaffoldedStandards = []
  const stacksToScaffold = []
  if (hints.stack && hints.stack !== 'monorepo') stacksToScaffold.push(hints.stack)
  for (const entry of (hints.submoduleStacks || [])) {
    if (!stacksToScaffold.includes(entry.stack)) stacksToScaffold.push(entry.stack)
  }
  const seenScaffold = new Set()
  for (const stackName of stacksToScaffold) {
    const preset = loadPresetFull(stackName)
    if (!preset?.standards_scaffold) continue
    for (const entry of preset.standards_scaffold) {
      const key = `${entry.type}:${entry.id || ''}:${entry.group || ''}`
      if (seenScaffold.has(key)) continue
      seenScaffold.add(key)
      const filePath = resolveFilePath(entry.type, entry.id, entry.group)
      if (filePath && !fs.existsSync(filePath)) {
        await scaffold({ type: entry.type, id: entry.id, group: entry.group })
        scaffoldedStandards.push(filePath)
      }
    }
  }

  // 5. Write .gitattributes
  const gitAttrPath = '.gitattributes'
  if (!fs.existsSync(gitAttrPath)) {
    fs.writeFileSync(gitAttrPath, GIT_ATTRIBUTES)
    filesCreated.push(gitAttrPath)
  }

  // 6. Ensure git repo exists — auto-init if not (hooks require .git)
  let gitInitialized = false
  if (!fs.existsSync('.git')) {
    const { execSync } = require('child_process')
    try {
      execSync('git init', { cwd: process.cwd(), stdio: 'ignore' })
      gitInitialized = true
      console.log('[kb-init] No git repository found — ran `git init` automatically.')
    } catch (e) {
      console.warn('[kb-init] Could not run `git init`:', e.message)
    }
  }

  // 7. Install git hooks
  const hooksInstalled = installGitHooks()

  // 8. Install git merge drivers in .git/config
  installMergeDrivers()

  // 9. Write .cursor/mcp.json
  const cursorDir = '.cursor'
  if (!fs.existsSync(cursorDir)) fs.mkdirSync(cursorDir, { recursive: true })
  fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(CURSOR_MCP, null, 2))
  filesCreated.push('.cursor/mcp.json')

  // 9b. Generate agent rule files (CLAUDE.md, .cursorrules, .windsurfrules)
  const { generateAgentRules } = require('../lib/agent-rules')
  generateAgentRules(filesCreated)

  // 10. Generate initial _index.yaml
  await reindex({ silent: true })
  filesCreated.push(path.join(KB_ROOT, '_index.yaml'))

  // 11. Check for submodule pattern gaps
  const { loadRules } = require('../lib/rules')
  const submoduleGaps = detectSubmodulePatternGaps(loadRules(KB_ROOT))

  // 12. Print setup guide
  printSetupGuide(cfg, hints, submoduleGaps)

  return {
    setup_complete: true,
    files_created: filesCreated,
    hooks_installed: hooksInstalled,
    ...(hints.stack && { detected_stack: hints.stack }),
    ...(hints.submoduleStacks?.length > 0 && { detected_stacks: buildStacksSummary(hints) }),
    ...(scaffoldedStandards.length > 0 && { scaffolded_standards: scaffoldedStandards }),
    ...(gitInitialized && { git_initialized: true, note: '`git init` was run automatically — remember to set your remote with `git remote add origin <url>`' })
  }
}

async function promptConfig() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise(resolve => rl.question(q, resolve))

  console.log('\n=== KB-MCP Setup ===\n')

  const projectName = await ask('Project name: ')
  const appNamesInput = await ask('App names (comma-separated, e.g. frontend,backend): ')
  const appNames = appNamesInput.split(',').map(s => s.trim()).filter(Boolean)

  rl.close()

  return { projectName, appNames }
}

function getDefaultConfig() {
  return { projectName: 'My Project', appNames: ['app'] }
}

function generateRulesContent(cfg, hints = {}) {
  const appNames = (cfg.appNames || ['app']).join(', ')
  return `---
version: "1.0"
project_name: "${cfg.projectName || 'My Project'}"
app_names: [${appNames}]
_detected_stacks: [${buildStacksSummary(hints).map(s => `"${s}"`).join(', ')}]

depth_policy:
  default_max: 3
  group_trigger: 5
  group_warn: 8
  overrides:
    features: 3
    flows: 2
    ui: 2
    integrations: 2
    data: 2
    validation: 1
    decisions: 1
    standards: 2
    sync: 1
  never_group:
    - data
    - validation
    - decisions
    - sync

secret_patterns:
  - sk_live_
  - "Bearer "
  - private_key
  - "password:"
  - "api_key:"
  - "secret:"

${generateCodePathPatterns(hints)}

prompt_overrides:
  base_dir: "knowledge/_templates/prompts"
  override_dir: "knowledge/_prompt-overrides"
  valid_override_types:
    - replace
    - extend-before
    - extend-after
    - suppress
    - section-replace
  suppress_requires_reason: true
  protected:
    - drift-summary
    - ask-sync
---

# Knowledge Base Rules

This file configures the KB-MCP system. Edit the YAML front-matter above to configure:
- Folder depth limits
- Secret patterns to block
- Code path patterns for drift detection
- Prompt override settings

See knowledge/_mcp/presets/ for stack-specific code_path_patterns presets.
`
}

/**
 * Detect stack for a single directory. Checks indicator files first, then falls
 * back to scanning for dominant source file extensions when no indicator is found.
 */
function detectSubdirStack(dirPath) {
  if (fs.existsSync(path.join(dirPath, 'go.mod'))) return 'go'
  if (fs.existsSync(path.join(dirPath, 'pom.xml')) ||
      fs.existsSync(path.join(dirPath, 'build.gradle')) ||
      fs.existsSync(path.join(dirPath, 'build.gradle.kts'))) return 'spring-boot'
  if (fs.existsSync(path.join(dirPath, 'Gemfile'))) return 'rails'
  if (fs.existsSync(path.join(dirPath, 'requirements.txt')) ||
      fs.existsSync(path.join(dirPath, 'pyproject.toml'))) return 'django'

  const pkgPath = path.join(dirPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) return 'nextjs'
      if (deps['@nestjs/core']) return 'nestjs'
      if (deps['react-native']) return 'react-native'
      if (deps['vue'] || deps['@vue/core']) return 'vue'
      if (deps['react']) return 'react-vite'
    } catch { /* non-fatal */ }
  }

  return detectStackByExtension(dirPath)
}

/**
 * Scan a directory (up to 2 levels deep) for source files and infer stack
 * from the dominant extension. Returns a generic stack name or null.
 */
function detectStackByExtension(dirPath) {
  const EXT_MAP = {
    '.py': 'python',
    '.go': 'go',
    '.rb': 'rails',
    '.java': 'spring-boot',
    '.kt': 'spring-boot',
    '.rs': 'rust',
  }
  const SKIP = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv'])
  const counts = {}

  const scanDir = (dir, depth) => {
    if (depth > 2) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue
      if (e.isDirectory()) {
        scanDir(path.join(dir, e.name), depth + 1)
      } else if (e.isFile()) {
        const ext = path.extname(e.name)
        if (EXT_MAP[ext]) counts[EXT_MAP[ext]] = (counts[EXT_MAP[ext]] || 0) + 1
      }
    }
  }

  scanDir(dirPath, 0)
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted.length > 0 ? sorted[0][0] : null
}

/**
 * Build a serializable summary array of all detected stacks for frontmatter storage.
 * Root stack (no dir prefix) + submodule stacks (stack:dir format).
 */
function buildStacksSummary(hints) {
  const result = []
  if (hints.stack && hints.stack !== 'monorepo') result.push(hints.stack)
  for (const entry of (hints.submoduleStacks || [])) {
    result.push(`${entry.stack}:${entry.dir}`)
  }
  return result.length > 0 ? result : ['unknown']
}

/**
 * Copy a parsed code_path_patterns array, prefixing every path glob with a dir.
 * Used to scope a preset's patterns to a specific submodule directory.
 */
function prefixPatternPaths(patterns, prefix) {
  return patterns.map(p => ({
    ...p,
    paths: (p.paths || []).map(glob => `${prefix}/${glob}`)
  }))
}

/**
 * Detect the project's tech stack by scanning indicator files and package.json.
 * Returns { stack: string|null, srcDirs: string[], submoduleStacks: Array<{dir, stack}> }
 */
function detectStackHints() {
  const cwd = process.cwd()
  const hints = { stack: null, srcDirs: [] }

  // Detect source dirs that actually exist
  const knownSrcDirs = ['src', 'app', 'lib', 'pkg', 'cmd', 'internal', 'api', 'web']
  hints.srcDirs = knownSrcDirs.filter(d => fs.existsSync(path.join(cwd, d)))

  // Non-JS stacks (checked first — unambiguous)
  if (fs.existsSync(path.join(cwd, 'go.mod'))) { hints.stack = 'go'; return hints }
  if (fs.existsSync(path.join(cwd, 'pom.xml')) ||
      fs.existsSync(path.join(cwd, 'build.gradle')) ||
      fs.existsSync(path.join(cwd, 'build.gradle.kts'))) { hints.stack = 'spring-boot'; return hints }
  if (fs.existsSync(path.join(cwd, 'Gemfile'))) { hints.stack = 'rails'; return hints }
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) ||
      fs.existsSync(path.join(cwd, 'pyproject.toml'))) { hints.stack = 'django'; return hints }

  // JS/TS: detect framework from package.json
  const pkgPath = path.join(cwd, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) hints.stack = 'nextjs'
      else if (deps['@nestjs/core']) hints.stack = 'nestjs'
      else if (deps['react-native']) hints.stack = 'react-native'
      else if (deps['vue'] || deps['@vue/core']) hints.stack = 'vue'
      else if (deps['react']) hints.stack = 'react-vite'
    } catch { /* non-fatal — fall through to null */ }
  }

  const SKIP_SCAN = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', 'knowledge'])

  // Monorepo: multiple package.json in subdirs
  if (!hints.stack) {
    const subdirs = fs.readdirSync(cwd, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_SCAN.has(e.name) &&
        fs.existsSync(path.join(cwd, e.name, 'package.json')))
    if (subdirs.length >= 2) hints.stack = 'monorepo'
  }

  // Multi-stack submodule/subdir detection — runs regardless of whether root stack was found
  const submoduleStacks = []
  const dirsToScan = []

  // Prefer .gitmodules paths (precise — knows which dirs are submodules)
  const gitmodulesPath = path.join(cwd, '.gitmodules')
  if (fs.existsSync(gitmodulesPath)) {
    const gmContent = fs.readFileSync(gitmodulesPath, 'utf8')
    for (const m of gmContent.matchAll(/path\s*=\s*(.+)/g)) {
      const subPath = m[1].trim()
      if (fs.existsSync(path.join(cwd, subPath))) dirsToScan.push(subPath)
    }
  }
  // Also include top-level non-hidden dirs not already covered
  for (const e of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_SCAN.has(e.name) && !dirsToScan.includes(e.name)) {
      dirsToScan.push(e.name)
    }
  }

  for (const dir of dirsToScan) {
    const stack = detectSubdirStack(path.join(cwd, dir))
    if (stack) submoduleStacks.push({ dir, stack })
  }

  hints.submoduleStacks = submoduleStacks
  if (submoduleStacks.length > 0 && !hints.stack) hints.stack = 'monorepo'

  return hints
}


function loadPresetFull(stackName) {
  const presetPath = path.join(__dirname, '../presets', `${stackName}.yaml`)
  if (!fs.existsSync(presetPath)) return null
  try {
    return yaml.load(fs.readFileSync(presetPath, 'utf8'))
  } catch { return null }
}

/**
 * Generate the code_path_patterns YAML block for _rules.md.
 * Merges patterns from all detected stacks, prefixing submodule paths.
 * Falls back to universal defaults if no stacks detected.
 */
function generateCodePathPatterns(hints = {}) {
  const allPatterns = []

  // Root single-stack: load preset as-is (no prefix) — backward compat
  if (hints.stack && hints.stack !== 'monorepo') {
    const rootPreset = loadPresetFull(hints.stack)
    if (rootPreset && Array.isArray(rootPreset.code_path_patterns)) {
      allPatterns.push(...rootPreset.code_path_patterns)
    }
  }

  // Submodule stacks: load each preset, prefix all path globs with dir
  for (const entry of (hints.submoduleStacks || [])) {
    const preset = loadPresetFull(entry.stack)
    if (preset && Array.isArray(preset.code_path_patterns)) {
      allPatterns.push(...prefixPatternPaths(preset.code_path_patterns, entry.dir))
    }
  }

  if (allPatterns.length > 0) {
    return yaml.dump({ code_path_patterns: allPatterns }, {
      lineWidth: 120, noRefs: true, forceQuotes: true
    }).trimEnd()
  }

  // Universal fallback: dependency + config only (works for any stack)
  // Copy patterns from knowledge/_mcp/presets/ for your source code layout.
  return `code_path_patterns:
  # No stack auto-detected. Copy source patterns from knowledge/_mcp/presets/<stack>.yaml
  # and paste them here. The dependency and config intents below work for all stacks.
  - intent: dependency
    kb_target: "standards/code/tech-stack.md"
    paths:
      - "package.json"
      - "package-lock.json"
      - "yarn.lock"
      - "pnpm-lock.yaml"
      - "go.mod"
      - "go.sum"
      - "pom.xml"
      - "build.gradle"
      - "build.gradle.kts"
      - "requirements.txt"
      - "pyproject.toml"
      - "Gemfile"
      - "Cargo.toml"
  - intent: config
    kb_target: "standards/code/conventions.md"
    paths:
      - "tsconfig.json"
      - "tsconfig.*.json"
      - ".eslintrc*"
      - "eslint.config.*"
      - ".prettierrc*"`
}

function copyTemplates(filesCreated) {
  // Templates are bundled with the MCP server — copy from server location into the new project.
  const mcpTemplatesDir = path.join(__dirname, '../../_templates')
  const kbTemplatesDir = path.join(KB_ROOT, '_templates')

  if (fs.existsSync(mcpTemplatesDir)) {
    copyDirRecursive(mcpTemplatesDir, kbTemplatesDir, filesCreated)

    // Write manifest so kb_upgrade can track what was installed
    const { writeManifest, buildTemplateHashes } = require('../lib/manifest')
    const pkg = require('../package.json')
    writeManifest(kbTemplatesDir, pkg.version, buildTemplateHashes(kbTemplatesDir))
  }
}

function copyDirRecursive(src, dest, filesCreated) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  entries.forEach(entry => {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filesCreated)
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
      filesCreated.push(destPath)
    }
  })
}

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

function printSetupGuide(cfg, hints = {}, submoduleGaps = []) {
  let stackLine
  if (hints.submoduleStacks?.length > 0) {
    const subEntries = hints.submoduleStacks.map(e => `${e.stack} (${e.dir})`).join(', ')
    const rootPart = (hints.stack && hints.stack !== 'monorepo') ? `${hints.stack} (root), ` : ''
    stackLine = `   Detected stacks: ${rootPart}${subEntries} — code_path_patterns pre-filled with prefixed paths.`
  } else if (hints.stack) {
    stackLine = `   Detected stack: ${hints.stack} — code_path_patterns pre-filled from preset.`
  } else {
    stackLine = `   No stack detected — copy patterns from knowledge/_mcp/presets/<stack>.yaml`
  }

  let submoduleLine = ''
  if (submoduleGaps.length > 0) {
    const ownedGaps = submoduleGaps.filter(s => !s.isShared)
    const sharedGaps = submoduleGaps.filter(s => s.isShared)

    const ownedLines = ownedGaps.map(s => `     - ${s.path}/  →  add patterns like: ${s.path}/src/**`).join('\n')
    const sharedLines = sharedGaps.map(s => `     - ${s.path}/  (shared — branch enforcement skipped)`).join('\n')
    const gapLines = [ownedLines, sharedLines].filter(Boolean).join('\n')

    const sharedHint = sharedGaps.length === 0
      ? `   If a submodule is independent and not part of your feature branches:
     Add kb-shared = true to its block in .gitmodules to skip branch enforcement.
     Example:
       [submodule "client-sdk"]
           path = client-sdk
           url = git@github.com:org/client-sdk.git
           kb-shared = true
`
      : ''

    submoduleLine = `
6. Submodule code path patterns needed:
   The following submodules have no matching code_path_patterns in _rules.md:
${gapLines}
   Without prefixed patterns, drift detection won't match files inside these submodules.
   Edit knowledge/_rules.md → code_path_patterns to add them.

${sharedHint}   Push helper: use kb_sub tool (command: "push")
   Standalone: ./knowledge/_mcp/scripts/kb-feature.sh push
   (Pushes submodules first with -u, then parent — correct order for drift)
`
  }

  console.log(`
╔══════════════════════════════════════════════════════╗
║           KB-MCP Setup Complete                      ║
║  Project: ${(cfg.projectName || 'My Project').padEnd(42)}║
╚══════════════════════════════════════════════════════╝

Next steps:

1. Install dependencies:
   cd knowledge/_mcp && npm install

2. Review code path patterns:
${stackLine}
   Edit knowledge/_rules.md → code_path_patterns to refine.

3. Scaffold your first KB file:
   kb_scaffold type=feature id=my-first-feature

4. Add standards files:
   kb_scaffold type=global-rules                      ← always loaded, cross-cutting rules
   kb_scaffold type=standard id=components group=code ← loaded when working on code
   kb_scaffold type=standard id=feature group=knowledge ← loaded when working on KB files
   kb_scaffold type=standard id=code-review group=process ← task workflow standards

5. Open in Cursor/Claude Code — the MCP server auto-starts.
   No API key needed — the agent IS the LLM.
${submoduleLine}
KB root: knowledge/
MCP config: .cursor/mcp.json
Rules: knowledge/_rules.md
`)
}

module.exports = { runTool }
