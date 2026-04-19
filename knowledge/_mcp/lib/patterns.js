const fs = require('fs')
const path = require('path')

// Directories pruned during disk walks. Cheap guards against wandering into
// build output, dependency caches, or test artifacts that would inflate the
// match count without adding useful signal.
const GLOB_SKIP_DIRS = new Set([
  '.git', 'node_modules', 'target', 'build', 'dist', '.gradle',
  'coverage', '.next', '.nuxt', 'out', '.cache', '.venv', 'venv',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox'
])

/**
 * Glob-style pattern matching for file paths.
 * Supports ** (any depth), * (single segment), ? (single char).
 */
function globMatch(filePath, pattern) {
  const regexStr = pattern
    .replace(/\*\*/g, '__DS__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DS__/g, '.*')
    .replace(/\?/g, '[^/]')
  try {
    return new RegExp(`^${regexStr}$`).test(filePath)
  } catch {
    return filePath.includes(pattern.replace(/\*/g, ''))
  }
}

/** Returns ALL matching patterns for a file (many-to-many support) */
function matchAllPatterns(codeFile, patterns) {
  const matches = []
  for (const pattern of patterns) {
    for (const p of (pattern.paths || [])) {
      if (globMatch(codeFile, p)) {
        matches.push(pattern)
        break // don't add same pattern twice if multiple paths within it match
      }
    }
  }
  return matches
}

/** Resolve a KB target path, replacing {name} with extracted name from code file */
function resolveKbTarget(pattern, codeFile) {
  let target = pattern.kb_target
  if (target.includes('{name}')) {
    target = target.replace('{name}', extractName(codeFile, pattern.name_extraction || {}))
  }
  return target
}

/** Extract a clean name from a file path using name_extraction rules */
function extractName(filePath, nameExtraction) {
  let name = path.basename(filePath, path.extname(filePath))
  for (const suffix of (nameExtraction.strip_suffix || [])) {
    if (name.endsWith(suffix)) { name = name.slice(0, -suffix.length); break }
  }
  if (nameExtraction.case === 'kebab') {
    name = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/-+/g, '-')
  }
  return name
}

/**
 * Expand a glob pattern against the local filesystem. Walks from the pattern's
 * literal prefix (the directory path before the first `*` or `**`), skipping
 * standard build/dep/vcs directories. Stops once fileCap+1 matches accumulate
 * so truncation can be detected cheaply.
 *
 * Returned file paths are relative to `rootDir` (default: process.cwd()) —
 * same convention the rest of drift.js uses when comparing to parent-repo
 * paths. Symlinked directories are NOT followed (avoids cycles).
 *
 * @param {string} pattern - glob pattern (e.g. "src/**\/*.js")
 * @param {{ rootDir?: string, fileCap?: number }} opts
 * @returns {{ files: string[], matchedCount: number, truncated: boolean }}
 */
function expandGlob(pattern, opts = {}) {
  const rootDir = opts.rootDir || process.cwd()
  const fileCap = typeof opts.fileCap === 'number' ? opts.fileCap : 25

  // Literal prefix = everything up to the first segment containing * or ?.
  const segments = pattern.split('/')
  const firstWild = segments.findIndex(s => /[*?]/.test(s))
  const prefixSegs = firstWild === -1 ? segments.slice(0, -1) : segments.slice(0, firstWild)
  const prefix = prefixSegs.join('/')
  const startAbs = prefix ? path.join(rootDir, prefix) : rootDir

  // Literal path (no wildcards): existence check only.
  if (firstWild === -1) {
    const rel = pattern
    const abs = path.join(rootDir, rel)
    try {
      const st = fs.statSync(abs)
      if (st.isFile()) return { files: [rel], matchedCount: 1, truncated: false }
    } catch {}
    return { files: [], matchedCount: 0, truncated: false }
  }

  let exists = false
  try { exists = fs.statSync(startAbs).isDirectory() } catch {}
  if (!exists) return { files: [], matchedCount: 0, truncated: false }

  const files = []
  let truncated = false
  const stack = [startAbs]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name)
      const rel = path.relative(rootDir, abs).split(path.sep).join('/')
      if (ent.isDirectory()) {
        if (GLOB_SKIP_DIRS.has(ent.name)) continue
        stack.push(abs)
      } else if (ent.isFile()) {
        if (globMatch(rel, pattern)) {
          files.push(rel)
          if (files.length > fileCap) {
            truncated = true
            files.pop()
            return { files, matchedCount: files.length + 1, truncated }
          }
        }
      }
      // Symlinks: fall through (no follow). ent.isFile()/isDirectory() return
      // false for symlinks unless we stat-follow, which we intentionally don't.
    }
  }
  return { files, matchedCount: files.length, truncated }
}

module.exports = { globMatch, matchAllPatterns, resolveKbTarget, extractName, expandGlob }
