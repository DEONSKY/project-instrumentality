import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import matter from 'gray-matter'
import * as yaml from 'js-yaml'
import { matterStringify } from '../lib/matter-utils'
import { runTool as reindex } from './reindex'
import { runTool as scaffold } from './scaffold'
import { resolveFilePath } from '../lib/kb-paths'
import * as pkgPaths from '../lib/pkg-paths'
import type { ToolDefinition } from '../src/types/tool'

const KB_ROOT = 'knowledge'

interface SubmoduleStack { dir: string; stack: string }
interface StackHints {
  stack: string | null
  srcDirs: string[]
  submoduleStacks?: SubmoduleStack[]
}
interface InitConfig { projectName?: string }
interface SubmoduleGap { path: string; isShared: boolean }
interface ScaffoldEntry { type: string; id?: string; group?: string }
interface Preset {
  standards_scaffold?: ScaffoldEntry[]
  code_path_patterns?: Array<Record<string, unknown>>
  [key: string]: unknown
}

const FOLDER_STRUCTURE = [
  'specs/features',
  'specs/flows',
  'data/schema',
  'data/validation',
  'integrations',
  'decisions',
  'components',
  'standards/code',
  'standards/contracts',
  'standards/knowledge',
  'standards/process',
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

const GIT_ATTRIBUTES = `knowledge/_index.yaml                merge=kb-reindex
knowledge/sync/code-drift.md         merge=union
knowledge/sync/kb-drift.md           merge=union
knowledge/sync/standards-drift.md    merge=union
knowledge/sync/standards-backlog.md  merge=union
knowledge/sync/review-queue.md       merge=union
knowledge/sync/drift-log/**          merge=union
knowledge/sync/import-review.md      merge=union
knowledge/sync/inbound/**            merge=union
knowledge/sync/outbound/**           merge=union
knowledge/specs/features/**          merge=kb-conflict
knowledge/specs/flows/**             merge=kb-conflict
knowledge/_rules.md                  merge=kb-conflict
knowledge/assets/**/*.png            filter=lfs diff=lfs merge=lfs -text
knowledge/assets/**/*.jpg            filter=lfs diff=lfs merge=lfs -text
knowledge/assets/**/*.jpeg           filter=lfs diff=lfs merge=lfs -text
knowledge/assets/**/*.gif            filter=lfs diff=lfs merge=lfs -text
knowledge/assets/**/*.pdf            filter=lfs diff=lfs merge=lfs -text
knowledge/assets/**/*.fig            filter=lfs diff=lfs merge=lfs -text
`

const CURSOR_MCP = {
  mcpServers: {
    kb: {
      command: 'node',
      args: ['knowledge/_mcp/server.js']
    }
  }
}

const VSCODE_MCP = {
  servers: {
    kb: {
      type: 'stdio',
      command: 'node',
      args: ['knowledge/_mcp/server.js']
    }
  }
}

// Hook templates + installers live in ../lib/git-hooks.js. They use __dirname
// to bake in the bundled paths; lib/git-hooks.js resolves the same paths as
// the previous in-file location (both are one level under _mcp/).
import {
  installGitHooks,
  installMergeDrivers,
  detectSubmodulePatternGaps
} from '../lib/git-hooks'


async function runTool(
  { interactive = true, config = null, regenerate_agent_rules = false, force = false }: {
    interactive?: boolean
    config?: InitConfig | null
    regenerate_agent_rules?: boolean
    force?: boolean
  } = {}
): Promise<Record<string, unknown>> {
  if (regenerate_agent_rules) {
    const { generateAgentRules, AGENT_RULE_FILES } = require('../lib/agent-rules') as typeof import('../lib/agent-rules')
    if (force) {
      for (const f of AGENT_RULE_FILES) {
        if (fs.existsSync(f)) fs.writeFileSync(f, '', 'utf8')
      }
    }
    const written = generateAgentRules()
    const skipped = AGENT_RULE_FILES.filter(f => !written.includes(f))
    return {
      files_written: written,
      files_skipped: skipped,
      note: skipped.length > 0 ? 'Existing files with content were not overwritten. Use force: true to regenerate.' : undefined
    }
  }

  let cfg: InitConfig | null = config

  if (interactive && !cfg && process.stdin.isTTY) {
    cfg = await promptConfig()
  } else if (!cfg) {
    cfg = getDefaultConfig()
  }

  const filesCreated: string[] = []

  // 1. Create folder structure
  FOLDER_STRUCTURE.forEach(folder => {
    const fullPath = path.join(KB_ROOT, folder)
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
      filesCreated.push(fullPath + '/')
    }
  })

  // 1a. Drop .gitkeep into asset folders so the structure survives `git add`
  // even before any artefact lands — preserves the contract from
  // decisions/design-asset-storage.md.
  ;['assets/design', 'assets/screenshots'].forEach(folder => {
    const keepPath = path.join(KB_ROOT, folder, '.gitkeep')
    if (!fs.existsSync(keepPath)) {
      fs.writeFileSync(keepPath, '')
      filesCreated.push(keepPath)
    }
  })

  // 2. Write sync stub files
  const MERGE_PROTOCOL_NOTE = '> **On merge conflicts:** queue files use `merge=union` — different entries from different branches coalesce automatically. If the same entry appears twice, dedupe keeping the one with the later `since` commit. The post-merge git hook collapses duplicate `<!-- baseline: -->` lines automatically; if it didn\'t run, keep whichever SHA is the descendant of the other.'
  const syncFiles = {
    'sync/code-drift.md': `<!-- AUTO-GENERATED by kb-mcp — resolve via kb_drift in Claude. Do not delete entries manually. -->\n\n# Code Drift Queue\n\nCode changed without matching KB update. PM/tech lead reviews each entry.\n\n${MERGE_PROTOCOL_NOTE}\n`,
    'sync/kb-drift.md': `<!-- AUTO-GENERATED by kb-mcp — resolve via kb_drift in Claude. Do not delete entries manually. -->\n\n# KB Drift Queue\n\nKB spec changed — review whether code still matches the updated spec.\n\n${MERGE_PROTOCOL_NOTE}\n`,
    'sync/standards-drift.md': `<!-- AUTO-GENERATED by kb-mcp — resolve via kb_conform in Claude. Do not delete entries manually. -->\n\n# Standards Drift Queue\n\nCurrent-diff conformance violations. Code touched in this branch fails one or more standards rules. Review-required before PR merge.\n\n${MERGE_PROTOCOL_NOTE}\n`,
    'sync/standards-backlog.md': `<!-- AUTO-GENERATED by kb-mcp — surfaced advisorily by kb_get when editing affected files. -->\n\n# Standards Backlog\n\nAspirational entries from retroactive sweeps when standards are tightened. Advisory — fix opportunistically when next editing the affected files.\n\n${MERGE_PROTOCOL_NOTE}\n`,
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
  } else if (hints.stack || (hints.submoduleStacks?.length ?? 0) > 0) {
    // Re-init: update code_path_patterns if detected stacks changed, preserving other user edits
    const existing = fs.readFileSync(rulesPath, 'utf8')
    const parsed = matter(existing)
    const data = parsed.data as Record<string, unknown>
    const stacksSummary = buildStacksSummary(hints)
    const summaryKey = JSON.stringify([...stacksSummary].sort())
    // Backward compat: read old _detected_stack (string) or new _detected_stacks (array)
    const existingRaw = data._detected_stacks
      || (data._detected_stack ? [data._detected_stack] : ['unknown'])
    const existingKey = JSON.stringify(([] as unknown[]).concat(existingRaw).sort())

    let workingContent = existing

    // F44: inject app_root_patterns if monorepo detected AND block is missing.
    // Idempotent — if the user already has the block (even with custom values),
    // leave it alone. Insert before code_path_patterns: so the YAML is grouped.
    const monorepoDetected = hints.stack === 'monorepo' && ((hints.submoduleStacks?.length ?? 0) > 0)
    const hasAppRootPatterns = data.app_root_patterns !== undefined
    if (monorepoDetected && !hasAppRootPatterns) {
      const block = generateAppRootPatterns(hints) + '\n\n'
      workingContent = workingContent.replace(
        /(?=\ncode_path_patterns:)/,
        '\n' + block
      )
    }

    if (summaryKey !== existingKey) {
      const newPatternsYaml = generateCodePathPatterns(hints)
      // Replace the code_path_patterns section in the raw file
      workingContent = workingContent.replace(
        /code_path_patterns:[\s\S]*?(?=\n\w|\n---)/,
        newPatternsYaml + '\n'
      )
    }

    if (workingContent !== existing) {
      // Update _detected_stacks in front-matter, remove old singular field
      const updatedParsed = matter(workingContent)
      updatedParsed.data._detected_stacks = stacksSummary
      delete updatedParsed.data._detected_stack
      const final = matterStringify(updatedParsed.content, updatedParsed.data)
      fs.writeFileSync(rulesPath, final)
      const changes: string[] = []
      if (summaryKey !== existingKey) changes.push('code_path_patterns')
      if (monorepoDetected && !hasAppRootPatterns) changes.push('app_root_patterns')
      filesCreated.push(rulesPath + ` (updated ${changes.join(', ')})`)
    }
  }

  // 4. Copy templates from _mcp internal templates
  copyTemplates(filesCreated)

  // 4b. Scaffold standard stubs from all detected presets (deduplicated)
  const scaffoldedStandards: string[] = []
  const stacksToScaffold: string[] = []
  if (hints.stack && hints.stack !== 'monorepo') stacksToScaffold.push(hints.stack)
  for (const entry of (hints.submoduleStacks || [])) {
    if (!stacksToScaffold.includes(entry.stack)) stacksToScaffold.push(entry.stack)
  }
  const seenScaffold = new Set<string>()
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
      console.warn('[kb-init] Could not run `git init`:', (e as Error).message)
    }
  }

  // 7. Install git hooks
  const hooksInstalled = installGitHooks()

  // 8. Install git merge drivers in .git/config
  installMergeDrivers()

  // 9. Write .cursor/mcp.json (F39: only when content differs)
  const cursorDir = '.cursor'
  if (!fs.existsSync(cursorDir)) fs.mkdirSync(cursorDir, { recursive: true })
  const cursorPath = path.join(cursorDir, 'mcp.json')
  const newCursorContent = JSON.stringify(CURSOR_MCP, null, 2)
  const existingCursorContent = fs.existsSync(cursorPath) ? fs.readFileSync(cursorPath, 'utf8') : null
  if (existingCursorContent !== newCursorContent) {
    fs.writeFileSync(cursorPath, newCursorContent)
    filesCreated.push('.cursor/mcp.json')
  }

  // 9a. Write .vscode/mcp.json (GitHub Copilot / VS Code MCP)
  const vscodeDir = '.vscode'
  const vscodeMcpPath = path.join(vscodeDir, 'mcp.json')
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true })
  if (!fs.existsSync(vscodeMcpPath)) {
    fs.writeFileSync(vscodeMcpPath, JSON.stringify(VSCODE_MCP, null, 2))
    filesCreated.push(vscodeMcpPath)
  }

  // 9b. Generate agent rule files (CLAUDE.md, .cursorrules, .windsurfrules, .github/copilot-instructions.md)
  const { generateAgentRules } = require('../lib/agent-rules') as typeof import('../lib/agent-rules')
  generateAgentRules(filesCreated)

  // 10. Generate initial _index.yaml
  await reindex({ silent: true })
  filesCreated.push(path.join(KB_ROOT, '_index.yaml'))

  // 11. Check for submodule pattern gaps
  const { loadRules } = require('../lib/rules') as typeof import('../lib/rules')
  const submoduleGaps = detectSubmodulePatternGaps(loadRules(KB_ROOT))

  // 12. Print setup guide
  printSetupGuide(cfg, hints, submoduleGaps)

  return {
    setup_complete: true,
    files_created: filesCreated,
    hooks_installed: hooksInstalled,
    ...(hints.stack && { detected_stack: hints.stack }),
    ...((hints.submoduleStacks?.length ?? 0) > 0 && { detected_stacks: buildStacksSummary(hints) }),
    ...(scaffoldedStandards.length > 0 && { scaffolded_standards: scaffoldedStandards }),
    ...(gitInitialized && { git_initialized: true, note: '`git init` was run automatically — remember to set your remote with `git remote add origin <url>`' })
  }
}

