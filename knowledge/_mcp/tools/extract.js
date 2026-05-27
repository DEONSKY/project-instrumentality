const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: write } = require('./write')
const { KB_ROOT, resolveFilePath } = require('../lib/kb-paths')
const { globMatch } = require('../lib/patterns')

const SKIP_SCAN = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  'knowledge', '.cursor', '.vscode', '.idea', '__pycache__', '.mypy_cache',
  'vendor', 'target', '.gradle', 'bin', 'obj'
])

const KB_SKIP = new Set(['_templates', '_prompt-overrides', 'sync', 'assets', 'exports'])

const MAX_CODE_FILES = 20
const MAX_LINES_PER_FILE = 150
const MAX_TOTAL_CHARS = 30000
const MAX_KB_FILES = 8

/**
 * kb_extract — Sample existing code or KB files and return a prompt+template for an LLM
 * to derive a standards document from observed patterns.
 *
 * Phase 1 (no content): collect samples → return { file_path, prompt, sample_files, _instruction }
 * Phase 2 (content provided): write the filled content → return { file_path, written }
 */
async function runTool({ source, target_id, target_group, paths, app_scope = 'all', content } = {}) {
  if (!source) return { error: 'source is required: "code" or "knowledge"' }
  if (!['code', 'knowledge'].includes(source)) return { error: 'source must be "code" or "knowledge"' }
  if (!target_id) return { error: 'target_id is required' }
  if (!target_group) return { error: 'target_group is required: "code", "contracts", "knowledge", or "process"' }
  if (!['code', 'contracts', 'knowledge', 'process'].includes(target_group)) {
    return { error: 'target_group must be one of: code, contracts, knowledge, process' }
  }

  const filePath = resolveFilePath('standard', target_id, target_group)

  // Phase 2: write filled content
  if (content) {
    const writeResult = await write({ file_path: filePath, content })
    return { file_path: filePath, written: writeResult.written, lint_errors: writeResult.lint_errors }
  }

  // Phase 1: sample files and return prompt
  let sampleFiles = []
  let sampledContent = ''

  if (source === 'code') {
    const filters = paths ? (Array.isArray(paths) ? paths : [paths]) : null
    sampleFiles = sampleCodeFiles(filters)
    sampledContent = readCodeFiles(sampleFiles)
  } else {
    const folder = typeof paths === 'string' ? paths : null
    // Validate folder existence up-front so the error message is actionable —
    // the prior behavior walked a missing path and fell through to a generic
    // "Run kb_init first" hint that didn't help when paths was actually passed.
    if (folder) {
      const kbRootAbs = path.join(process.cwd(), KB_ROOT)
      const folderAbs = path.join(kbRootAbs, folder)
      if (!fs.existsSync(folderAbs) || !fs.statSync(folderAbs).isDirectory()) {
        const available = listKbSubfolders(kbRootAbs)
        return { error: `Folder not found: ${path.join(KB_ROOT, folder)}. Available subfolders: ${available.join(', ') || '(none)'}` }
      }
    }
    sampleFiles = sampleKbFiles(folder)
    sampledContent = readKbFiles(sampleFiles)
  }

  if (sampleFiles.length === 0) {
    const hint = source === 'code'
      ? 'No source files found. Ensure source code exists and is tracked by git (use `git add -A` first if needed); submodule-resident files are included via `git ls-files --recurse-submodules`.'
      : 'No KB files found. Run kb_init first, or pass paths="<subfolder>" to specify a subfolder.'
    return { error: hint }
  }

  // Load the standard.md template to include in the prompt
  const templatePath = path.join(KB_ROOT, '_templates', 'standards', 'standard.md')
  const templateContent = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : ''

  const promptKey = source === 'code' ? 'extract-code-standard' : 'extract-knowledge-standard'
  const prompt = resolvePrompt(promptKey, {
    file_path: filePath,
    app_scope,
    target_id,
    target_group,
    template_content: templateContent,
    sampled_files: sampledContent
  })

  if (!prompt) {
    return { error: `Prompt template '${promptKey}' not found in knowledge/_templates/prompts/.` }
  }

  return {
    file_path: filePath,
    prompt,
    sample_files: sampleFiles,
    sample_count: sampleFiles.length,
    _instruction: `Review the sampled ${source} files in the prompt. Fill the template to capture the patterns as standards, then call kb_extract({ source: "${source}", target_id: "${target_id}", target_group: "${target_group}", content: "<filled>" }) to save.`
  }
}

