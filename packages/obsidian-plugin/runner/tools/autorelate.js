const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { matterStringify } = require('../lib/matter-utils')
const { loadGraph } = require('../lib/graph')
const { runTool: reindex } = require('./reindex')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])
const DEFAULT_THRESHOLD = 0.25

// Lower number = more "upstream" (depended upon by others)
const TYPE_PRIORITY = {
  data: 1,
  schema: 1,
  validation: 2,
  integration: 3,
  feature: 4,
  flow: 5,
  standard: 6,
  decision: 7,
  ui: 4,
  group: 10,
  unknown: 5
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'was', 'one', 'our', 'out', 'has', 'have', 'been', 'being', 'were', 'will',
  'would', 'could', 'should', 'shall', 'might', 'must', 'does', 'doing', 'done',
  'that', 'this', 'these', 'those', 'with', 'from', 'into', 'about', 'above',
  'after', 'before', 'below', 'between', 'through', 'during', 'until', 'also',
  'then', 'once', 'here', 'there', 'when', 'where', 'which', 'while', 'whom',
  'what', 'both', 'each', 'more', 'most', 'other', 'some', 'such', 'only',
  'same', 'than', 'very', 'just', 'because', 'they', 'them', 'their',
  'description', 'fields', 'business', 'rules', 'changelog', 'created', 'notes',
  'default', 'required', 'type', 'edge', 'cases', 'open', 'questions', 'summary',
  'example', 'examples', 'section', 'details', 'list', 'item', 'items', 'value',
  'values', 'name', 'format', 'response', 'request', 'data', 'file', 'path',
  'true', 'false', 'null', 'undefined', 'none', 'feature', 'flow', 'schema',
  'standard', 'decision', 'validation', 'integration'
])

async function runTool({ file_path, dry_run = false, threshold } = {}) {
  const effectiveThreshold = threshold || DEFAULT_THRESHOLD
  const graph = loadGraph(KB_ROOT)

  // Build term vectors for all files
  const termVectors = buildTermVectors(graph)
  if (termVectors.size === 0) {
    return { error: 'No KB files found to analyze' }
  }

  // Determine which files to analyze
  let sourceFiles
  if (file_path) {
    const normalized = file_path.replace(/^knowledge\//, '')
    if (!termVectors.has(normalized)) {
      return { error: `File not found in index: ${file_path}. Run kb_reindex first.` }
    }
    sourceFiles = [normalized]
  } else {
    sourceFiles = [...termVectors.keys()]
  }

  // Build adjacency list from existing depends_on
  const adjacency = buildAdjacencyList(graph)

  // Find proposals
  const proposals = []
  const cyclesAvoided = []

  for (const source of sourceFiles) {
    const sourceTerms = termVectors.get(source)
    if (!sourceTerms || sourceTerms.size === 0) continue

    for (const [target, targetTerms] of termVectors) {
      if (source === target) continue
      if (targetTerms.size === 0) continue

      // Skip intra-group unless high overlap
      const sourceDir = path.dirname(source)
      const targetDir = path.dirname(target)
      const sameGroup = sourceDir === targetDir && sourceDir !== '.'

      const intersection = new Set([...sourceTerms].filter(t => targetTerms.has(t)))
      const score = intersection.size / Math.min(sourceTerms.size, targetTerms.size)

      if (score < effectiveThreshold) continue
      if (sameGroup && score < 0.5) continue

      // Determine direction: higher-priority type depends on lower-priority
      const { from, to } = resolveDirection(source, target, graph)

      // Check if relation already exists
      const existingDeps = getExistingDeps(graph, from)
      const toNormalized = to.replace(/\.md$/, '')
      const alreadyExists = existingDeps.some(d =>
        d === to || d === toNormalized || to.endsWith(d) || d.endsWith(to)
      )
      if (alreadyExists) continue

      // Check for cycles
      if (wouldCreateCycle(adjacency, from, to)) {
        cyclesAvoided.push({ from, to, score: Math.round(score * 100) / 100 })
        continue
      }

      proposals.push({
        source: from,
        target: to,
        score: Math.round(score * 100) / 100,
        shared_terms: [...intersection].slice(0, 10)
      })
    }
  }

  // Deduplicate (A->B and B->A resolved to same direction)
  const seen = new Set()
  const uniqueProposals = proposals.filter(p => {
    const key = `${p.source}->${p.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by score desc
  uniqueProposals.sort((a, b) => b.score - a.score)

  if (dry_run) {
    return {
      proposals: uniqueProposals,
      total_proposals: uniqueProposals.length,
      cycles_avoided: cyclesAvoided.length
    }
  }

  // Write mode: update frontmatter
  const filesUpdated = new Set()
  let relationsAdded = 0

  for (const proposal of uniqueProposals) {
    const written = addDependsOn(proposal.source, proposal.target)
    if (written) {
      filesUpdated.add(proposal.source)
      relationsAdded++
    }
  }

  if (relationsAdded > 0) {
    await reindex({ silent: true })
  }

  return {
    relations_added: relationsAdded,
    files_updated: filesUpdated.size,
    cycles_avoided: cyclesAvoided.length,
    sample: uniqueProposals.slice(0, 10)
  }
}

function buildTermVectors(graph) {
  const vectors = new Map()

  for (const [fp, entry] of Object.entries(graph.files || {})) {
    const fullPath = path.join(KB_ROOT, fp)
    if (!fs.existsSync(fullPath)) continue

    const terms = new Set()

    // From tags
    for (const tag of (entry.tags || [])) {
      for (const part of tag.split('-')) {
        if (part.length > 2 && !STOPWORDS.has(part)) terms.add(part)
      }
      if (tag.length > 2 && !STOPWORDS.has(tag)) terms.add(tag)
    }

    // From id
    if (entry.id) {
      for (const part of entry.id.split('-')) {
        if (part.length > 2 && !STOPWORDS.has(part)) terms.add(part)
      }
    }

    // From file content
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const parsed = matter(content)
      const stripped = parsed.content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, match => {
          // Keep code terms but strip backticks
          const inner = match.replace(/`/g, '')
          return ' ' + camelToWords(inner) + ' '
        })

      // Headings
      const headings = stripped.match(/^#{1,4}\s+(.+)$/gm) || []
      for (const h of headings) {
        for (const w of extractWords(h.replace(/^#+\s+/, ''))) {
          terms.add(w)
        }
      }

      // Bold
      const bolds = stripped.match(/\*\*([^*]+)\*\*/g) || []
      for (const b of bolds) {
        for (const w of extractWords(b.replace(/\*\*/g, ''))) {
          terms.add(w)
        }
      }

      // Body words — only those appearing 2+ times
      const wordCounts = new Map()
      for (const w of extractWords(stripped)) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1)
      }
      for (const [w, count] of wordCounts) {
        if (count >= 2) terms.add(w)
      }
    } catch { /* skip unreadable files */ }

    vectors.set(fp, terms)
  }

  return vectors
}

