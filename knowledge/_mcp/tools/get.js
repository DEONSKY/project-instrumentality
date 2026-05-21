const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { loadGraph, getAlwaysLoad, getByScope } = require('../lib/graph')
const { estimateTokens, totalTokens } = require('../lib/budget')
const { loadRules } = require('../lib/rules')
const { loadStandardsIndex, findStandardsForPath, inferAppScope } = require('../lib/standards')
const { inferType } = require('../lib/types')

const KB_ROOT = 'knowledge'
const DEFAULT_MAX_TOKENS = 8000
const DESCRIPTION_CHAR_CAP = 300

async function runTool({ task_type, keywords, app_scope, scope, max_tokens, type, task_context, working_paths } = {}) {
  const graph = loadGraph(KB_ROOT)
  const rules = loadRules(KB_ROOT)
  const raw = rules.getRaw()
  const tokenBudget = max_tokens || (raw.token_budget) || DEFAULT_MAX_TOKENS

  // Always load foundation files first
  const alwaysLoadEntries = getAlwaysLoad(graph)
  const alwaysLoadFiles = alwaysLoadEntries
    .map(entry => loadFile(entry.path))
    .filter(Boolean)

  // Export mode: load all files in scope
  if (task_type === 'export' || scope) {
    return handleExportScope(graph, scope, app_scope, alwaysLoadFiles, type)
  }

  // Standard mode: keyword-based traversal with optional task context
  let candidates = findCandidates(graph, keywords, app_scope, task_context)
  candidates = applySchemaFiltering(candidates, keywords)

  // For reviewing context, also load drift targets as high-priority candidates
  if (task_context === 'reviewing') {
    const driftTargets = loadDriftTargets()
    for (const target of driftTargets) {
      if (!candidates.some(c => c.path && c.path.includes(target))) {
        const file = loadFile(target)
        if (file) candidates.unshift(file)
      }
    }
  }

  const selectedFiles = selectWithinBudget(alwaysLoadFiles, candidates, tokenBudget)

  const result = { files: selectedFiles }

  // Working-paths injection: surface relevant standard rules as a separate
  // field so the agent can treat them as constraints on the change. Token
  // discipline lives here — full why/examples/exceptions are NOT included;
  // descriptions are trimmed; the cap from _rules.md bounds the result.
  if (Array.isArray(working_paths) && working_paths.length > 0) {
    result.rules_in_scope = buildRulesInScope(graph, rules, working_paths, app_scope)
  }

  return result
}

/**
 * Build the rules_in_scope field. Walks each working_path through the
 * standards index, dedupes by (standard_id, rule_id), ranks by match strength
 * × severity, caps at working_paths_cap, and folds in any open backlog entries
 * for those paths as advisory items (Stage 5 hook).
 *
 * Token shape: only frontmatter fields the agent needs at write-time —
 * description trimmed to first paragraph or 300 chars (whichever shorter).
 * Full why/examples/exceptions live in the standard file.
 */
function buildRulesInScope(graph, rules, workingPaths, explicitAppScope) {
  const index = loadStandardsIndex(graph)
  const cap = rules.getWorkingPathsCap ? rules.getWorkingPathsCap() : 10
  const seen = new Map() // composite key → entry (so dedupe survives multiple working_paths)

  for (const wp of workingPaths) {
    const appScope = explicitAppScope || inferAppScope(wp, rules)
    const matches = findStandardsForPath(index, wp, appScope, { cap: Infinity })
    for (const m of matches) {
      const key = `${m.standard.id}.${m.rule.id}`
      if (seen.has(key)) {
        // Keep the higher-strength match (already sorted by findStandardsForPath
        // per-path, but cross-path dedupe needs a check)
        const existing = seen.get(key)
        if (m.matchStrength > existing._matchStrength) {
          seen.set(key, buildRuleEntry(m, false))
        }
        continue
      }
      seen.set(key, buildRuleEntry(m, false))
    }
  }

  // Backlog surfacing — Stage 5 hook. Open aspirational entries whose files
  // overlap with working_paths get added as advisory items. The dev sees them
  // alongside the active rules so they can fix opportunistically while editing
  // the file anyway.
  const backlog = readBacklogEntries()
  for (const entry of backlog) {
    if (!entryTouchesAnyPath(entry, workingPaths)) continue
    const key = entry.queueKey
    if (seen.has(key)) {
      // Already surfaced as an active rule; mark advisory if not already fail-open
      // (active rule wins — advisory only fills gaps)
      continue
    }
    const advisory = buildAdvisoryFromBacklogEntry(entry, index)
    if (advisory) seen.set(key, advisory)
  }

  // Convert map to array, drop the internal _matchStrength helper field,
  // and apply the cap. Sorted within findStandardsForPath; here we re-sort
  // because cross-path dedupe and advisory entries may shuffle order.
  const all = [...seen.values()]
  all.sort((a, b) => {
    if (a.advisory !== b.advisory) return a.advisory ? 1 : -1 // active first
    return (b._matchStrength || 0) - (a._matchStrength || 0) ||
           (severityRank(b.severity) - severityRank(a.severity))
  })
  return all.slice(0, cap).map(({ _matchStrength, ...rest }) => rest)
}

