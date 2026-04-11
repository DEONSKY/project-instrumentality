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

const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl',
  'jpa', 'mvc', 'spa', 'ssr', 'csr', 'plc', 'ldap', 'mab', 'mui', 'jms',
  'http', 'rest', 'grpc', 'amqp', 'smtp', 'imap', 'ftp', 'tcp', 'udp'
])

/**
 * Extract tags from markdown text content.
 * Pure string operations — no LLM, no disk I/O.
 *
 * @param {string} markdownContent - raw markdown body (no frontmatter)
 * @param {object} [opts] - optional: { id, filePath } for extra signal
 * @param {number} [maxTags=20] - max tags to return
 * @returns {string[]} sorted by relevance score
 */
function extractTagsFromText(markdownContent, opts = {}, maxTags = 20) {
  const stripped = (markdownContent || '').replace(/```[\s\S]*?```/g, '')

  const scores = new Map()

  function addTerm(term, weight) {
    const normalized = normalize(term)
    if (!normalized) return
    const parts = normalized.split('-').filter(p => p.length > 0)
    if (normalized.length > 2 && !STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
    }
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
  if (opts.filePath) {
    const relative = opts.filePath.replace(/^knowledge\//, '').replace(/\.md$/, '')
    for (const segment of relative.split('/')) {
      for (const word of segment.split('-')) {
        addTerm(word, 2)
      }
    }
  }
  if (opts.id) {
    for (const word of opts.id.split('-')) {
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

  const sorted = [...scores.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag)

  return sorted
}

function normalize(term) {
  if (!term) return ''
  return term
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function isValidTag(tag) {
  if (!tag) return false
  if (tag.length <= 2 && !SHORT_KEEP.has(tag)) return false
  if (tag.length > 30) return false
  if (STOPWORDS.has(tag)) return false
  if (/^\d+$/.test(tag)) return false
  return true
}

function splitWords(text) {
  return text
    .replace(/[^a-zA-Z0-9-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

module.exports = { extractTagsFromText, STOPWORDS, SHORT_KEEP }
