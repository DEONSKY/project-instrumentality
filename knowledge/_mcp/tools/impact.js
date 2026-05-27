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
  // F14: cache file body reads so the metadata+body scoring loop here and the
  // top-N prompt-building loop below don't re-read the same file twice.
  const bodyCache = new Map()
  function readBody(fp) {
    if (bodyCache.has(fp)) return bodyCache.get(fp)
    const fullPath = path.join(KB_ROOT, fp)
    let content = null
    try {
      if (fs.existsSync(fullPath)) content = fs.readFileSync(fullPath, 'utf8')
    } catch { /* unreadable — treat as empty */ }
    bodyCache.set(fp, content)
    return content
  }

  // F14: search both frontmatter metadata AND body text. Metadata hits score
  // at full weight (1.0) — a file that owns a term in its tags / depends_on
  // is canonically about that term. Body hits score at half weight (0.5) so
  // files that merely mention the term in passing don't outrank files that
  // own it. Before this change only metadata was searched, which caused
  // false negatives like kb_impact({change_description: "rename linestopMail
  // ..."}) returning [] even though user-definition-contract.md's body
  // explicitly references UserDefinitionRecord and linestopMail.
  Object.entries(graph.files || {}).forEach(([fp, entry]) => {
    const metaText = [
      fp,
      entry.id || '',
      entry.type || '',
      (entry.depends_on || []).join(' '),
      (entry.affects_flows || []).join(' '),
      (entry.tags || []).join(' ')
    ].join(' ').toLowerCase()
    const metaScore = keywords.reduce((s, kw) => s + (metaText.includes(kw) ? 1 : 0), 0)

    const body = readBody(fp)
    const bodyText = body ? body.toLowerCase() : ''
    const bodyScore = bodyText
      ? keywords.reduce((s, kw) => s + (bodyText.includes(kw) ? 0.5 : 0), 0)
      : 0

    const score = metaScore + bodyScore
    if (score > 0) affectedEntries.set(fp, { entry, score })
  })

  // Also include dependents of matching files. Dependents get a fixed 0.5
  // score (kept as-is) so they sort below any file that matched directly.
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
    const fileContent = readBody(fp)
    if (fileContent === null) continue

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
