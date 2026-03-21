const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const INDEX_FILE = '_index.yaml'

function getIndexPath(kbRoot = 'knowledge') {
  return path.join(kbRoot, INDEX_FILE)
}

function loadGraph(kbRoot = 'knowledge') {
  const indexPath = getIndexPath(kbRoot)
  if (!fs.existsSync(indexPath)) {
    return { version: '1.0', files: {}, groups: {} }
  }
  const content = fs.readFileSync(indexPath, 'utf8')
  const parsed = yaml.load(content)
  return parsed || { version: '1.0', files: {}, groups: {} }
}

function saveGraph(graph, kbRoot = 'knowledge') {
  const indexPath = getIndexPath(kbRoot)
  const content = yaml.dump(graph, { lineWidth: 120, noRefs: true })
  fs.writeFileSync(indexPath, content, 'utf8')
}

function getFile(graph, filePath) {
  const normalized = filePath.replace(/^knowledge\//, '')
  return (graph.files || {})[normalized] || null
}

function getGroup(graph, groupPath) {
  const normalized = groupPath.replace(/^knowledge\//, '')
  return (graph.groups || {})[normalized] || null
}

function getDependents(graph, id) {
  const results = []
  for (const [filePath, entry] of Object.entries(graph.files || {})) {
    const deps = entry.depends_on || []
    // Exact match or path-segment match (e.g. "features/auth" matches dep "features/auth")
    const inDeps = deps.some(d => d === id || d.endsWith('/' + id))
    const inFlows = (entry.affects_flows || []).some(f => f === id || f.endsWith('/' + id))
    if (inDeps || inFlows) {
      results.push({ path: filePath, entry })
    }
  }
  return results
}

function getByScope(graph, appScope) {
  if (!appScope) return Object.entries(graph.files || {})
  return Object.entries(graph.files || {}).filter(([, entry]) => {
    const scope = entry.app_scope
    if (!scope) return false
    if (scope === 'all' || scope === appScope) return true
    if (Array.isArray(scope)) return scope.includes(appScope) || scope.includes('all')
    return false
  })
}

function getAlwaysLoad(graph) {
  return Object.entries(graph.files || {})
    .filter(([, entry]) => entry.always_load === true)
    .map(([filePath, entry]) => ({ path: filePath, ...entry }))
}

module.exports = { loadGraph, saveGraph, getFile, getGroup, getDependents, getByScope, getAlwaysLoad }
