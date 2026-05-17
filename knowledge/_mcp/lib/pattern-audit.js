const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { globMatch, matchAllPatterns, resolveKbTarget } = require('./patterns')
const { canonicalize } = require('./promotion-ledger')

// Intent → expected folder convention. Hardcoded from the bundled presets.
// Every finding emitted by auditPatterns carries a `source:` field so callers
// can tell preset opinion (`source: 'preset'`, used by convention_violation)
// apart from project-declared rules (`source: '_rules.md'`, used by everything
// derived from this project's _rules.md patterns + knowledge/ tree).
// Patterns without `intent` skip the convention check. Folders are
// prefix-matched, so kb_target "features/auth.md" satisfies expected_folder
// "features/".
const INTENT_FOLDER_CONVENTIONS = {
  form: 'features/',
  'api-contract': 'features/',
  feature: 'features/',
  'service-logic': 'flows/',
  'route-guard': 'flows/',
  flow: 'flows/',
  'data-model': 'data/schema/',
  schema: 'data/schema/',
  validation: 'validation/',
  validator: 'validation/',
  component: 'components/',
  integration: 'integrations/',
  dependency: 'standards/code/',
  config: 'standards/code/',
}

// Directories pruned during source walks. Mirrors analyze.js / inventory.js
// so all three tools see the same project shape.
const SKIP_SCAN = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  'knowledge', '.cursor', '.vscode', '.idea', '__pycache__', '.mypy_cache',
  'vendor', 'target', '.gradle', 'bin', 'obj',
])

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.kt', '.kts',
  '.rs', '.cs', '.swift', '.dart',
  '.php', '.ex', '.exs', '.clj', '.scala',
])

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'go.mod', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'requirements.txt',
  'pyproject.toml', 'Gemfile', 'Cargo.toml',
])

function isSourceFile(filename) {
  return SOURCE_EXTENSIONS.has(path.extname(filename).toLowerCase()) || CONFIG_FILES.has(filename)
}

function collectSourceFiles(rootDir, maxDepth = 6) {
  const files = []
  function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      if (ent.name.startsWith('.') && ent.name !== '.') continue
      if (SKIP_SCAN.has(ent.name)) continue
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full, depth + 1)
      else if (ent.isFile() && isSourceFile(ent.name)) {
        files.push(path.relative(rootDir, full).split(path.sep).join('/'))
      }
    }
  }
  walk(rootDir, 0)
  return files
}

function collectKbContentFiles(kbRoot) {
  const files = []
  function walk(dir, rel) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      if (ent.name.startsWith('_') || ent.name === 'sync' || ent.name === 'exports' || ent.name === 'assets') continue
      const full = path.join(dir, ent.name)
      const next = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(full, next)
      else if (ent.isFile() && ent.name.endsWith('.md')) files.push(next)
    }
  }
  walk(kbRoot, '')
  return files
}

// Read .gitmodules and return the list of submodule paths. Used to mark
// orphan_pattern findings as submodule-vs-main-repo for clearer messaging.
function collectSubmodulePaths(cwd) {
  const p = path.join(cwd, '.gitmodules')
  if (!fs.existsSync(p)) return []
  const content = fs.readFileSync(p, 'utf8')
  const paths = []
  for (const m of content.matchAll(/path\s*=\s*(.+)/g)) paths.push(m[1].trim())
  return paths
}

function isSubmodulePattern(pattern, submodulePaths) {
  if (submodulePaths.length === 0) return false
  for (const p of (pattern.paths || [])) {
    for (const sub of submodulePaths) {
      if (p.startsWith(sub + '/') || p === sub) return true
    }
  }
  return false
}

// ── validation ──────────────────────────────────────────────────────────────

const VALID_CASE = new Set(['kebab', 'camel', 'pascal', 'snake'])

/**
 * Mirrors validateRule in standards.js. Returns { valid, errors } so callers
 * can warn without throwing — loading must still succeed for malformed entries.
 */
function validateCodePathPattern(p) {
  const errors = []
  if (!p || typeof p !== 'object') return { valid: false, errors: ['pattern is not an object'] }
  if (!p.kb_target || typeof p.kb_target !== 'string') errors.push('missing kb_target')
  if (!Array.isArray(p.paths) || p.paths.length === 0) errors.push('paths required and non-empty')
  else for (const g of p.paths) {
    if (typeof g !== 'string') { errors.push('paths must be string globs'); break }
  }
  if (p.intent !== undefined && typeof p.intent !== 'string') errors.push('intent must be a string')
  if (p.name_extraction) {
    if (p.name_extraction.strip_suffix !== undefined && !Array.isArray(p.name_extraction.strip_suffix)) {
      errors.push('name_extraction.strip_suffix must be an array of strings')
    } else if (Array.isArray(p.name_extraction.strip_suffix)) {
      for (const s of p.name_extraction.strip_suffix) {
        if (typeof s !== 'string') { errors.push('name_extraction.strip_suffix entries must be strings'); break }
      }
    }
    if (p.name_extraction.case !== undefined && !VALID_CASE.has(p.name_extraction.case)) {
      errors.push(`name_extraction.case "${p.name_extraction.case}" not in kebab|camel|pascal|snake`)
    }
  }
  return { valid: errors.length === 0, errors }
}

