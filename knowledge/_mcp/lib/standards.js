const { globMatch } = require('./patterns')

const VALID_KINDS = new Set(['stack-local', 'contract', 'process', 'knowledge'])
const VALID_SEVERITIES = new Set(['info', 'warn', 'error'])
const VALID_DETECT_KINDS = new Set(['llm', 'regex', 'ast-grep'])
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * Filter graph entries down to those representing standards. Standards entries
 * carry kind/topic/parties/rules in addition to the base graph fields.
 *
 * @param {object} graph - result of loadGraph()
 * @returns {Array<{path: string, id: string, kind: string, app_scope: string|string[], topic?: string, parties?: object, rules: Array}>}
 */
function loadStandardsIndex(graph) {
  const out = []
  const files = (graph && graph.files) || {}
  for (const [filePath, entry] of Object.entries(files)) {
    if (entry.type !== 'standard') continue
    out.push({
      path: filePath,
      id: entry.id,
      kind: entry.kind || 'stack-local',
      app_scope: entry.app_scope || 'all',
      topic: entry.topic || null,
      parties: entry.parties || null,
      rules: Array.isArray(entry.rules) ? entry.rules : [],
      tags: entry.tags || []
    })
  }
  return out
}

/**
 * Match a single rule against a file. Returns the match strength so callers
 * can rank: 3 = exact path match, 2 = glob match, 1 = contract-party match, 0 = no match.
 */
function ruleMatchesPath(rule, filePath) {
  const paths = (rule.applies_to && rule.applies_to.paths) || []
  for (const p of paths) {
    if (p === filePath) return 3
    if (globMatch(filePath, p)) return 2
  }
  return 0
}

function partyMatchesPath(party, filePath) {
  const paths = (party.applies_to && party.applies_to.paths) || []
  for (const p of paths) {
    if (p === filePath) return 3
    if (globMatch(filePath, p)) return 2
  }
  return 0
}

function appScopeMatches(scope, appScope) {
  // When inference returns null (no app_root_patterns configured + no explicit
  // app_scope passed), only universally-scoped standards match. This is the
  // conservative default — without app context, surface only rules that apply
  // everywhere. Caller can override by passing app_scope explicitly.
  if (!appScope) return scope === 'all' || (Array.isArray(scope) && scope.includes('all'))
  if (scope === 'all' || scope === appScope) return true
  if (Array.isArray(scope)) return scope.includes(appScope) || scope.includes('all')
  return false
}

const SEVERITY_RANK = { error: 3, warn: 2, info: 1 }

/**
 * Find rules applicable to a file, ranked by match strength then severity.
 *
 * Ranking key (higher first):
 *   1. exact-path-match > glob-match > contract-party-match
 *   2. severity error > warn > info
 *
 * @param {Array} index - from loadStandardsIndex
 * @param {string} filePath - project-relative path being edited
 * @param {string|null} appScope - resolved app for the file (or null)
 * @param {{cap?: number}} opts
 * @returns {Array<{standard, rule, party?, matchStrength}>}
 */
function findStandardsForPath(index, filePath, appScope, opts = {}) {
  const cap = typeof opts.cap === 'number' ? opts.cap : 10
  const candidates = []

  for (const std of index) {
    if (!appScopeMatches(std.app_scope, appScope)) continue

    if (std.kind === 'contract') {
      // For contracts, each party scopes its own files. Match the file against
      // every party; for matching parties, every rule applies (subject to
      // optional rule-level applies_to intersect).
      for (const [partyName, party] of Object.entries(std.parties || {})) {
        if (!appScopeMatches(party.app_scope, appScope)) continue
        const partyStrength = partyMatchesPath(party, filePath)
        if (partyStrength === 0) continue

        for (const rule of std.rules) {
          // Optional rule-level applies_to acts as an intersect filter
          if (rule.applies_to && Array.isArray(rule.applies_to.paths) && rule.applies_to.paths.length > 0) {
            if (ruleMatchesPath(rule, filePath) === 0) continue
          }
          candidates.push({
            standard: std,
            rule,
            party: partyName,
            matchStrength: 1, // contract-party matches rank below stack-local rules
            severityRank: SEVERITY_RANK[rule.severity] || 0
          })
        }
      }
    } else {
      for (const rule of std.rules) {
        const m = ruleMatchesPath(rule, filePath)
        if (m === 0) continue
        candidates.push({
          standard: std,
          rule,
          party: null,
          matchStrength: m,
          severityRank: SEVERITY_RANK[rule.severity] || 0
        })
      }
    }
  }

  // Sort: matchStrength desc, severityRank desc
  candidates.sort((a, b) => {
    if (b.matchStrength !== a.matchStrength) return b.matchStrength - a.matchStrength
    return b.severityRank - a.severityRank
  })

  return candidates.slice(0, cap)
}

