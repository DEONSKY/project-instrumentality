const fs = require('fs')
const path = require('path')
const { KB_ROOT } = require('./kb-constants')

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
 * Supports ** (any depth, including zero segments), * (single segment), ? (single char).
 *
 * The slash-bounded forms (`**\/`, `/**\/`, `/**`) collapse to zero-or-more
 * segments so `backend/**\/handlers/*.go` matches both `backend/handlers/x.go`
 * (flat layout) and `backend/api/handlers/x.go` (nested). A bare `**` adjacent
 * to non-slash chars (e.g. `**.go`) falls through to `.*` for backwards-compat
 * with non-standard patterns already in the wild.
 */
function globMatch(filePath, pattern) {
  // Stage every glob token behind sentinels before doing any regex emission.
  // Otherwise: step 4 (`**` → `.*`) would inject a `*` that step 5 then
  // (incorrectly) re-rewrites as `[^/]*`, and step 6 (`?` → `[^/]`) would
  // mangle the `?` inside `(?:...)?` groups injected by the slash-bounded forms.
  const regexStr = pattern
    .replace(/^\*\*\//g, '__GS_PFX__')
    .replace(/\/\*\*\//g, '__GS_MID__')
    .replace(/\/\*\*$/g, '__GS_SFX__')
    .replace(/\*\*/g, '__GS_DS__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GS_PFX__/g, '(?:.+/)?')
    .replace(/__GS_MID__/g, '/(?:.+/)?')
    .replace(/__GS_SFX__/g, '(?:/.*)?')
    .replace(/__GS_DS__/g, '.*')
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

/**
 * Score how specific a glob path is. Literal characters count as 1, wildcards
 * (`*`, `?`) count as 0. So `**\/userdefinition\/**` (16 literals incl. slashes)
 * beats `*RequestDto.java` (15 literals): a path-anchored feature pattern
 * outranks a basename-only file-type pattern when both match the same file.
 *
 * Limitation: a deeply-prefixed file-type pattern like
 * `src/main/java/**\/*Repository.java` (26 literals) will still outrank a
 * shorter feature pattern. That's a tradeoff for keeping the heuristic static
 * and free of filesystem I/O — declaration order in `_rules.md` is the
 * tiebreaker for cases the score can't disambiguate.
 */
function globSpecificity(globPath) {
  let n = 0
  for (const ch of globPath) {
    if (ch !== '*' && ch !== '?') n++
  }
  return n
}

/**
 * Pick the single best-matching pattern for a file. Among matching patterns,
 * the one with the most-specific matching path wins (see `globSpecificity`).
 * Declaration order in `_rules.md` breaks ties — preserves backwards-compat
 * behavior for non-overlapping patterns.
 *
 * Returns `null` when no pattern matches.
 */
function pickBestMatch(codeFile, patterns) {
  let best = null
  let bestScore = -1
  for (const pattern of patterns) {
    let patternBest = -1
    for (const p of (pattern.paths || [])) {
      if (!globMatch(codeFile, p)) continue
      const score = globSpecificity(p)
      if (score > patternBest) patternBest = score
    }
    if (patternBest > bestScore) {
      bestScore = patternBest
      best = pattern
    }
  }
  return best
}

/**
 * Resolve a KB target path, replacing {name} with extracted name from code file.
 *
 * `pattern.kb_target` may be either a single string or an array of strings.
 * For arrays, each candidate has `{name}` substituted, then we prefer the first
 * candidate whose resolved path exists under `KB_ROOT`. If no candidate exists,
 * the first one is returned — that becomes the canonical "to-be-scaffolded"
 * target, matching the single-string behavior.
 *
 * Why this exists: depth_policy permits nested feature folders but a single
 * literal `kb_target` template can only target one fixed depth. Lists let
 * authors express aliases (plural vs singular) and depth alternatives
 * (depth-1 literal vs recursive glob form) without engine magic.
 */
function resolveKbTarget(pattern, codeFile) {
  const raw = pattern.kb_target
  const templates = Array.isArray(raw) ? raw : [raw]
  const name = extractName(codeFile, pattern.name_extraction || {})
  const candidates = templates.map(t => t.includes('{name}') ? t.replace('{name}', name) : t)
  for (const c of candidates) {
    // Glob candidates: walk the KB tree and accept the first matching file.
    if (c.includes('*')) {
      const { files } = expandGlob(c, { rootDir: KB_ROOT })
      if (files.length > 0) return files[0]
      continue
    }
    if (fs.existsSync(path.join(KB_ROOT, c))) return c
  }
  // No candidate exists yet: return the first literal (non-glob) entry as the
  // canonical scaffold target. If the author only listed globs, fall back to
  // the first one so callers still get a string.
  const firstLiteral = candidates.find(c => !c.includes('*'))
  return firstLiteral ?? candidates[0]
}

/**
 * Extract a clean name from a file path using name_extraction rules.
 *
 * Supported fields on nameExtraction:
 *   - name_regex: optional RegExp source. If it matches the basename (minus
 *     extension), the capture group named `name` (or group 1) replaces the
 *     name. Use this to strip versioned / timestamped prefixes like
 *     Flyway `V0.0.20260419000000__` or Rails `20260419000000_`. Invalid
 *     regex or non-matching input silently falls through to basename.
 *   - strip_suffix: array of literal suffixes (endsWith-matched, first wins).
 *   - case: 'kebab' converts CamelCase to kebab-case.
 *
 * Order: name_regex → strip_suffix → case. Composable.
 */
function extractName(filePath, nameExtraction) {
  let name = path.basename(filePath, path.extname(filePath))
  if (nameExtraction.name_regex) {
    try {
      const m = name.match(new RegExp(nameExtraction.name_regex))
      if (m) name = m.groups?.name ?? m[1] ?? name
    } catch { /* invalid regex: fall through with unchanged basename */ }
  }
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

/**
 * Compute the directory walk depth required to give the matcher real candidates
 * for a set of globs. If any glob contains `**` the depth is unbounded (Infinity);
 * otherwise it's the deepest literal segment count across the globs, with `floor`
 * as a minimum. Used by source-file walkers (kb_inventory, kb_analyze) to honor
 * the glob's stated reach instead of capping the walk at a fixed default.
 */
function maxGlobDepth(globs, floor = 0) {
  let max = floor
  for (const g of globs) {
    if (g.includes('**')) return Infinity
    const segments = g.split('/').filter(Boolean).length
    if (segments > max) max = segments
  }
  return max
}

module.exports = { globMatch, matchAllPatterns, pickBestMatch, globSpecificity, resolveKbTarget, extractName, expandGlob, maxGlobDepth }