// --- Code file sampling ---

function sampleCodeFiles(filters) {
  const allFiles = collectSourceFiles(process.cwd(), 4)

  // Filter by path globs if provided
  const filtered = filters
    ? allFiles.filter(f => filters.some(p => globMatch(f, p)))
    : allFiles

  // Spread-sample: group by top-level directory, pick up to 3 per directory
  const byDir = new Map()
  for (const f of filtered) {
    const topDir = f.includes('/') ? f.split('/')[0] : '_root'
    if (!byDir.has(topDir)) byDir.set(topDir, [])
    byDir.get(topDir).push(f)
  }

  // Sort each group by file size descending, flatten up to MAX_CODE_FILES
  const sampled = []
  for (const files of byDir.values()) {
    const sorted = [...files].sort((a, b) => {
      try {
        return fs.statSync(path.join(process.cwd(), b)).size -
               fs.statSync(path.join(process.cwd(), a)).size
      } catch { return 0 }
    })
    sampled.push(...sorted.slice(0, 3))
    if (sampled.length >= MAX_CODE_FILES) break
  }

  return sampled.slice(0, MAX_CODE_FILES)
}

function readCodeFiles(files) {
  let totalChars = 0
  const parts = []

  for (const f of files) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      const lines = raw.split('\n')
      const truncated = lines.slice(0, MAX_LINES_PER_FILE).join('\n')
      const suffix = lines.length > MAX_LINES_PER_FILE
        ? `\n// ... (${lines.length - MAX_LINES_PER_FILE} more lines truncated)`
        : ''
      parts.push(`### ${f}\n\`\`\`\n${truncated}${suffix}\n\`\`\``)
      totalChars += truncated.length
    } catch { /* skip unreadable */ }
  }

  return parts.join('\n\n')
}

// --- KB file sampling ---

function sampleKbFiles(folder) {
  const kbRoot = path.join(process.cwd(), KB_ROOT)
  const files = []

  function walkKb(dir, relBase) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue
      if (KB_SKIP.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      const relPath = path.join(relBase, entry.name)
      if (entry.isDirectory()) {
        walkKb(fullPath, relPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(relPath)
      }
    }
  }

  if (folder) {
    walkKb(path.join(kbRoot, folder), folder)
  } else {
    let entries
    try { entries = fs.readdirSync(kbRoot, { withFileTypes: true }) } catch { return [] }
    for (const entry of entries) {
      if (entry.isDirectory() && !KB_SKIP.has(entry.name) && !entry.name.startsWith('_')) {
        walkKb(path.join(kbRoot, entry.name), entry.name)
      }
    }
  }

  // Sort by file size descending, take up to MAX_KB_FILES
  return files
    .sort((a, b) => {
      try {
        return fs.statSync(path.join(kbRoot, b)).size -
               fs.statSync(path.join(kbRoot, a)).size
      } catch { return 0 }
    })
    .slice(0, MAX_KB_FILES)
}

function readKbFiles(files) {
  const kbRoot = path.join(process.cwd(), KB_ROOT)
  const parts = []

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(kbRoot, f), 'utf8')
      parts.push(`### ${f}\n\n${content}`)
    } catch { /* skip */ }
  }

  return parts.join('\n\n---\n\n')
}

// --- Source file helpers (mirrored from analyze.js) ---

/**
 * Collect tracked source files via `git ls-files --recurse-submodules`. This
 * replaces the prior fs.walk because the walker stopped at submodule
 * boundaries (SKIP_SCAN treats `.git` as cut), missing all code in monorepos
 * whose code lives in submodules. Falls back to fs.walk if git is unavailable
 * (e.g. project not yet `git init`-ed) so kb_extract still works in fresh
 * directories.
 */