function extractWords(text) {
  return camelToWords(text)
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
}

function camelToWords(text) {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

function resolveDirection(fileA, fileB, graph) {
  const entryA = (graph.files || {})[fileA] || {}
  const entryB = (graph.files || {})[fileB] || {}

  const typeA = entryA.type || inferType(fileA)
  const typeB = entryB.type || inferType(fileB)

  const prioA = TYPE_PRIORITY[typeA] || TYPE_PRIORITY.unknown
  const prioB = TYPE_PRIORITY[typeB] || TYPE_PRIORITY.unknown

  // Higher priority number depends on lower priority number
  if (prioA > prioB) return { from: fileA, to: fileB }
  if (prioB > prioA) return { from: fileB, to: fileA }

  // Same priority: alphabetical (arbitrary but consistent)
  return fileA < fileB ? { from: fileA, to: fileB } : { from: fileB, to: fileA }
}

function inferType(filePath) {
  if (filePath.startsWith('features/')) return 'feature'
  if (filePath.startsWith('flows/')) return 'flow'
  if (filePath.startsWith('data/schema/')) return 'schema'
  if (filePath.startsWith('data/')) return 'data'
  if (filePath.startsWith('validation/')) return 'validation'
  if (filePath.startsWith('integrations/')) return 'integration'
  if (filePath.startsWith('decisions/')) return 'decision'
  if (filePath.startsWith('standards/')) return 'standard'
  if (filePath.startsWith('ui/')) return 'ui'
  return 'unknown'
}

function getExistingDeps(graph, filePath) {
  const entry = (graph.files || {})[filePath]
  return entry ? (entry.depends_on || []) : []
}

function buildAdjacencyList(graph) {
  const adj = new Map()
  for (const [fp, entry] of Object.entries(graph.files || {})) {
    const deps = entry.depends_on || []
    adj.set(fp, deps)
  }
  return adj
}

function wouldCreateCycle(adjacency, from, to) {
  // BFS from 'to' to see if we can reach 'from' via existing edges
  const visited = new Set()
  const queue = [to]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === from) return true
    if (visited.has(current)) continue
    visited.add(current)

    const neighbors = adjacency.get(current) || []
    for (const n of neighbors) {
      // Handle partial path matches (e.g., "auth" matching "features/auth.md")
      const resolved = resolveDepPath(n, adjacency)
      for (const r of resolved) {
        if (!visited.has(r)) queue.push(r)
      }
    }
  }

  return false
}

function resolveDepPath(dep, adjacency) {
  // If exact match exists in adjacency keys, return it
  if (adjacency.has(dep)) return [dep]
  if (adjacency.has(dep + '.md')) return [dep + '.md']

  // Try to find a file that ends with this dep
  const matches = []
  for (const key of adjacency.keys()) {
    if (key.endsWith('/' + dep) || key.endsWith('/' + dep + '.md') || key === dep + '.md') {
      matches.push(key)
    }
  }
  return matches
}

function addDependsOn(sourceFile, targetFile) {
  const fullPath = path.join(KB_ROOT, sourceFile)
  if (!fs.existsSync(fullPath)) return false

  try {
    const content = fs.readFileSync(fullPath, 'utf8')
    const parsed = matter(content)

    if (!parsed.data || typeof parsed.data !== 'object') return false

    const deps = Array.isArray(parsed.data.depends_on) ? parsed.data.depends_on : []

    // Add the target reference (use path without .md for cleaner wikilink style)
    const ref = targetFile.replace(/\.md$/, '')
    if (deps.includes(ref) || deps.includes(targetFile)) return false

    deps.push(ref)
    parsed.data.depends_on = deps

    const updated = matterStringify(parsed.content, parsed.data)
    fs.writeFileSync(fullPath, updated, 'utf8')
    return true
  } catch {
    return false
  }
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_autorelate',
    description: 'Discover semantic relations between KB files using keyword overlap and propose depends_on links. Use dry_run: true to preview before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Analyze relations for a single file, or omit for all files.' },
        dry_run: { type: 'boolean', description: 'Preview proposed relations without writing.', default: false },
        threshold: { type: 'number', description: 'Minimum overlap score to propose a relation (0–1). Default: 0.25' }
      }
    }
  }
}