function buildRuleEntry(match, advisory) {
  const r = match.rule
  return {
    standard_id: match.standard.id,
    rule_id: r.id,
    severity: r.severity || 'warn',
    applies_to: r.applies_to || {},
    detect_hint: (r.detect && r.detect.hint) || '',
    fix_hint: r.fix_hint || '',
    description: trimDescription(r.description || ''),
    advisory: !!advisory,
    _matchStrength: match.matchStrength
  }
}

function buildAdvisoryFromBacklogEntry(entry, index) {
  const stdEntry = index.find(s => s.id === entry.standardId)
  if (!stdEntry) return null
  const rule = stdEntry.rules.find(r => r.id === entry.ruleId)
  if (!rule) return null
  return {
    standard_id: entry.standardId,
    rule_id: entry.ruleId,
    severity: entry.severity || rule.severity || 'warn',
    applies_to: rule.applies_to || {},
    detect_hint: (rule.detect && rule.detect.hint) || '',
    fix_hint: rule.fix_hint || '',
    description: trimDescription(rule.description || ''),
    advisory: true,
    _matchStrength: 0
  }
}

function trimDescription(desc) {
  if (!desc) return ''
  const firstPara = desc.split(/\n\s*\n/)[0].trim()
  if (firstPara.length > DESCRIPTION_CHAR_CAP) {
    return firstPara.slice(0, DESCRIPTION_CHAR_CAP) + '…'
  }
  if (firstPara.length < desc.trim().length) return firstPara + '…'
  return firstPara
}

const SEVERITY_RANK = { error: 3, warn: 2, info: 1 }
function severityRank(s) { return SEVERITY_RANK[s] || 0 }

/**
 * Read open backlog entries from sync/standards-backlog.md. Lightweight
 * regex-based parse — same shape conform.js writes. Returns [] silently if
 * the file is missing or malformed.
 */
