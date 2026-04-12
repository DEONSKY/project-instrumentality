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
  'boolean-status', 'creation-timestamp', 'msg-date', 'entry-date'
])

// Fix 5: Action verbs from flow step descriptions — never tags
const ACTION_VERBS = new Set([
  'opens', 'displays', 'selects', 'enters', 'saves', 'submits', 'clicks',
  'navigates', 'filters', 'sends', 'returns', 'shows', 'loads', 'fetches',
  'creates', 'updates', 'deletes', 'checks', 'validates', 'confirms',
  'triggers', 'redirects', 'receives', 'processes', 'handles', 'calls',
  'sets', 'gets', 'adds', 'removes', 'starts', 'stops', 'runs', 'logs',
  'maps', 'renders', 'wraps', 'throws', 'catches', 'passes', 'holds',
  'forwards', 'records', 'provides', 'contains', 'includes', 'requires'
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
 * @param {object} [opts] - { id, filePath, existingTags }
 * @param {number} [maxTags=20] - max tags to return
 * @returns {string[]} sorted by relevance score
 */
function extractTagsFromText(markdownContent, opts = {}, maxTags = 20) {
  // Fix 2: Strip fenced code blocks entirely
  let cleaned = (markdownContent || '').replace(/```[\s\S]*?```/g, '')

  // Fix 3: Strip URLs and path-like strings
  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/g, '')
  cleaned = cleaned.replace(/[a-zA-Z0-9._-]+\.(svc|cluster|local|corp|internal)\b[^\s]*/g, '')

  // Fix 4: Strip markdown table data rows (keep header row)
  cleaned = stripTableDataRows(cleaned)

  const scores = new Map()

  function addTerm(term, weight) {
    const normalized = normalize(term)
    if (!normalized) return
    if (ACTION_VERBS.has(normalized)) return
    if (isUrlOrPath(normalized)) return
    if (normalized.length > 2 && !STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
    }
    // Only split compounds that are too long to be useful tags
    if (normalized.length > 30) {
      const parts = normalized.split('-').filter(p => p.length > 0)
      for (const part of parts) {
        if (isValidTag(part)) {
          scores.set(part, (scores.get(part) || 0) + weight * 0.5)
        }
      }
    }
  }

  // Fix 7: Headings — preserve hyphenated compounds (weight 3)
  const headings = cleaned.match(/^#{1,4}\s+(.+)$/gm) || []
  for (const h of headings) {
    const text = h.replace(/^#+\s+/, '')
    // Extract hyphenated compounds as whole terms first
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) {
      addTerm(c, 3)
    }
    for (const word of splitWords(text)) {
      addTerm(word, 3)
    }
  }

  // Fix 7: Bold text — preserve compounds and Title Case bigrams (weight 2)
  const bolds = cleaned.match(/\*\*([^*]+)\*\*/g) || []
  for (const b of bolds) {
    const text = b.replace(/\*\*/g, '')
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) {
      addTerm(c, 2)
    }
    // Title Case bigrams in bold (e.g. "Spring Boot")
    const boldBigrams = text.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []
    for (const bg of boldBigrams) {
      const parts = bg.toLowerCase().split(/\s+/)
      if (parts.some(p => STOPWORDS.has(p) || ACTION_VERBS.has(p))) continue
      addTerm(parts.join('-'), 2)
    }
    for (const word of splitWords(text)) {
      addTerm(word, 2)
    }
  }

  // Fix 7: Inline code — preserve as-is (weight 2)
  const codes = cleaned.match(/`([^`]+)`/g) || []
  for (const c of codes) {
    const text = c.replace(/`/g, '')
    if (!isUrlOrPath(text)) {
      addTerm(text, 2)
    }
  }

  // File path and id (weight 2)
  if (opts.filePath) {
    // Extract only the part after knowledge/ — ignore absolute path prefix
    const kbIdx = opts.filePath.indexOf('knowledge/')
    const relative = (kbIdx >= 0 ? opts.filePath.slice(kbIdx) : opts.filePath)
      .replace(/^knowledge\//, '').replace(/\.md$/, '')
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

  // Body text (weight 1) — only words that appear 2+ times
  // Strip headings, bold, and inline code so they don't double-count
  const bodyOnly = cleaned
    .replace(/^#{1,4}\s+.+$/gm, '')
    .replace(/\*\*[^*]+\*\*/g, '')
    .replace(/`[^`]+`/g, '')

  // Extract Title Case bigrams as compound terms (e.g. "Spring Boot" → spring-boot)
  // Only keep bigrams where the compound adds meaning beyond individual words
  const bigrams = bodyOnly.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []
  const bigramCounts = new Map()
  for (const bg of bigrams) {
    const parts = bg.toLowerCase().split(/\s+/)
    if (parts.some(p => STOPWORDS.has(p) || ACTION_VERBS.has(p))) continue
    const compound = parts.join('-')
    if (compound.length > 4) {
      bigramCounts.set(compound, (bigramCounts.get(compound) || 0) + 1)
    }
  }
  // Only add bigrams that appear 2+ times (indicates a real compound term)
  for (const [compound, count] of bigramCounts) {
    if (count >= 2) {
      addTerm(compound, 1.5)
    }
  }

  const bodyWords = splitWords(bodyOnly)
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

  // Fix 6: Deduplicate plural/singular — keep singular as canonical
  const deduped = deduplicatePlurals(scores)

  // Topic cohesion: extract anchor words from file id/path
  const topicWords = extractTopicWords(opts)

  const filtered = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))

  // Apply topic cohesion bonus/penalty
  if (topicWords.size > 0) {
    for (const [tag, score] of filtered) {
      const parts = tag.split('-')
      const isTopicRelated = parts.some(p => topicWords.has(p))
      if (isTopicRelated) {
        deduped.set(tag, score * 1.5) // bonus for topic-related
      }
    }
  }

  // Sort by pure regex score to compute maxScore (before trust bonus)
  const presorted = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])

  const maxScore = presorted.length > 0 ? presorted[0][1] : 0
  const threshold = maxScore * 0.2 // 20% of max score — baseline cutoff

  // Apply trust bonus to existing tags AFTER maxScore is calculated
  // This prevents existing tags from inflating the threshold
  const existingTags = (opts.existingTags || []).map(t => normalize(t)).filter(Boolean)
  if (existingTags.length > 0) {
    const trustBonus = maxScore * 0.18
    for (const tag of existingTags) {
      const current = deduped.get(tag) || 0
      deduped.set(tag, current + trustBonus)
    }
  }

  // Re-sort after trust bonus
  const sorted = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])

  // Collect word-parts from top-10 tags for cohesion check
  const topParts = new Set()
  for (const [tag] of sorted.slice(0, 10)) {
    for (const p of tag.split('-')) {
      if (p.length > 2) topParts.add(p)
    }
  }

  const result = sorted
    .filter(([tag, score]) => {
      if (score < threshold) return false
      // Outlier filter: only for very low-scoring tags (bottom 15% of max)
      // Skip tags that have no relation to top tags or file topic
      if (score < maxScore * 0.15) {
        const parts = tag.split('-')
        const relatedToTop = parts.some(p => topParts.has(p))
        const relatedToTopic = topicWords.size > 0 && parts.some(p => topicWords.has(p))
        if (!relatedToTop && !relatedToTopic) return false
      }
      return true
    })
    .slice(0, maxTags)
    .map(([tag]) => tag)

  return result
}

/**
 * Extract tag candidates with scores and confidence levels.
 * Used by review mode to present candidates to LLM for validation.
 *
 * @param {string} markdownContent
 * @param {object} [opts] - { id, filePath, existingTags }
 * @param {number} [maxCandidates=30]
 * @returns {{ tag: string, score: number, confidence: 'high'|'medium'|'low', source: 'existing'|'new' }[]}
 */
function extractCandidatesFromText(markdownContent, opts = {}, maxCandidates = 30) {
  // Reuse the same extraction pipeline but capture scores before filtering
  let cleaned = (markdownContent || '').replace(/```[\s\S]*?```/g, '')
  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/g, '')
  cleaned = cleaned.replace(/[a-zA-Z0-9._-]+\.(svc|cluster|local|corp|internal)\b[^\s]*/g, '')
  cleaned = stripTableDataRows(cleaned)

  const scores = new Map()

  function addTerm(term, weight) {
    const normalized = normalize(term)
    if (!normalized) return
    if (ACTION_VERBS.has(normalized)) return
    if (isUrlOrPath(normalized)) return
    if (normalized.length > 2 && !STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
    }
    if (normalized.length > 30) {
      const parts = normalized.split('-').filter(p => p.length > 0)
      for (const part of parts) {
        if (isValidTag(part)) {
          scores.set(part, (scores.get(part) || 0) + weight * 0.5)
        }
      }
    }
  }

  // Same extraction as extractTagsFromText
  const headings = cleaned.match(/^#{1,4}\s+(.+)$/gm) || []
  for (const h of headings) {
    const text = h.replace(/^#+\s+/, '')
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) addTerm(c, 3)
    for (const word of splitWords(text)) addTerm(word, 3)
  }

  const bolds = cleaned.match(/\*\*([^*]+)\*\*/g) || []
  for (const b of bolds) {
    const text = b.replace(/\*\*/g, '')
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) addTerm(c, 2)
    const boldBigrams = text.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []
    for (const bg of boldBigrams) {
      const parts = bg.toLowerCase().split(/\s+/)
      if (parts.some(p => STOPWORDS.has(p) || ACTION_VERBS.has(p))) continue
      addTerm(parts.join('-'), 2)
    }
    for (const word of splitWords(text)) addTerm(word, 2)
  }

  const codes = cleaned.match(/`([^`]+)`/g) || []
  for (const c of codes) {
    const text = c.replace(/`/g, '')
    if (!isUrlOrPath(text)) addTerm(text, 2)
  }

  if (opts.filePath) {
    const kbIdx = opts.filePath.indexOf('knowledge/')
    const relative = (kbIdx >= 0 ? opts.filePath.slice(kbIdx) : opts.filePath)
      .replace(/^knowledge\//, '').replace(/\.md$/, '')
    for (const segment of relative.split('/')) {
      for (const word of segment.split('-')) addTerm(word, 2)
    }
  }
  if (opts.id) {
    for (const word of opts.id.split('-')) addTerm(word, 2)
  }

  const bodyOnly = cleaned
    .replace(/^#{1,4}\s+.+$/gm, '')
    .replace(/\*\*[^*]+\*\*/g, '')
    .replace(/`[^`]+`/g, '')

  const bigrams = bodyOnly.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []
  const bigramCounts = new Map()
  for (const bg of bigrams) {
    const parts = bg.toLowerCase().split(/\s+/)
    if (parts.some(p => STOPWORDS.has(p) || ACTION_VERBS.has(p))) continue
    const compound = parts.join('-')
    if (compound.length > 4) bigramCounts.set(compound, (bigramCounts.get(compound) || 0) + 1)
  }
  for (const [compound, count] of bigramCounts) {
    if (count >= 2) addTerm(compound, 1.5)
  }

  const bodyWords = splitWords(bodyOnly)
  const bodyCounts = new Map()
  for (const w of bodyWords) {
    const n = normalize(w)
    if (n && isValidTag(n)) bodyCounts.set(n, (bodyCounts.get(n) || 0) + 1)
  }
  for (const [word, count] of bodyCounts) {
    if (count >= 2) addTerm(word, 1)
  }

  const deduped = deduplicatePlurals(scores)

  // Build set of normalized existing tags for source tracking
  const existingTagSet = new Set(
    (opts.existingTags || []).map(t => normalize(t)).filter(Boolean)
  )

  // Compute maxScore from pure regex scores (before trust bonus)
  const presorted = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])

  const maxScore = presorted.length > 0 ? presorted[0][1] : 0

  // Apply trust bonus to existing tags for ranking
  if (existingTagSet.size > 0) {
    const trustBonus = maxScore * 0.25
    for (const tag of existingTagSet) {
      const current = deduped.get(tag) || 0
      deduped.set(tag, current + trustBonus)
    }
  }

  const sorted = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCandidates)

  return sorted.map(([tag, score]) => {
    const isExisting = existingTagSet.has(tag)
    // For confidence, use score minus trust bonus to reflect true content support
    const regexScore = isExisting ? Math.max(0, score - maxScore * 0.25) : score
    return {
      tag,
      score: Math.round(score * 100) / 100,
      regex_score: Math.round(regexScore * 100) / 100,
      confidence: regexScore >= maxScore * 0.6 ? 'high'
        : regexScore >= maxScore * 0.3 ? 'medium'
        : 'low',
      source: isExisting ? 'existing' : 'new'
    }
  })
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

module.exports = { extractTagsFromText, extractCandidatesFromText, STOPWORDS, SHORT_KEEP }
