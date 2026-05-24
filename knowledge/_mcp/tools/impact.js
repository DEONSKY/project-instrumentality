const fs = require('fs')
const path = require('path')
const { loadGraph, getDependents } = require('../lib/graph')
const { resolvePrompt } = require('../lib/prompts')

const KB_ROOT = 'knowledge'

/**
 * kb_impact — Finds KB files affected by a change and returns impact prompts.
 * The calling agent processes each prompt and proposes updates.
 * Does NOT write anything — agent calls kb_write per file after reviewing proposals.
 */
async function runTool({ change_description } = {}) {
  if (!change_description) return { error: 'change_description is required' }

  const graph = loadGraph(KB_ROOT)
  const keywords = extractKeywords(change_description)
  const affectedEntries = new Map()

  // Keyword match across graph metadata
  Object.entries(graph.files || {}).forEach(([fp, entry]) => {
    const searchText = [
      fp,
      entry.id || '',
      entry.type || '',
      (entry.depends_on || []).join(' '),
      (entry.affects_flows || []).join(' '),
      (entry.tags || []).join(' ')
    ].join(' ').toLowerCase()

    const score = keywords.reduce((s, kw) => s + (searchText.includes(kw) ? 1 : 0), 0)
    if (score > 0) affectedEntries.set(fp, { entry, score })
  })

  // Also include dependents of matching files
  for (const [fp] of affectedEntries) {
    const id = (graph.files[fp] || {}).id
    if (id) {
      getDependents(graph, id).forEach(({ path: depPath }) => {
        if (!affectedEntries.has(depPath)) {
          affectedEntries.set(depPath, { entry: graph.files[depPath], score: 0.5 })
        }
      })
    }
  }

  if (affectedEntries.size === 0) {
    return { affected_files: [], message: 'No KB files matched the change description.', note: 'impact does not write — agent reviews and calls kb_write per file.' }
  }

  const sorted = [...affectedEntries.entries()]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 10)

  const affected_files = []

  for (const [fp] of sorted) {
    const fullPath = path.join(KB_ROOT, fp)
    if (!fs.existsSync(fullPath)) continue

    const fileContent = fs.readFileSync(fullPath, 'utf8')

    const prompt = resolvePrompt('impact-proposal', {
      change_description,
      file_path: fp,
      file_content: fileContent.slice(0, 2000)
    })

    affected_files.push({
      path: fp,
      content_snippet: fileContent.slice(0, 500),
      prompt: prompt || null
    })
  }

  return {
    affected_files,
    total_candidates: affectedEntries.size,
    note: 'impact does not write. For each affected file, review the prompt and call kb_write to apply changes.'
  }
}

const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl'
])
const STOP_WORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'when', 'will', 'should'])

function extractKeywords(text) {
  const rawTokens = String(text).split(/[\s,;.]+/)
  const out = []
  for (const raw of rawTokens) {
    if (!raw) continue
    // Always include the lowercased original so existing matches keep working.
    out.push(raw.toLowerCase())
    // Also split camelCase / PascalCase tokens so renaming "linestopMail"
    // matches files referencing "linestop" or "mail" alone. Two passes handle
    // both camelCase ("aB" → "a B") and adjacent caps with a trailing lower
    // ("HTMLParser" → "HTML Parser"). When the token is purely lowercase the
    // split is a no-op and we don't double-emit it.
    const split = raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/\s+/)
    if (split.length > 1) out.push(...split)
  }
  return out
    .filter(w => w && (w.length > 3 || SHORT_KEEP.has(w)))
    .filter(w => !STOP_WORDS.has(w))
}

module.exports = {
  runTool,
  // Exposed for tests; not part of the MCP surface.
  extractKeywords,
  definition: {
    name: 'kb_impact',
    description: 'Analyze impact of a change across the KB dependency graph. Returns proposals — does not write.',
    inputSchema: {
      type: 'object',
      required: ['change_description'],
      properties: {
        change_description: { type: 'string', description: 'Description of the change to analyze' }
      }
    }
  }
}
