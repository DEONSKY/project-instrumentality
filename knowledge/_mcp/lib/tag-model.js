// Tag-extraction model: constants, scoring helpers, compound detection.
//
// Separated from tag-extract.js so the latter file holds only the three
// public extractor functions. STOPWORDS / SHORT_KEEP are kept here (not
// in lib/kb-constants.js) because autorelate.js intentionally uses a
// different, smaller STOPWORDS set tuned for relation extraction — these
// two lists are NOT interchangeable.

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
  // Structural filler that leaks through as sub-parts or body text
  'based', 'specific', 'related', 'given', 'following', 'within', 'across', 'consistent',
  'every', 'without', 'another', 'different', 'certain', 'general',
  'common', 'current', 'available', 'existing', 'relevant', 'appropriate',
  // Structural KB / template words (section headings, layout terms)
  'description', 'fields', 'business', 'rules', 'changelog', 'created', 'notes',
  'default', 'required', 'type', 'edge', 'cases', 'open', 'questions', 'summary',
  'example', 'examples', 'section', 'details', 'list', 'item', 'items', 'value',
  'values', 'name', 'format', 'response', 'request', 'data', 'file', 'path',
  'true', 'false', 'null', 'undefined', 'none', 'todo', 'note', 'info',
  'feature', 'flow', 'schema', 'standard', 'decision', 'validation', 'integration',
  'policy', 'policies', 'reference', 'technical',
  // Fix 1: Markdown structural / template heading words
  'features', 'flows', 'steps', 'states', 'overview', 'conventions', 'structure',
  'module', 'purpose', 'why', 'core', 'external', 'key', 'supporting', 'areas',
  'domain', 'pattern', 'screen', 'form', 'field', 'label', 'button', 'row',
  'column', 'table', 'entry', 'record', 'level', 'number', 'text', 'flag',
  'order', 'display', 'result',
  // Table data noise
  'yes', 'off', 'empty', 'already', 'assigned', 'second', 'whole',
  'enabled', 'disabled', 'visible', 'hidden', 'active', 'inactive',
  'removed', 'appear', 'appears', 'multiple', 'dropdown',
  // ORM/DB annotation noise
  'convert', 'insertable', 'updatable', 'nullable', 'cascade',
  'boolean-status', 'creation-timestamp', 'msg-date', 'entry-date',
  // Phase 2 #4: structural/path tokens leaking from prose and directory names
  'src', 'impl', 'layout', 'categories', 'context', 'state', 'strategy',
  'infrastructure', 'dependencies', 'exception', 'real', 'global', 'main',
  'code', 'standards', 'config', 'settings', 'options', 'params', 'args'
])

// Fix 5: Action verbs from flow step descriptions — never tags
const ACTION_VERBS = new Set([
  'opens', 'displays', 'selects', 'enters', 'saves', 'submits', 'clicks',
  'navigates', 'filters', 'sends', 'returns', 'shows', 'loads', 'fetches',
  'creates', 'updates', 'deletes', 'checks', 'validates', 'confirms',
  'triggers', 'redirects', 'receives', 'processes', 'handles', 'calls',
  'sets', 'gets', 'adds', 'removes', 'starts', 'stops', 'runs', 'logs',
  'maps', 'renders', 'wraps', 'throws', 'catches', 'passes', 'holds',
  'forwards', 'records', 'provides', 'contains', 'includes', 'requires',
  // Phase 2 #4: gerund forms that leaked from headings and prose
  'implementing', 'handling', 'working', 'saving', 'refreshing', 'loading',
  'opening', 'closing', 'selecting', 'entering', 'clicking', 'submitting',
  'viewing', 'adding', 'editing', 'deleting', 'creating', 'updating',
  'building', 'managing', 'running', 'starting', 'stopping', 'fetching'
])

// Phase 2 #4: domain gerunds that are legitimate tags despite ending in -ing
const GERUND_WHITELIST = new Set([
  'logging', 'monitoring', 'caching', 'tracing', 'indexing', 'routing',
  'mapping', 'testing'
])