// ── audit ───────────────────────────────────────────────────────────────────

/**
 * Mechanical pattern audit. Pure function over rules + filesystem state.
 *
 * @param {object} opts
 * @param {Array} opts.patterns       - code_path_patterns from _rules.md
 * @param {Array<string>} opts.sourceFiles - repo-relative source file paths
 * @param {Array<string>} opts.kbFiles     - kb-root-relative KB content paths (no "knowledge/" prefix)
 * @param {Array<string>} opts.submodulePaths - paths from .gitmodules
 * @returns {{ findings: Array }}
 */
function auditPatterns({ patterns = [], sourceFiles = [], kbFiles = [], submodulePaths = [] } = {}) {
  const findings = []
  const kbFileSet = new Set(kbFiles)

  // 1. Orphan patterns: paths globs match zero source files.
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    const matched = sourceFiles.some(f => (p.paths || []).some(g => globMatch(f, g)))
    if (!matched) {
      findings.push({
        type: 'orphan_pattern',
        pattern_index: i,
        intent: p.intent,
        kb_target: p.kb_target,
        paths: p.paths || [],
        is_submodule_pattern: isSubmodulePattern(p, submodulePaths),
        source: '_rules.md',
      })
    }
  }

  // 2. Ghost targets: hardcoded kb_target (no {name}) points at a file that
  //    doesn't exist. Template targets are draft opportunities, not ghosts.
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    if (!p.kb_target || p.kb_target.includes('{name}')) continue
    if (!kbFileSet.has(p.kb_target)) {
      findings.push({
        type: 'ghost_target',
        pattern_index: i,
        resolved_target: p.kb_target,
        reason: 'kb_file_missing',
        source: '_rules.md',
      })
    }
  }

  // 3. Multi-target files: one source file matches 2+ patterns producing 2+
  //    distinct kb_targets. With P0's fan-out this is no longer lossy (all
  //    targets get drift entries) — surfaced so users can narrow patterns if
  //    the fan-out is unintentional.
  for (const f of sourceFiles) {
    const matched = matchAllPatterns(f, patterns)
    if (matched.length < 2) continue
    const targets = []
    const seen = new Set()
    for (const m of matched) {
      const t = resolveKbTarget(m, f)
      if (seen.has(t)) continue
      seen.add(t)
      targets.push({ pattern_index: patterns.indexOf(m), kb_target: t })
    }
    if (targets.length >= 2) {
      findings.push({ type: 'multi_target_files', file: f, matched_targets: targets, source: '_rules.md' })
    }
  }

  // 4. Convention violations: intent → folder mismatch.
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    if (!p.intent || !p.kb_target) continue
    const expected = INTENT_FOLDER_CONVENTIONS[p.intent]
    if (!expected) continue
    if (!p.kb_target.startsWith(expected)) {
      findings.push({
        type: 'convention_violation',
        pattern_index: i,
        intent: p.intent,
        kb_target: p.kb_target,
        expected_folder: expected,
        source: 'preset',
      })
    }
  }

  // 5. Unmapped KB groups: KB files that no pattern targets, aggregated by
  //    folder. One finding per folder, with count + 3-5 samples.
  const unmappedByFolder = new Map()
  for (const kb of kbFiles) {
    const targeted = patterns.some(p => {
      const tgt = p.kb_target || ''
      if (tgt.includes('{name}')) {
        // Template target — does this kb file fit the pattern shape?
        // e.g. "features/{name}.md" matches "features/auth.md" but not "components/x.md".
        const re = new RegExp('^' + tgt.replace(/\./g, '\\.').replace(/\{name\}/g, '[^/]+') + '$')
        return re.test(kb)
      }
      return tgt === kb
    })
    if (!targeted) {
      const folder = kb.split('/')[0] + '/'
      if (!unmappedByFolder.has(folder)) unmappedByFolder.set(folder, [])
      unmappedByFolder.get(folder).push(kb)
    }
  }
  for (const [folder, files] of unmappedByFolder) {
    findings.push({
      type: 'unmapped_kb_group',
      folder,
      count: files.length,
      sample_files: files.slice(0, 5),
      source: '_rules.md',
    })
  }

  // 6. Fan-out with hardcoded target: a pattern with no {name} template that
  //    catches files of many distinct names — likely overbroad, since one
  //    KB file is supposed to document one concept.
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    if (!p.kb_target || p.kb_target.includes('{name}')) continue
    const matched = sourceFiles.filter(f => (p.paths || []).some(g => globMatch(f, g)))
    if (matched.length <= 3) continue  // few files = probably right
    // distinct basename (sans ext) count as a proxy for "distinct concepts"
    const concepts = new Set(matched.map(f => path.basename(f, path.extname(f))))
    if (concepts.size >= 5) {
      findings.push({
        type: 'fanout_with_hardcoded',
        pattern_index: i,
        kb_target: p.kb_target,
        distinct_concepts: concepts.size,
        source: '_rules.md',
      })
    }
  }

  return { findings }
}

