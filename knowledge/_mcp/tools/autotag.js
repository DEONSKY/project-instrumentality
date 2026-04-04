const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { runTool: reindex } = require('./reindex')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

const STOPWORDS = new Set([
  // Common English
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'has', 'have', 'been', 'being', 'were', 'will',
  'would', 'could', 'should', 'shall', 'might', 'must', 'does', 'doing', 'done',
  'that', 'this', 'these', 'those', 'with', 'from', 'into', 'about', 'above',
  'after', 'before', 'below', 'between', 'through', 'during', 'until', 'also',
  'then', 'once', 'here', 'there', 'when', 'where', 'which', 'while', 'whom',
  'what', 'both', 'each', 'more', 'most', 'other', 'some', 'such', 'only',
  'same', 'than', 'very', 'just', 'because', 'they', 'them', 'their', 'it',
  'its', 'how', 'who', 'may', 'over', 'under', 'again', 'further', 'make',
  'like', 'use', 'used', 'using', 'uses', 'well', 'back', 'even', 'give',
  'new', 'way', 'want', 'look', 'first', 'also', 'take', 'come', 'made',
  'find', 'long', 'need', 'know', 'get', 'see', 'now', 'any', 'many',
  // Structural KB terms (shouldn't become tags)
  'description', 'fields', 'business', 'rules', 'changelog', 'created', 'notes',
  'default', 'required', 'type', 'edge', 'cases', 'open', 'questions', 'summary',
  'example', 'examples', 'section', 'details', 'list', 'item', 'items', 'value',
  'values', 'name', 'format', 'response', 'request', 'data', 'file', 'path',
  'true', 'false', 'null', 'undefined', 'none', 'todo', 'note', 'info',
  'feature', 'flow', 'schema', 'standard', 'decision', 'validation', 'integration'
])

// Short technical terms worth keeping as tags
const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl',
  'jpa', 'mvc', 'spa', 'ssr', 'csr', 'plc', 'ldap', 'mab', 'mui', 'jms',
  'http', 'rest', 'grpc', 'amqp', 'smtp', 'imap', 'ftp', 'tcp', 'udp'
])

async function runTool({ file_path } = {}) {
  const files = resolveFiles(file_path)
  if (files.error) return files

  let tagged = 0
  let skipped = 0
  let totalTagsAdded = 0
  const sample = {}

  for (const fp of files) {
    const result = processFile(fp)
    if (!result) {
      skipped++
      continue
    }
    if (result.added > 0) {
      tagged++
      totalTagsAdded += result.added
      if (Object.keys(sample).length < 5) {
        const rel = fp.replace(/^knowledge\//, '')
        sample[rel] = result.tags
      }
    }
  }

  // Reindex once after all files are processed
  if (tagged > 0) {
    await reindex({ silent: true })
  }

  return {
    tagged,
    skipped,
    tags_added: totalTagsAdded,
    files_scanned: files.length,
    sample
  }
}

function resolveFiles(filePath) {
  if (!filePath || filePath === 'all') {
    return collectMdFiles(KB_ROOT)
  }

  const full = filePath.startsWith(KB_ROOT) ? filePath : path.join(KB_ROOT, filePath)
  if (!fs.existsSync(full)) {
    return { error: `File not found: ${full}` }
  }
  return [full]
}

function processFile(filePath) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch { return null }

  let parsed
  try {
    parsed = matter(content)
    if (!parsed.data || typeof parsed.data !== 'object') return null
  } catch { return null }

  const existingTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : []
  const extractedTags = extractTags(parsed.content, parsed.data, filePath)

  // Merge: preserve existing, add new
  const merged = [...new Set([...existingTags, ...extractedTags])]

  if (merged.length === existingTags.length && merged.every(t => existingTags.includes(t))) {
    return { added: 0, tags: existingTags }
  }

  // Write back
  parsed.data.tags = merged
  const updated = matter.stringify(parsed.content, parsed.data)
  fs.writeFileSync(filePath, updated, 'utf8')

  const added = merged.length - existingTags.length
  return { added, tags: merged }
}

function extractTags(markdownContent, frontmatter, filePath) {
  // Strip code blocks
  const stripped = markdownContent.replace(/```[\s\S]*?```/g, '')

  const scores = new Map()

  function addTerm(term, weight) {
    const normalized = normalize(term)
    if (!normalized) return
    // Split multi-word terms into individual tags too
    const parts = normalized.split('-').filter(p => p.length > 0)
    // Add the full compound term
    if (normalized.length > 2 && !STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
    }
    // Add individual parts if they're meaningful
    for (const part of parts) {
      if (isValidTag(part)) {
        scores.set(part, (scores.get(part) || 0) + weight * 0.5)
      }
    }
  }

  // 1. Headings (weight 3)
  const headings = stripped.match(/^#{1,4}\s+(.+)$/gm) || []
  for (const h of headings) {
    const text = h.replace(/^#+\s+/, '')
    for (const word of splitWords(text)) {
      addTerm(word, 3)
    }
  }

  // 2. Bold text (weight 2)
  const bolds = stripped.match(/\*\*([^*]+)\*\*/g) || []
  for (const b of bolds) {
    const text = b.replace(/\*\*/g, '')
    for (const word of splitWords(text)) {
      addTerm(word, 2)
    }
  }

  // 3. Inline code (weight 2)
  const codes = stripped.match(/`([^`]+)`/g) || []
  for (const c of codes) {
    const text = c.replace(/`/g, '')
    addTerm(text, 2)
  }

  // 4. File path and id (weight 2)
  const relative = filePath.replace(/^knowledge\//, '').replace(/\.md$/, '')
  for (const segment of relative.split('/')) {
    for (const word of segment.split('-')) {
      addTerm(word, 2)
    }
  }
  if (frontmatter.id) {
    for (const word of frontmatter.id.split('-')) {
      addTerm(word, 2)
    }
  }

  // 5. Body text (weight 1) — only words that appear 2+ times
  const bodyWords = splitWords(stripped)
  const bodyCounts = new Map()
  for (const w of bodyWords) {
    const n = normalize(w)
    if (n && isValidTag(n)) {
      bodyCounts.set(n, (bodyCounts.get(n) || 0) + 1)
    }
  }
  for (const [word, count] of bodyCounts) {
    if (count >= 2) {
      addTerm(word, 1)
    }
  }

  // Sort by score desc, take top 20
  const sorted = [...scores.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag]) => tag)

  return sorted
}

function normalize(term) {
  if (!term) return ''
  // camelCase / PascalCase → kebab-case
  let result = term
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return result
}

function isValidTag(tag) {
  if (!tag) return false
  if (tag.length <= 2 && !SHORT_KEEP.has(tag)) return false
  if (tag.length > 30) return false
  if (STOPWORDS.has(tag)) return false
  // Reject pure numbers
  if (/^\d+$/.test(tag)) return false
  return true
}

function splitWords(text) {
  return text
    .replace(/[^a-zA-Z0-9-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

function collectMdFiles(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
      } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
        files.push(full)
      }
    })
  }

  walk(dir)
  return files
}

module.exports = { runTool }
