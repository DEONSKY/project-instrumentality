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

// Output caps for structural checks. Mirrors the cap pattern in tools/drift.js.
// Bounds serialized output of _index.yaml + MCP responses at populated-KB scale.
const MAX_CYCLES_REPORTED = 50
const MAX_CYCLE_PATH_LENGTH = 20
const MAX_EDGE_VIOLATIONS_REPORTED = 100

// Edge-type invariants. Ships empty; populate once KB conventions are written
// down. Each rule: { edge, targetType?, targetTypeNot?, message }.
const EDGE_RULES = []

// Resolve a depends_on / affects_flows entry to a file key in graph.files.
// Returns the matching key or null. Defined to be byte-identical to the
// predicates at tools/reindex.js orphan detector — see plan "Resolution rule".
function resolveDep(graph, dep) {
  if (!dep) return null
  const files = graph.files || {}
  for (const k of Object.keys(files)) {
    if (k.replace(/\.md$/, '') === dep) return k
  }
  for (const [k, e] of Object.entries(files)) {
    if (e && e.id === dep) return k
  }
  return null
}

// Iterative DFS with white(0)/gray(1)/black(2) coloring. Returns one cycle
// per back-edge encountered, as { path: [fileKey, ...] }. Edges that don't
// resolve via resolveDep are silently skipped (already surfaced as orphans).
// Bounded by maxCycles and maxPathLength.
function findCycles(graph, { maxCycles = MAX_CYCLES_REPORTED, maxPathLength = MAX_CYCLE_PATH_LENGTH } = {}) {
  const files = graph.files || {}
  const color = new Map()
  const cycles = []
  let truncated = false

  const edgesFrom = (key) => {
    const entry = files[key] || {}
    const out = []
    for (const d of [...(entry.depends_on || []), ...(entry.affects_flows || [])]) {
      const target = resolveDep(graph, d)
      if (target) out.push(target)
    }
    return out
  }

  for (const start of Object.keys(files)) {
    if (color.get(start)) continue
    color.set(start, 1)
    const stack = [{ node: start, iter: edgesFrom(start)[Symbol.iterator]() }]
    while (stack.length) {
      if (cycles.length >= maxCycles) { truncated = true; break }
      const top = stack[stack.length - 1]
      const next = top.iter.next()
      if (next.done) { color.set(top.node, 2); stack.pop(); continue }
      const child = next.value
      const c = color.get(child) || 0
      if (c === 1) {
        const path = []
        for (let i = stack.length - 1; i >= 0; i--) {
          path.unshift(stack[i].node)
          if (stack[i].node === child) break
        }
        path.push(child)
        if (path.length > maxPathLength) path.length = maxPathLength
        cycles.push({ path })
      } else if (c === 0) {
        color.set(child, 1)
        stack.push({ node: child, iter: edgesFrom(child)[Symbol.iterator]() })
      }
    }
    if (truncated) break
  }
  return { cycles, truncated }
}

// Walk edges, apply rules table, collect violations. Returns [] when rules
// is empty. Dangling edges (resolveDep === null) are silently skipped —
// already surfaced via orphan_dependencies. Bounded by maxViolations.
function validateEdges(graph, rules = EDGE_RULES, { maxViolations = MAX_EDGE_VIOLATIONS_REPORTED } = {}) {
  const violations = []
  let truncated = false
  if (!rules || rules.length === 0) return { violations, truncated }
  const files = graph.files || {}
  outer: for (const [src, entry] of Object.entries(files)) {
    for (const rule of rules) {
      for (const dep of (entry[rule.edge] || [])) {
        const targetKey = resolveDep(graph, dep)
        if (!targetKey) continue
        const t = files[targetKey].type
        const bad =
          (rule.targetType && t !== rule.targetType) ||
          (rule.targetTypeNot && t === rule.targetTypeNot)
        if (bad) {
          violations.push({ source: src, edge: rule.edge, target: dep, target_type: t, message: rule.message })
          if (violations.length >= maxViolations) { truncated = true; break outer }
        }
      }
    }
  }
  return { violations, truncated }
}

module.exports = {
  loadGraph, saveGraph, getFile, getGroup, getDependents, getByScope, getAlwaysLoad,
  resolveDep, findCycles, validateEdges,
  EDGE_RULES,
  MAX_CYCLES_REPORTED, MAX_CYCLE_PATH_LENGTH, MAX_EDGE_VIOLATIONS_REPORTED,
}