/**
 * Scaffold-time check. Given a newly-created KB file's path (relative to
 * knowledge/), return whether any pattern targets it and, if not, a suggested
 * pattern shape the agent can edit into _rules.md.
 */
function checkSingleKbFile(kbRelPath, patterns) {
  const targeted = patterns.some(p => {
    const tgt = p.kb_target || ''
    if (tgt.includes('{name}')) {
      const re = new RegExp('^' + tgt.replace(/\./g, '\\.').replace(/\{name\}/g, '[^/]+') + '$')
      return re.test(kbRelPath)
    }
    return tgt === kbRelPath
  })
  if (targeted) return { unmapped: false }

  const folder = kbRelPath.split('/')[0]
  // Reverse the convention table: folder → most-natural intent (first match).
  let suggestedIntent = null
  for (const [intent, expectedFolder] of Object.entries(INTENT_FOLDER_CONVENTIONS)) {
    if (expectedFolder === folder + '/') { suggestedIntent = intent; break }
  }

  // Suggest a template target so the same pattern covers future siblings.
  const suggestedTarget = `${folder}/{name}.md`

  return {
    unmapped: true,
    suggested_pattern: {
      intent: suggestedIntent,
      kb_target: suggestedTarget,
      paths: [],
    },
  }
}

// ── Pattern fingerprinting (P3) ─────────────────────────────────────────────

/**
 * Stable hash of a code_path_patterns entry. Mirrors computeRuleFingerprint
 * in promotion-ledger.js — reuses the same canonicalize helper so cosmetic
 * edits (path reorder, dup elimination, YAML key reorder) don't churn the
 * fingerprint. Semantic edits (changing the kb_target, changing globs)
 * invalidate it.
 *
 * Returns "sha256:<16-hex>" — same shape as ruleFingerprint so the audit-log
 * formatting stays uniform.
 */
function computePatternFingerprint(pattern) {
  // Sort and dedup paths before canonicalize — `canonicalize` only sorts object
  // keys (array order is semantically meaningful in standards detect lists, so
  // we can't rely on it for paths). Same trick for strip_suffix.
  const ne = pattern.name_extraction
  const parts = canonicalize({
    intent: pattern.intent || null,
    kb_target: pattern.kb_target,
    paths: [...new Set(pattern.paths || [])].sort(),
    name_extraction: ne
      ? {
          strip_suffix: [...(ne.strip_suffix || [])].sort(),
          case: ne.case || null,
          name_regex: ne.name_regex || null,
        }
      : null,
  })
  const canonical = JSON.stringify(parts)
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/**
 * Resolve which pattern would produce the given queue-entry kb_target.
 * Returns null when no pattern matches — the caller treats that as
 * "pattern removed".
 *
 * For template patterns (kb_target contains `{name}`), this builds a regex
 * from the template and tests whether the queue key fits the shape.
 */
function findPatternForKbTarget(queueKbTarget, patterns) {
  for (const p of patterns) {
    const tgt = p.kb_target || ''
    if (tgt.includes('{name}')) {
      const re = new RegExp('^' + tgt.replace(/\./g, '\\.').replace(/\{name\}/g, '[^/]+') + '$')
      if (re.test(queueKbTarget)) return p
    } else if (tgt === queueKbTarget) {
      return p
    }
  }
  return null
}

module.exports = {
  auditPatterns,
  validateCodePathPattern,
  checkSingleKbFile,
  collectSourceFiles,
  collectKbContentFiles,
  collectSubmodulePaths,
  computePatternFingerprint,
  findPatternForKbTarget,
  INTENT_FOLDER_CONVENTIONS,
}