async function promptConfig(): Promise<InitConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve))

  console.log('\n=== KB-MCP Setup ===\n')

  const projectName = await ask('Project name: ')

  rl.close()

  return { projectName }
}

function getDefaultConfig(): InitConfig {
  return { projectName: 'My Project' }
}

function generateRulesContent(cfg: InitConfig, hints: StackHints): string {
  return `---
version: "1.0"
project_name: "${cfg.projectName || 'My Project'}"
_detected_stacks: [${buildStacksSummary(hints).map(s => `"${s}"`).join(', ')}]

depth_policy:
  default_max: 3
  overrides:
    specs: 4
    data: 3
    integrations: 2
    decisions: 1
    standards: 2
    sync: 1
  never_group:
    - data
    - decisions
    - sync

secret_patterns:
  - sk_live_
  - "Bearer "
  - private_key
  - "password:"
  - "api_key:"
  - "secret:"

${generateAppRootPatterns(hints)}

${generateCodePathPatterns(hints)}

# Standards & conformance (optional). Uncomment to customise:
# working_paths_cap: 10           # max rules surfaced by kb_get rules_in_scope per call
# standards_threshold: 40         # warn when a standard's rule count exceeds this

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
    - conform-check
    - conform-resolve
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
function detectSubdirStack(dirPath: string): string | null {
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
function detectStackByExtension(dirPath: string): string | null {
  const EXT_MAP: Record<string, string> = {
    '.py': 'python',
    '.go': 'go',
    '.rb': 'rails',
    '.java': 'spring-boot',
    '.kt': 'spring-boot',
    '.rs': 'rust',
  }
  const SKIP = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv'])
  const counts: Record<string, number> = {}

  const scanDir = (dir: string, depth: number): void => {
    if (depth > 2) return
    let entries: fs.Dirent[]
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
function buildStacksSummary(hints: StackHints): string[] {
  const result: string[] = []
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
function prefixPatternPaths(patterns: Array<Record<string, unknown>>, prefix: string): Array<Record<string, unknown>> {
  return patterns.map(p => ({
    ...p,
    paths: ((p.paths as string[]) || []).map(glob => `${prefix}/${glob}`)
  }))
}

/**
 * Detect the project's tech stack by scanning indicator files and package.json.
 * Returns { stack: string|null, srcDirs: string[], submoduleStacks: Array<{dir, stack}> }
 */
function detectStackHints(): StackHints {
  const cwd = process.cwd()
  const hints: StackHints = { stack: null, srcDirs: [] }

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
  const submoduleStacks: SubmoduleStack[] = []
  const dirsToScan: string[] = []

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


function loadPresetFull(stackName: string): Preset | null {
  const presetPath = path.join(pkgPaths.presetsDir(), `${stackName}.yaml`)
  if (!fs.existsSync(presetPath)) return null
  try {
    return yaml.load(fs.readFileSync(presetPath, 'utf8')) as Preset
  } catch { return null }
}

/**
 * Generate the app_root_patterns YAML block for _rules.md.
 *
 * Monorepo case: emit an uncommented map of "<dir>/**": <dir> for each
 *   detected submodule stack, so standards using app_scope: <dir> filtering
 *   actually resolve. Without this block, every file's inferred scope is
 *   null and scoped standards silently never match (the F44 finding).
 *
 * Single-stack / unknown case: emit a commented example so users have a
 *   template to copy from if their layout becomes monorepo later.
 */
function generateAppRootPatterns(hints: StackHints): string {
  const stacks = hints.submoduleStacks || []
  if (hints.stack !== 'monorepo' || stacks.length === 0) {
    return `# app_root_patterns:               # path glob → app_scope (monorepos only)
#   "ms-fe-web/**": ms-fe-web
#   "ms-be-go/**": ms-be-go`
  }
  // Dedup by dir; keep insertion order
  const seen = new Set<string>()
  const lines: string[] = []
  for (const s of stacks) {
    if (seen.has(s.dir)) continue
    seen.add(s.dir)
    lines.push(`  "${s.dir}/**": ${s.dir}`)
  }
  return `# app_root_patterns maps file globs to app scopes. Required when standards
# use app_scope: <name> filtering — without it, every file's inferred scope
# is null and scoped standards never match.
app_root_patterns:
${lines.join('\n')}`
}