function collectSourceFiles(rootDir, maxDepth) {
  try {
    const out = execFileSync('git', ['ls-files', '--recurse-submodules'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    })
    return out
      .split('\n')
      .filter(Boolean)
      .filter(rel => {
        // Reuse the SKIP_SCAN guards so build/dep paths don't pollute samples
        // even if they're tracked (rare but happens with vendored deps).
        const segments = rel.split('/')
        if (segments.some(seg => SKIP_SCAN.has(seg))) return false
        return isSourceFile(path.basename(rel))
      })
  } catch {
    return collectSourceFilesFs(rootDir, maxDepth)
  }
}

function collectSourceFilesFs(rootDir, maxDepth) {
  const files = []

  function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (SKIP_SCAN.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(path.relative(rootDir, fullPath))
      }
    }
  }

  walk(rootDir, 0)

  // Submodule fallback: SKIP_SCAN excludes `.git` so the walker stops at the
  // top of each submodule. Find submodule paths via `git submodule status` and
  // walk each as its own root, then map results back to rootDir-relative paths.
  // This is the parity fallback for the `git ls-files --recurse-submodules`
  // primary path in `collectSourceFiles` — when git fails (or the ls-files
  // call returns nothing useful), this path is the only way submodule-resident
  // code reaches kb_extract.
  try {
    const out = execFileSync('git', ['submodule', 'status', '--recursive'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 4 * 1024 * 1024
    })
    const submodulePaths = out
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      // Format: " <sha> <path> (<branch-or-tag>)" — strip leading status char
      // and split. Path is the second field.
      .map(line => {
        const m = line.match(/^[\s+\-U]?[0-9a-f]+\s+(\S+)/)
        return m ? m[1] : null
      })
      .filter(Boolean)
    for (const subRel of submodulePaths) {
      const subAbs = path.join(rootDir, subRel)
      // Sub-walk with the same depth budget. Results from this sub-walk are
      // sub-relative; re-relativize them against `rootDir` before pushing.
      const subFiles = collectSourceFilesFs(subAbs, maxDepth)
      for (const f of subFiles) {
        files.push(path.relative(rootDir, path.join(subAbs, f)))
      }
    }
  } catch {
    // No submodules, or git unavailable — both fine.
  }

  return files
}

function listKbSubfolders(kbRootAbs) {
  try {
    return fs.readdirSync(kbRootAbs, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_') && !KB_SKIP.has(e.name))
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
}

function isSourceFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  const sourceExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
    '.py', '.rb', '.go', '.java', '.kt', '.kts',
    '.rs', '.cs', '.swift', '.dart',
    '.php', '.ex', '.exs', '.clj', '.scala'
  ])
  const configFiles = new Set([
    'package.json', 'tsconfig.json', 'go.mod', 'pom.xml',
    'build.gradle', 'build.gradle.kts', 'requirements.txt',
    'pyproject.toml', 'Gemfile', 'Cargo.toml'
  ])
  return sourceExtensions.has(ext) || configFiles.has(filename)
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_extract',
    description: 'Sample existing code or KB files and return a prompt to derive a standards document from observed patterns. Phase 1 (no content): returns prompt + sampled file contents. Phase 2 (content provided): writes the filled standard to disk.',
    inputSchema: {
      type: 'object',
      required: ['source', 'target_id', 'target_group'],
      properties: {
        source: { type: 'string', enum: ['code', 'knowledge'], description: 'What to sample: "code" for source files, "knowledge" for KB docs' },
        target_id: { type: 'string', description: 'ID for the output standards file (kebab-case)' },
        target_group: { type: 'string', enum: ['code', 'contracts', 'knowledge', 'process'], description: 'Standards subfolder to write into' },
        paths: { description: 'Glob patterns to filter source files (source=code), or KB subfolder name (source=knowledge, e.g. "features")', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        app_scope: { type: 'string', description: 'App scope for the generated standard (default: all)' },
        content: { type: 'string', description: '(Phase 2) Filled content to write to disk' }
      }
    }
  }
}