/**
 * Resolve which app_scope a file belongs to via app_root_patterns from _rules.md.
 * Returns null silently if app_root_patterns is unset or no pattern matches —
 * caller falls back to "no inference" (only app_scope: all standards match).
 */
function inferAppScope(filePath, rules) {
  if (!rules) return null
  const raw = typeof rules.getRaw === 'function' ? rules.getRaw() : rules
  const patterns = raw && raw.app_root_patterns
  if (!patterns || typeof patterns !== 'object') return null
  for (const [globPattern, appScope] of Object.entries(patterns)) {
    if (globMatch(filePath, globPattern)) return appScope
  }
  return null
}

/**
 * Look up a rule by composite key. Returns null if standard or rule not found.
 */
function getRule(index, standardId, ruleId) {
  for (const std of index) {
    if (std.id !== standardId) continue
    for (const rule of std.rules) {
      if (rule.id === ruleId) return { standard: std, rule }
    }
    return null
  }
  return null
}

/**
 * Validate a single rule object. Returns { valid, errors[] }. Used by lint and
 * by reindex (best-effort warn rather than block on bad rules).
 *
 * @param {object} rule
 * @param {{kind?: string}} ctx - parent standard's kind (affects requirement of applies_to.paths)
 */
function validateRule(rule, ctx = {}) {
  const errors = []
  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['rule is not an object'] }
  }
  if (!rule.id || typeof rule.id !== 'string') errors.push('missing rule.id')
  else if (!SLUG_RE.test(rule.id)) errors.push(`rule.id "${rule.id}" is not a kebab-case slug`)
  if (!rule.title || typeof rule.title !== 'string') errors.push('missing rule.title')
  if (!rule.severity) errors.push('missing rule.severity')
  else if (!VALID_SEVERITIES.has(rule.severity)) errors.push(`rule.severity "${rule.severity}" not in info|warn|error`)
  if (!rule.description || typeof rule.description !== 'string') errors.push('missing rule.description')

  if (rule.detect) {
    if (!rule.detect.kind) errors.push('rule.detect.kind missing')
    else if (!VALID_DETECT_KINDS.has(rule.detect.kind)) errors.push(`rule.detect.kind "${rule.detect.kind}" not in llm|regex|ast-grep`)
    if (rule.detect.pre_filter !== undefined) {
      if (typeof rule.detect.pre_filter !== 'string' || !rule.detect.pre_filter) {
        errors.push('rule.detect.pre_filter must be a non-empty regex string')
      } else {
        try { new RegExp(rule.detect.pre_filter) } catch (e) {
          errors.push(`rule.detect.pre_filter is not a valid regex: ${e.message}`)
        }
      }
      if (rule.detect.kind && rule.detect.kind !== 'llm') {
        errors.push(`rule.detect.pre_filter only valid when detect.kind is "llm" (got "${rule.detect.kind}")`)
      }
    }
  }

  // For stack-local kind, applies_to.paths is required (and must be string globs)
  if (ctx.kind && ctx.kind !== 'contract') {
    if (!rule.applies_to || !Array.isArray(rule.applies_to.paths) || rule.applies_to.paths.length === 0) {
      errors.push(`stack-local/process/knowledge rule.applies_to.paths required and non-empty`)
    }
  }
  if (rule.applies_to && Array.isArray(rule.applies_to.paths)) {
    for (const p of rule.applies_to.paths) {
      if (typeof p !== 'string') {
        errors.push('applies_to.paths must be string globs')
        break
      }
    }
  }
  if (Array.isArray(rule.exceptions)) {
    rule.exceptions.forEach((ex, i) => {
      if (!ex || typeof ex !== 'object') {
        errors.push(`exceptions[${i}] must be an object`)
        return
      }
      if (!Array.isArray(ex.paths) || ex.paths.length === 0) errors.push(`exceptions[${i}].paths must be non-empty array`)
      if (!ex.reason || typeof ex.reason !== 'string') errors.push(`exceptions[${i}].reason required`)
    })
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validate a whole standard's frontmatter. Returns flat errors[] with rule-id
 * prefixes so lint can surface specific failures without re-walking.
 */
function validateStandard(data) {
  const errors = []
  if (!data) return { valid: false, errors: ['empty frontmatter'] }
  if (!data.id || !SLUG_RE.test(data.id)) errors.push('standard.id missing or not a kebab-case slug')
  if (!data.kind) errors.push('standard.kind missing')
  else if (!VALID_KINDS.has(data.kind)) errors.push(`standard.kind "${data.kind}" not in stack-local|contract|process|knowledge`)

  // app_scope shape vs kind
  if (data.kind === 'contract') {
    if (!Array.isArray(data.app_scope)) errors.push('contract standards require app_scope as an array')
    if (!data.parties || typeof data.parties !== 'object') {
      errors.push('contract standards require parties object')
    } else {
      const partyNames = Object.keys(data.parties)
      if (partyNames.length === 0) errors.push('contract standards require at least one party')
      const allScopes = []
      for (const [name, party] of Object.entries(data.parties)) {
        if (!party || typeof party !== 'object') {
          errors.push(`parties.${name} must be an object`)
          continue
        }
        if (!party.app_scope || (Array.isArray(party.app_scope) && party.app_scope.length === 0)) {
          errors.push(`parties.${name}.app_scope required and non-empty`)
        }
        if (!party.applies_to || !Array.isArray(party.applies_to.paths) || party.applies_to.paths.length === 0) {
          errors.push(`parties.${name}.applies_to.paths required and non-empty`)
        }
        if (!party.detect || !party.detect.kind) errors.push(`parties.${name}.detect.kind required`)
        else if (!VALID_DETECT_KINDS.has(party.detect.kind)) errors.push(`parties.${name}.detect.kind "${party.detect.kind}" not in llm|regex|ast-grep`)

        const scopeArr = Array.isArray(party.app_scope) ? party.app_scope : [party.app_scope]
        allScopes.push({ name, scopes: scopeArr })
      }
      // Detect overlapping party app_scopes
      for (let i = 0; i < allScopes.length; i++) {
        for (let j = i + 1; j < allScopes.length; j++) {
          const overlap = allScopes[i].scopes.filter(s => allScopes[j].scopes.includes(s))
          if (overlap.length > 0) {
            errors.push(`parties.${allScopes[i].name} and parties.${allScopes[j].name} have overlapping app_scope: ${overlap.join(', ')}`)
          }
        }
      }
    }
  }

  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    errors.push('standard.rules must be a non-empty array')
  } else {
    const seenIds = new Set()
    data.rules.forEach((rule, idx) => {
      const r = validateRule(rule, { kind: data.kind })
      if (!r.valid) {
        for (const e of r.errors) errors.push(`rules[${idx}]${rule && rule.id ? ` (${rule.id})` : ''}: ${e}`)
      }
      if (rule && rule.id) {
        if (seenIds.has(rule.id)) errors.push(`rules[${idx}]: duplicate rule id "${rule.id}"`)
        seenIds.add(rule.id)
      }
    })
  }
  return { valid: errors.length === 0, errors }
}

module.exports = {
  loadStandardsIndex,
  findStandardsForPath,
  inferAppScope,
  getRule,
  validateRule,
  validateStandard,
  VALID_KINDS,
  VALID_SEVERITIES,
  VALID_DETECT_KINDS
}
