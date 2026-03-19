const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { loadGraph, getAlwaysLoad, getByScope } = require('../lib/graph')
const { estimateTokens, totalTokens } = require('../lib/budget')

const KB_ROOT = 'knowledge'
const DEFAULT_MAX_TOKENS = 8000

async function runTool({ task_type, keywords, app_scope, scope } = {}) {
  const graph = loadGraph(KB_ROOT)

  // Always load foundation files first
  const alwaysLoadEntries = getAlwaysLoad(graph)
  const alwaysLoadFiles = alwaysLoadEntries
    .map(entry => loadFile(entry.path))
    .filter(Boolean)

  // Export mode: load all files in scope
  if (task_type === 'export' || scope) {
    return handleExportScope(graph, scope, app_scope, alwaysLoadFiles)
  }

  // Standard mode: keyword-based traversal
  const candidates = findCandidates(graph, keywords, app_scope)
  const selectedFiles = selectWithinBudget(alwaysLoadFiles, candidates, DEFAULT_MAX_TOKENS)

  return { files: selectedFiles }
}

function handleExportScope(graph, scope, appScopeFilter, alwaysLoadFiles) {
  let entries

  if (!scope || scope === 'all') {
    entries = getByScope(graph, appScopeFilter)
  } else {
    // scope could be a domain (e.g. "billing") or feature id
    entries = Object.entries(graph.files || {}).filter(([fp, entry]) => {
      const matchesDomain = fp.includes(scope)
      const matchesId = entry.id === scope
      const matchesGroup = entry.group && entry.group.includes(scope)
      return matchesDomain || matchesId || matchesGroup
    })
  }

  const files = entries
    .map(([fp]) => loadFile(fp))
    .filter(Boolean)

  const all = [...alwaysLoadFiles, ...files.filter(f =>
    !alwaysLoadFiles.some(a => a.path === f.path)
  )]

  return { files: all }
}

function findCandidates(graph, keywords, appScopeFilter) {
  if (!keywords) return []

  const keywordList = Array.isArray(keywords) ? keywords : [keywords]
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
      (entry.tags || []).join(' '),
      (entry.depends_on || []).join(' ')
    ].join(' ').toLowerCase()

    const score = keywordList.reduce((s, kw) => {
      return s + (searchText.includes(kw.toLowerCase()) ? 1 : 0)
    }, 0)

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
    const content = fs.readFileSync(fullPath, 'utf8')
    const parsed = matter(content)
    return {
      path: filePath.startsWith('knowledge/') ? filePath : `knowledge/${filePath}`,
      id: parsed.data.id || path.basename(fullPath, '.md'),
      type: parsed.data.type || inferType(fullPath),
      app_scope: parsed.data.app_scope || 'all',
      content
    }
  } catch (e) {
    return null
  }
}

function inferType(filePath) {
  if (filePath.includes('/features/')) return 'feature'
  if (filePath.includes('/flows/')) return 'flow'
  if (filePath.includes('/data/schema/')) return 'schema'
  if (filePath.includes('/validation/')) return 'validation'
  if (filePath.includes('/integrations/')) return 'integration'
  if (filePath.includes('/decisions/')) return 'decision'
  if (filePath.includes('/foundation/')) return 'foundation'
  if (filePath.includes('/ui/')) return 'ui'
  return 'general'
}

module.exports = { runTool }