const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl',
  'jpa', 'mvc', 'spa', 'ssr', 'csr', 'plc', 'ldap', 'mab', 'mui', 'jms',
  'http', 'rest', 'grpc', 'amqp', 'smtp', 'imap', 'ftp', 'tcp', 'udp'
])

function isLikelyGerund(term) {
  if (!term || term.length <= 5) return false
  if (!term.endsWith('ing')) return false
  if (SHORT_KEEP.has(term)) return false
  if (GERUND_WHITELIST.has(term)) return false
  // Compound terms (have a hyphen) are handled separately — don't reject them here
  if (term.includes('-')) return false
  return true
}

/**
 * Phase 2 #3: Match each known compound tag (e.g. "soft-delete") against content
 * in hyphen, space, and camelCase forms. Returns {hits, cleaned} where hits is
 * a Map<compound, count> and cleaned has the matched spans replaced with spaces
 * so subsequent single-word passes don't double-count the constituent tokens.
 */
function findKnownCompounds(cleaned, knownCompounds) {
  const hits = new Map()
  if (!knownCompounds || knownCompounds.size === 0) return { hits, cleaned }

  let working = cleaned
  for (const compound of knownCompounds) {
    const parts = compound.split('-')
    if (parts.length < 2) continue
    // hyphen or space between parts, word boundaries on both ends
    const escaped = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const spacedRegex = new RegExp('\\b' + escaped.join('[- ]') + '\\b', 'gi')
    const camelRegex = new RegExp('\\b' + parts.map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join('') + '\\b', 'g')

    let count = 0
    working = working.replace(spacedRegex, (m) => { count++; return ' '.repeat(m.length) })
    working = working.replace(camelRegex, (m) => { count++; return ' '.repeat(m.length) })
    if (count > 0) hits.set(compound, count)
  }
  return { hits, cleaned: working }
}

/**
 * Phase 2 #3: Lowercase-bigram detector. Finds any lowercase 2-word sequence
 * appearing 3+ times in bodyOnly, where neither word is a stopword/action verb.
 * Returns Map<compound, count>.
 */
function findLowercaseBigrams(bodyOnly, blockedWords) {
  const re = /\b([a-z]{3,})\s+([a-z]{3,})\b/g
  const counts = new Map()
  let m
  while ((m = re.exec(bodyOnly)) !== null) {
    const a = m[1], b = m[2]
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue
    if (ACTION_VERBS.has(a) || ACTION_VERBS.has(b)) continue
    if (isLikelyGerund(a) || isLikelyGerund(b)) continue
    if (blockedWords && (blockedWords.has(a) || blockedWords.has(b))) continue
    const compound = `${a}-${b}`
    counts.set(compound, (counts.get(compound) || 0) + 1)
  }
  const hits = new Map()
  for (const [k, v] of counts) {
    if (v >= 3) hits.set(k, v)
  }
  return hits
}

/**
 * Phase 2 #5: Compute adaptive tag count based on content length.
 */
function computeTargetCount(markdownContent) {
  const wordCount = (markdownContent.match(/\S+/g) || []).length
  return Math.min(12, Math.max(5, Math.ceil(wordCount / 200)))
}

/**
 * Extract topic anchor words from file id and path.
 * Used for topic cohesion filtering.
 */