/**
 * Generate the code_path_patterns YAML block for _rules.md.
 * Merges patterns from all detected stacks, prefixing submodule paths.
 * Falls back to universal defaults if no stacks detected.
 */
function generateCodePathPatterns(hints: StackHints): string {
  const allPatterns: Array<Record<string, unknown>> = []

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

function copyTemplates(filesCreated: string[]): void {
  // Templates are bundled with the MCP server — copy from server location into the new project.
  const mcpTemplatesDir = pkgPaths.bundledTemplatesDir()
  const kbTemplatesDir = path.join(KB_ROOT, '_templates')

  if (fs.existsSync(mcpTemplatesDir)) {
    copyDirRecursive(mcpTemplatesDir, kbTemplatesDir, filesCreated)

    // Write manifest so kb_upgrade can track what was installed
    const { writeManifest, buildTemplateHashes } = require('../lib/manifest') as typeof import('../lib/manifest')
    const pkg = require(pkgPaths.packageJsonPath()) as { version: string }
    writeManifest(kbTemplatesDir, pkg.version, buildTemplateHashes(kbTemplatesDir))
  }
}

function copyDirRecursive(src: string, dest: string, filesCreated: string[]): void {
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


function printSetupGuide(cfg: InitConfig, hints: StackHints, submoduleGaps: SubmoduleGap[] = []): void {
  let stackLine: string
  if ((hints.submoduleStacks?.length ?? 0) > 0) {
    const subEntries = (hints.submoduleStacks ?? []).map(e => `${e.stack} (${e.dir})`).join(', ')
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
   kb_scaffold type=standard id=api-conventions group=code      ← error format, response envelope
   kb_scaffold type=standard id=auth-rules group=code           ← roles, auth mechanism, tokens
   kb_scaffold type=standard id=i18n-keys group=contracts       ← cross-app: BE sends keys, FE renders
   kb_scaffold type=standard id=feature-doc group=knowledge     ← KB-writing standards
   kb_scaffold type=standard id=code-review group=process       ← task workflow standards

5. Open in Cursor/Claude Code — the MCP server auto-starts.
   No API key needed — the agent IS the LLM.
${submoduleLine}
KB root: knowledge/
MCP config: .cursor/mcp.json
Rules: knowledge/_rules.md
`)
}

const definition: ToolDefinition = {
  name: 'kb_init',
  description: 'Bootstrap a new KB structure in the current monorepo. Pass regenerate_agent_rules: true to (re)generate CLAUDE.md/.cursorrules/.windsurfrules/.github/copilot-instructions.md in the project root.',
  inputSchema: {
    type: 'object',
    properties: {
      interactive: { type: 'boolean', description: 'Run interactive setup prompts', default: true },
      config: { type: 'object', description: 'Config object (skips interactive prompts)' },
      regenerate_agent_rules: { type: 'boolean', description: 'Only regenerate CLAUDE.md/.cursorrules/.windsurfrules/.github/copilot-instructions.md; skip the full bootstrap.' },
      force: { type: 'boolean', description: 'With regenerate_agent_rules: overwrite existing files. Default: false (preserves customizations).' }
    }
  }
}

// _internal is exported for unit-test reach into the helpers. NOT part of the
// MCP surface — kb-mcp consumers should call runTool, not these.
const _internal = { generateAppRootPatterns, generateRulesContent, generateCodePathPatterns, detectStackHints, buildStacksSummary }

export { runTool, _internal, definition }