function readBacklogEntries() {
  const backlogPath = path.join(KB_ROOT, 'sync/standards-backlog.md')
  if (!fs.existsSync(backlogPath)) return []
  try {
    const content = fs.readFileSync(backlogPath, 'utf8')
    const headerEnd = content.indexOf('\n## ')
    if (headerEnd === -1) return []
    const body = content.slice(headerEnd + 1)
    const blocks = body.split(/\n(?=## )/).filter(b => b.trim())
    const entries = []
    for (const block of blocks) {
      const headingMatch = block.match(/^## (.+)/)
      if (!headingMatch) continue
      const queueKey = headingMatch[1].trim()
      const stdMatch = block.match(/\*\*Standard:\*\*\s*`([^`]+)`/)
      const ruleMatch = block.match(/\*\*Rule:\*\*\s*`([^`]+)`\s*—\s*(\w+)/)
      const filePaths = []
      for (const line of block.split('\n')) {
        const m = line.match(/^\s+-\s+`([^`]+)`\s+—\s+since/)
        if (m) filePaths.push(m[1])
      }
      entries.push({
        queueKey,
        standardId: stdMatch ? stdMatch[1] : null,
        ruleId: ruleMatch ? ruleMatch[1] : null,
        severity: ruleMatch ? ruleMatch[2] : null,
        filePaths
      })
    }
    return entries
  } catch { return [] }
}

function entryTouchesAnyPath(entry, workingPaths) {
  for (const wp of workingPaths) {
    if (entry.filePaths.some(fp => fp === wp)) return true
  }
  return false
}

function handleExportScope(graph, scope, appScopeFilter, alwaysLoadFiles, typeFilter) {
  const scopes = Array.isArray(scope) ? scope : [scope || 'all']
  const allEntries = new Map()

  for (const s of scopes) {
    if (!s || s === 'all') {
      const entries = getByScope(graph, appScopeFilter)
      for (const [fp, entry] of entries) {
        allEntries.set(fp, entry)
      }
    } else {
      for (const [fp, entry] of Object.entries(graph.files || {})) {
        const matchesDomain = fp.includes(s)
        const matchesId = entry.id === s
        const matchesGroup = entry.group && entry.group.includes(s)
        if (matchesDomain || matchesId || matchesGroup) {
          allEntries.set(fp, entry)
        }
      }
    }
  }

  // Apply app_scope filter for non-"all" scopes
  if (appScopeFilter) {
    for (const [fp, entry] of allEntries) {
      const entryScope = entry.app_scope
      if (entryScope !== 'all' && entryScope !== appScopeFilter) {
        if (!Array.isArray(entryScope) || (!entryScope.includes(appScopeFilter) && !entryScope.includes('all'))) {
          allEntries.delete(fp)
        }
      }
    }
  }

  // Apply type filter
  if (typeFilter) {
    for (const [fp, entry] of allEntries) {
      const fileType = entry.type || inferType(path.join(KB_ROOT, fp))
      if (fileType !== typeFilter) {
        allEntries.delete(fp)
      }
    }
  }

  const files = [...allEntries.keys()]
    .map(fp => loadFile(fp))
    .filter(Boolean)

  // When type filter is active, also filter always_load files by type
  const filteredAlwaysLoad = typeFilter
    ? alwaysLoadFiles.filter(f => {
        const fileType = f.type || inferType(path.join(KB_ROOT, f.path))
        return fileType === typeFilter
      })
    : alwaysLoadFiles

  const all = [...filteredAlwaysLoad, ...files.filter(f =>
    !filteredAlwaysLoad.some(a => a.path === f.path)
  )]

  return { files: all }
}

function findCandidates(graph, keywords, appScopeFilter, taskContext) {
  if (!keywords) return []

  const keywordList = Array.isArray(keywords) ? keywords : [keywords]
  const typeHints = taskContext ? inferTypeHints(keywordList) : []
  const scored = []

  Object.entries(graph.files || {}).forEach(([fp, entry]) => {
    // Scope filter
    if (appScopeFilter) {
      const scope = entry.app_scope
      if (scope !== 'all' && scope !== appScopeFilter) {
        if (!Array.isArray(scope) || (!scope.includes(appScopeFilter) && !scope.includes('all'))) {
          return
        }
      }
    }

    // Score by keyword match
    const searchText = [
      fp,
      entry.id || '',
      entry.type || '',
      (entry.tags || []).join(' '),
      (entry.depends_on || []).join(' ')
    ].join(' ').toLowerCase()

    let score = keywordList.reduce((s, kw) => {
      return s + (searchText.includes(kw.toLowerCase()) ? 1 : 0)
    }, 0)

    // Task context scoring boost
    if (score > 0 && taskContext === 'creating') {
      for (const hint of typeHints) {
        if (fp.includes(`/${hint}/`)) { score += 0.5; break }
      }
      if (fp.includes('/standards/knowledge/')) score += 0.5
    }
    if (score > 0 && taskContext === 'fixing') {
      if (fp.includes('/standards/code/')) score += 0.3
    }
    if (score > 0 && taskContext === 'reviewing') {
      if (fp.includes('/validation/') || fp.includes('/flows/')) score += 0.3
    }

    if (score > 0) {
      scored.push({ path: fp, entry, score })
    }
  })

  // Sort by score desc, then by tokens_est asc (prefer smaller files)
  scored.sort((a, b) => b.score - a.score || (a.entry.tokens_est || 0) - (b.entry.tokens_est || 0))

  return scored.map(s => loadFile(s.path)).filter(Boolean)
}

function selectWithinBudget(alwaysLoad, candidates, maxTokens) {
  const selected = [...alwaysLoad]
  let usedTokens = totalTokens(alwaysLoad)

  for (const candidate of candidates) {
    if (selected.some(f => f.path === candidate.path)) continue
    const fileTokens = estimateTokens(candidate.content)
    if (usedTokens + fileTokens <= maxTokens) {
      selected.push(candidate)
      usedTokens += fileTokens
    }
  }

  return selected
}

function loadFile(filePath) {
  const fullPath = filePath.startsWith('knowledge/') ? filePath : path.join(KB_ROOT, filePath)
  if (!fs.existsSync(fullPath)) return null

  try {
    const raw = fs.readFileSync(fullPath, 'utf8')
    const parsed = matter(raw)
    const relPath = filePath.startsWith('knowledge/') ? filePath.slice('knowledge/'.length) : filePath
    return {
      path: filePath.startsWith('knowledge/') ? filePath : `knowledge/${filePath}`,
      id: parsed.data.id || path.basename(fullPath, '.md'),
      type: parsed.data.type || inferType(relPath),
      app_scope: parsed.data.app_scope || 'all',
      content: parsed.content
    }
  } catch (e) {
    return null
  }
}

// ── task context helpers ─────────────────────────────────────────────────────

const TYPE_HINT_KEYWORDS = {
  features: ['feature', 'screen', 'page', 'module'],
  flows: ['flow', 'process', 'workflow', 'pipeline'],
  'data/schema': ['schema', 'model', 'entity', 'table', 'database'],
  validation: ['validation', 'validator', 'rule', 'constraint'],
  components: ['component', 'button', 'form', 'modal', 'layout'],
  integrations: ['integration', 'api', 'webhook', 'external'],
  'standards/code': ['component', 'api', 'test', 'testing', 'code', 'style'],
  'standards/knowledge': ['feature', 'flow', 'schema', 'document', 'kb'],
  'standards/process': ['review', 'workflow', 'process', 'checklist']
}

function inferTypeHints(keywords) {
  const hints = []
  for (const [folder, triggers] of Object.entries(TYPE_HINT_KEYWORDS)) {
    if (keywords.some(kw => triggers.includes(kw.toLowerCase()))) {
      hints.push(folder)
    }
  }
  return hints
}

function loadDriftTargets() {
  const driftPath = path.join(KB_ROOT, 'sync/code-drift.md')
  if (!fs.existsSync(driftPath)) return []
  try {
    const content = fs.readFileSync(driftPath, 'utf8')
    const targets = []
    for (const line of content.split('\n')) {
      const match = line.match(/^## (.+)/)
      if (match) targets.push(match[1].trim())
    }
    return targets
  } catch { return [] }
}

// ── schema filtering ────────────────────────────────────────────────────────

function applySchemaFiltering(candidates, keywords) {
  if (!keywords || candidates.length === 0) return candidates

  const { parseDbml, filterTablesByKeywords } = require('./schema')
  const kwList = Array.isArray(keywords) ? keywords : [keywords]

  return candidates.map(file => {
    if (!file || file.type !== 'schema') return file

    const parsed = parseDbml(file.content)
    if (parsed.tables.length === 0) return file // old format, pass through

    const matched = filterTablesByKeywords(parsed, kwList)
    if (matched.tables.length === 0) return file // no matches, return full file

    // Reconstruct content with only the matched DBML blocks
    const blocks = [
      ...matched.tables.map(t => t.content),
      ...matched.enums.map(e => e.content),
      ...matched.refs
    ]
    return { ...file, content: blocks.join('\n\n') + '\n' }
  })
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_get',
    description: 'Load relevant KB files for a task. Respects token budget and app_scope filtering. When working_paths is provided, returns a separate rules_in_scope field listing standards rules that apply to those files (capped, descriptions trimmed) plus any open backlog entries as advisory items.',
    inputSchema: {
      type: 'object',
      properties: {
        task_type: { type: 'string', description: 'Type of task (e.g. generate, review, export)' },
        keywords: { description: 'Keywords to match KB files', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        app_scope: { type: 'string', description: 'Filter by app scope (e.g. frontend, backend). When working_paths is also set, this overrides path-based app_scope inference.' },
        scope: { type: 'string', description: 'Export scope: domain name, feature id, or "all"' },
        max_tokens: { type: 'number', description: 'Override token budget (default: 8000, or token_budget from _rules.md)' },
        task_context: { type: 'string', enum: ['creating', 'fixing', 'reviewing'], description: 'Adjusts relevance scoring: creating boosts same-type files, fixing boosts code standards, reviewing includes drift targets' },
        working_paths: { type: 'array', items: { type: 'string' }, description: 'File paths the agent is about to edit. Triggers rules_in_scope injection — relevant standards rules (capped at working_paths_cap, default 10) are returned in a separate field. Independent of task_context and keywords.' }
      }
    }
  }
}
