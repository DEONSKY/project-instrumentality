import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { Graph, GraphEntry, GraphGroup, AppScope, EdgeRule } from '../src/types/graph'

const INDEX_FILE = '_index.yaml'

function getIndexPath(kbRoot = 'knowledge'): string {
  return path.join(kbRoot, INDEX_FILE)
}

function loadGraph(kbRoot = 'knowledge'): Graph {
  const indexPath = getIndexPath(kbRoot)
  if (!fs.existsSync(indexPath)) {
    return { version: '1.0', files: {}, groups: {} }
  }
  const content = fs.readFileSync(indexPath, 'utf8')
  const parsed = yaml.load(content) as Graph | undefined
  return parsed || { version: '1.0', files: {}, groups: {} }
}

function saveGraph(graph: Graph, kbRoot = 'knowledge'): void {
  const indexPath = getIndexPath(kbRoot)
  const content = yaml.dump(graph, { lineWidth: 120, noRefs: true })
  fs.writeFileSync(indexPath, content, 'utf8')
}

function getFile(graph: Graph, filePath: string): GraphEntry | null {
  const normalized = filePath.replace(/^knowledge\//, '')
  return (graph.files || {})[normalized] || null
}

function getGroup(graph: Graph, groupPath: string): GraphGroup | null {
  const normalized = groupPath.replace(/^knowledge\//, '')
  return (graph.groups || {})[normalized] || null
}

function getDependents(graph: Graph, id: string): Array<{ path: string; entry: GraphEntry }> {
  const results: Array<{ path: string; entry: GraphEntry }> = []
  for (const [filePath, entry] of Object.entries(graph.files || {})) {
    const deps = entry.depends_on || []
    // Exact match or path-segment match (e.g. "specs/features/auth" matches dep "specs/features/auth")
    const inDeps = deps.some(d => d === id || d.endsWith('/' + id))
    const inFlows = (entry.affects_flows || []).some(f => f === id || f.endsWith('/' + id))
    if (inDeps || inFlows) {
      results.push({ path: filePath, entry })
    }
  }
  return results
}

function getByScope(graph: Graph, appScope?: string): Array<[string, GraphEntry]> {
  if (!appScope) return Object.entries(graph.files || {})
  return Object.entries(graph.files || {}).filter(([, entry]) => {
    const scope: AppScope | undefined = entry.app_scope
    if (!scope) return false
    if (scope === 'all' || scope === appScope) return true
    if (Array.isArray(scope)) return scope.includes(appScope) || scope.includes('all')
    return false
  })
}

function getAlwaysLoad(graph: Graph): Array<{ path: string } & GraphEntry> {
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
const EDGE_RULES: EdgeRule[] = []

// Resolve a depends_on / affects_flows entry to a file key in graph.files.
// Returns the matching key or null. Defined to be byte-identical to the
// predicates at tools/reindex.js orphan detector — see plan "Resolution rule".
function resolveDep(graph: Graph, dep: string): string | null {
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

interface Cycle {
  path: string[]
}

interface StackFrame {
  node: string
  iter: Iterator<string>
}

// Iterative DFS with white(0)/gray(1)/black(2) coloring. Returns one cycle
// per back-edge encountered, as { path: [fileKey, ...] }. Edges that don't
// resolve via resolveDep are silently skipped (already surfaced as orphans).
// Bounded by maxCycles and maxPathLength.
function findCycles(
  graph: Graph,
  { maxCycles = MAX_CYCLES_REPORTED, maxPathLength = MAX_CYCLE_PATH_LENGTH } = {}
): { cycles: Cycle[]; truncated: boolean } {
  const files = graph.files || {}
  const color = new Map<string, number>()
  const cycles: Cycle[] = []
  let truncated = false

  const edgesFrom = (key: string): string[] => {
    const entry = files[key] || {}
    const out: string[] = []
    for (const d of [...(entry.depends_on || []), ...(entry.affects_flows || [])]) {
      const target = resolveDep(graph, d)
      if (target) out.push(target)
    }
    return out
  }

  for (const start of Object.keys(files)) {
    if (color.get(start)) continue
    color.set(start, 1)
    const stack: StackFrame[] = [{ node: start, iter: edgesFrom(start)[Symbol.iterator]() }]
    while (stack.length) {
      if (cycles.length >= maxCycles) { truncated = true; break }
      const top = stack[stack.length - 1]
      const next = top.iter.next()
      if (next.done) { color.set(top.node, 2); stack.pop(); continue }
      const child = next.value
      const c = color.get(child) || 0
      if (c === 1) {
        const cyclePath: string[] = []
        for (let i = stack.length - 1; i >= 0; i--) {
          cyclePath.unshift(stack[i].node)
          if (stack[i].node === child) break
        }
        cyclePath.push(child)
        if (cyclePath.length > maxPathLength) cyclePath.length = maxPathLength
        cycles.push({ path: cyclePath })
      } else if (c === 0) {
        color.set(child, 1)
        stack.push({ node: child, iter: edgesFrom(child)[Symbol.iterator]() })
      }
    }
    if (truncated) break
  }
  return { cycles, truncated }
}

interface EdgeViolation {
  source: string
  edge: string
  target: string
  target_type: string | undefined
  message: string
}

// Walk edges, apply rules table, collect violations. Returns [] when rules
// is empty. Dangling edges (resolveDep === null) are silently skipped —
// already surfaced via orphan_dependencies. Bounded by maxViolations.
function validateEdges(
  graph: Graph,
  rules: EdgeRule[] = EDGE_RULES,
  { maxViolations = MAX_EDGE_VIOLATIONS_REPORTED } = {}
): { violations: EdgeViolation[]; truncated: boolean } {
  const violations: EdgeViolation[] = []
  let truncated = false
  if (!rules || rules.length === 0) return { violations, truncated }
  const files = graph.files || {}
  outer: for (const [src, entry] of Object.entries(files)) {
    for (const rule of rules) {
      for (const dep of ((entry[rule.edge] as string[]) || [])) {
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

export {
  loadGraph, saveGraph, getFile, getGroup, getDependents, getByScope, getAlwaysLoad,
  resolveDep, findCycles, validateEdges,
  EDGE_RULES,
  MAX_CYCLES_REPORTED, MAX_CYCLE_PATH_LENGTH, MAX_EDGE_VIOLATIONS_REPORTED,
}