function extractTopicWords(opts) {
  const words = new Set()
  if (opts.id) {
    for (const w of opts.id.split('-')) {
      if (w.length > 2 && !STOPWORDS.has(w)) words.add(w)
    }
  }
  if (opts.filePath) {
    const kbIdx = opts.filePath.indexOf('knowledge/')
    const relative = (kbIdx >= 0 ? opts.filePath.slice(kbIdx) : opts.filePath)
      .replace(/^knowledge\//, '').replace(/\.md$/, '')
    for (const segment of relative.split('/')) {
      for (const w of segment.split('-')) {
        if (w.length > 2 && !STOPWORDS.has(w)) words.add(w)
      }
    }
  }
  return words
}

// Fix 4: Strip table data rows but preserve inline code from them.
// Header rows are kept in full. Data rows are stripped to just their
// inline code spans (backtick-wrapped terms) which are meaningful.
function stripTableDataRows(text) {
  const lines = text.split('\n')
  const result = []
  let inTable = false
  let headerDone = false

  for (const line of lines) {
    const trimmed = line.trim()
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|')
    const isSeparator = /^\|[\s:|-]+\|$/.test(trimmed)

    if (isTableRow) {
      if (!inTable) {
        inTable = true
        headerDone = false
        result.push(line)
      } else if (isSeparator) {
        headerDone = true
      } else if (headerDone) {
        // Data row — extract only inline code spans
        const codeSpans = line.match(/`[^`]+`/g)
        if (codeSpans) {
          result.push(codeSpans.join(' '))
        }
        // Drop the rest of the data row
      } else {
        result.push(line)
      }
    } else {
      if (inTable) {
        inTable = false
        headerDone = false
      }
      result.push(line)
    }
  }
  return result.join('\n')
}

// Fix 3: Detect URL-like or path-like tokens
function isUrlOrPath(term) {
  if (!term) return false
  if (/^https?:/.test(term)) return true
  if (/^\/[a-z]/.test(term)) return true
  if (/\.(svc|cluster|local|corp|internal)/.test(term)) return true
  if ((term.match(/\//g) || []).length >= 2) return true
  return false
}

// Fix 6: Merge plurals into singular, summing their scores
function deduplicatePlurals(scores) {
  const result = new Map()
  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1])

  for (const [tag, score] of entries) {
    const singular = toSingular(tag)
    if (singular !== tag && result.has(singular)) {
      // Plural form — merge score into existing singular
      result.set(singular, result.get(singular) + score)
    } else if (singular !== tag && scores.has(singular)) {
      // Singular exists in original but not yet processed — use singular
      result.set(singular, (result.get(singular) || 0) + score)
    } else {
      // Check if a plural of this already exists in result
      const asPlural = tag + 's'
      if (result.has(asPlural)) {
        const pluralScore = result.get(asPlural)
        result.delete(asPlural)
        result.set(tag, score + pluralScore)
      } else {
        result.set(tag, score)
      }
    }
  }
  return result
}

// Simple English singular: strips trailing 's', 'es', 'ies' → 'y'
function toSingular(word) {
  if (word.length <= 3) return word
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y'
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
      word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1)
  return word
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
  if (ACTION_VERBS.has(tag)) return false
  if (/^\d+$/.test(tag)) return false
  // Reject date-like patterns (2026-04-11, 2025-01, etc.)
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(tag)) return false
  // Reject SQL/DBML type noise (char-1, varchar-255, number-10-2, etc.)
  if (/^(char|varchar|int|bigint|number|decimal|float|boolean|timestamp|clob|blob|seq|long)(-\d+)*$/.test(tag)) return false
  // Reject DBML/ORM annotation noise
  if (/^(not-null|not-null|insertable|updatable|nullable|unique|auto-increment|default|primary|foreign|cascade|restrict)$/.test(tag)) return false
  // Reject Java/ORM class pattern noise (t-xxx, abstract-xxx-entity, xxx-id)
  if (/^t-[a-z]/.test(tag) && tag.length < 15) return false
  if (/^abstract-/.test(tag)) return false
  if (/-(entity|dto|vo|dao|repository|controller|service|factory|builder|mapper|converter|handler)$/.test(tag)) return false
  return true
}

function splitWords(text) {
  return text
    .replace(/[^a-zA-Z0-9-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

module.exports = {
  // Constants
  STOPWORDS,
  ACTION_VERBS,
  GERUND_WHITELIST,
  SHORT_KEEP,
  // Pure helpers
  normalize,
  toSingular,
  splitWords,
  isUrlOrPath,
  // Composite checks
  isLikelyGerund,
  isValidTag,
  // Scoring helpers
  deduplicatePlurals,
  // Topic / structure
  extractTopicWords,
  stripTableDataRows,
  computeTargetCount,
  // Compound detection
  findKnownCompounds,
  findLowercaseBigrams
}
