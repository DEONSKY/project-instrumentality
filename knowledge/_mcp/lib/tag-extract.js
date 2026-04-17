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

function isLikelyGerund(term) {
  if (!term || term.length <= 5) return false
  if (!term.endsWith('ing')) return false
  if (SHORT_KEEP.has(term)) return false
  if (GERUND_WHITELIST.has(term)) return false
  // Compound terms (have a hyphen) are handled separately — don't reject them here
  if (term.includes('-')) return false
  return true
}

const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl',
  'jpa', 'mvc', 'spa', 'ssr', 'csr', 'plc', 'ldap', 'mab', 'mui', 'jms',
  'http', 'rest', 'grpc', 'amqp', 'smtp', 'imap', 'ftp', 'tcp', 'udp'
])

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
 * Extract tags from markdown text content.
 * Pure string operations — no LLM, no disk I/O.
 *
 * @param {string} markdownContent - raw markdown body (no frontmatter)
 * @param {object} [opts] - { id, filePath, existingTags, blockedWords, knownCompounds }
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
  const blockedWords = opts.blockedWords instanceof Set ? opts.blockedWords : null
  const knownCompounds = opts.knownCompounds instanceof Set ? opts.knownCompounds : null

  // Phase 2 #3: Phrase-first pass — seed compound hits and mask them out of `cleaned`
  // so the single-word passes don't double-count the parts.
  const compoundResult = findKnownCompounds(cleaned, knownCompounds)
  cleaned = compoundResult.cleaned
  for (const [compound, count] of compoundResult.hits) {
    // Weight 2.5: between bold (2) and heading (3). Multiplied by occurrence count
    // so frequent matches outrank one-offs.
    scores.set(compound, (scores.get(compound) || 0) + 2.5 * Math.min(count, 3))
  }

  function addTerm(term, weight) {
    const normalized = normalize(term)
    if (!normalized) return
    if (ACTION_VERBS.has(normalized)) return
    if (isLikelyGerund(normalized)) return
    if (isUrlOrPath(normalized)) return
    // Corpus-generic single tokens are blocked everywhere (headings, filenames, body).
    // Compound tags like "line-code" pass through because they contain a hyphen.
    if (blockedWords && !normalized.includes('-') && blockedWords.has(normalized)) return
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

  // File path and id (weight 2). Phase 2 #3: if the segment/id is itself a
  // compound tag we already know about, add only the compound — don't split it
  // into constituent tokens. Otherwise, fall back to split-for-topic behavior.
  const addSegment = (seg) => {
    if (!seg) return
    if (seg.includes('-') && knownCompounds && knownCompounds.has(seg)) {
      addTerm(seg, 2)
      return
    }
    if (seg.includes('-')) {
      addTerm(seg, 2) // add the compound itself too
    }
    for (const word of seg.split('-')) {
      addTerm(word, 2)
    }
  }
  if (opts.filePath) {
    const kbIdx = opts.filePath.indexOf('knowledge/')
    const relative = (kbIdx >= 0 ? opts.filePath.slice(kbIdx) : opts.filePath)
      .replace(/^knowledge\//, '').replace(/\.md$/, '')
    for (const segment of relative.split('/')) addSegment(segment)
  }
  if (opts.id) addSegment(opts.id)

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

  // Phase 2 #3: Lowercase bigram pass — catches emerging compounds that aren't
  // yet known and aren't Title Case (e.g. "data fetching", "soft delete").
  const lcBigrams = findLowercaseBigrams(bodyOnly, blockedWords)
  for (const [compound] of lcBigrams) {
    addTerm(compound, 1.5)
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
      if (blockedWords && blockedWords.has(word)) continue
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

  // Phase 2 #5: Adaptive backfill — always target at least `targetCount` tags.
  // Outlier filter still applies so backfill can't drag in unrelated noise.
  const targetCount = computeTargetCount(markdownContent)

  const passesOutlier = (tag, score) => {
    if (score >= maxScore * 0.15) return true
    const parts = tag.split('-')
    const relatedToTop = parts.some(p => topParts.has(p))
    const relatedToTopic = topicWords.size > 0 && parts.some(p => topicWords.has(p))
    return relatedToTop || relatedToTopic
  }

  const above = []
  const below = []
  for (const [tag, score] of sorted) {
    if (!passesOutlier(tag, score)) continue
    if (score >= threshold) above.push(tag)
    else below.push(tag)
  }

  let result = above.slice(0, maxTags)
  if (result.length < targetCount) {
    for (const tag of below) {
      if (result.length >= Math.min(maxTags, targetCount)) break
      result.push(tag)
    }
  }

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
  const weightFlags = new Map() // tag -> Set<'heading'|'bold'|'code'|'path'|'body'|'compound'>
  const compoundCounts = new Map() // compound -> occurrence count from findKnownCompounds
  const blockedWords = opts.blockedWords instanceof Set ? opts.blockedWords : null
  const knownCompounds = opts.knownCompounds instanceof Set ? opts.knownCompounds : null

  // Phase 2 #3: Phrase-first pass
  const compoundResult = findKnownCompounds(cleaned, knownCompounds)
  cleaned = compoundResult.cleaned
  for (const [compound, count] of compoundResult.hits) {
    scores.set(compound, (scores.get(compound) || 0) + 2.5 * Math.min(count, 3))
    if (!weightFlags.has(compound)) weightFlags.set(compound, new Set())
    weightFlags.get(compound).add('compound')
    compoundCounts.set(compound, count)
  }

  function flag(tag, source) {
    if (!weightFlags.has(tag)) weightFlags.set(tag, new Set())
    weightFlags.get(tag).add(source)
  }

  function addTerm(term, weight, source) {
    const normalized = normalize(term)
    if (!normalized) return
    if (ACTION_VERBS.has(normalized)) return
    if (isLikelyGerund(normalized)) return
    if (isUrlOrPath(normalized)) return
    if (blockedWords && !normalized.includes('-') && blockedWords.has(normalized)) return
    if (normalized.length > 2 && !STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
      if (source) flag(normalized, source)
    }
    if (normalized.length > 30) {
      const parts = normalized.split('-').filter(p => p.length > 0)
      for (const part of parts) {
        if (isValidTag(part)) {
          scores.set(part, (scores.get(part) || 0) + weight * 0.5)
          if (source) flag(part, source)
        }
      }
    }
  }

  // Same extraction as extractTagsFromText
  const headings = cleaned.match(/^#{1,4}\s+(.+)$/gm) || []
  for (const h of headings) {
    const text = h.replace(/^#+\s+/, '')
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) addTerm(c, 3, 'heading')
    for (const word of splitWords(text)) addTerm(word, 3, 'heading')
  }

  const bolds = cleaned.match(/\*\*([^*]+)\*\*/g) || []
  for (const b of bolds) {
    const text = b.replace(/\*\*/g, '')
    const compounds = text.match(/[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) || []
    for (const c of compounds) addTerm(c, 2, 'bold')
    const boldBigrams = text.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []
    for (const bg of boldBigrams) {
      const parts = bg.toLowerCase().split(/\s+/)
      if (parts.some(p => STOPWORDS.has(p) || ACTION_VERBS.has(p))) continue
      addTerm(parts.join('-'), 2, 'bold')
    }
    for (const word of splitWords(text)) addTerm(word, 2, 'bold')
  }

  const codes = cleaned.match(/`([^`]+)`/g) || []
  for (const c of codes) {
    const text = c.replace(/`/g, '')
    if (!isUrlOrPath(text)) addTerm(text, 2, 'code')
  }

  const addSegment = (seg) => {
    if (!seg) return
    if (seg.includes('-') && knownCompounds && knownCompounds.has(seg)) {
      addTerm(seg, 2, 'path')
      return
    }
    if (seg.includes('-')) {
      addTerm(seg, 2, 'path')
    }
    for (const word of seg.split('-')) addTerm(word, 2, 'path')
  }
  if (opts.filePath) {
    const kbIdx = opts.filePath.indexOf('knowledge/')
    const relative = (kbIdx >= 0 ? opts.filePath.slice(kbIdx) : opts.filePath)
      .replace(/^knowledge\//, '').replace(/\.md$/, '')
    for (const segment of relative.split('/')) addSegment(segment)
  }
  if (opts.id) addSegment(opts.id)

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
    if (count >= 2) addTerm(compound, 1.5, 'body')
  }

  // Phase 2 #3: Lowercase bigram pass
  const lcBigrams = findLowercaseBigrams(bodyOnly, blockedWords)
  for (const [compound] of lcBigrams) {
    addTerm(compound, 1.5, 'body')
  }

  const bodyWords = splitWords(bodyOnly)
  const bodyCounts = new Map()
  for (const w of bodyWords) {
    const n = normalize(w)
    if (n && isValidTag(n)) bodyCounts.set(n, (bodyCounts.get(n) || 0) + 1)
  }
  for (const [word, count] of bodyCounts) {
    if (count >= 2) {
      if (blockedWords && blockedWords.has(word)) continue
      addTerm(word, 1, 'body')
    }
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

  const maxScoreAll = presorted.length > 0 ? presorted[0][1] : 0

  // Phase 2 #6: compute a *new-candidate-only* max so confidence for new tags
  // isn't crushed by existing-tag trust bonus.
  let maxScoreNew = 0
  for (const [tag, score] of presorted) {
    if (!existingTagSet.has(tag) && score > maxScoreNew) maxScoreNew = score
  }
  if (maxScoreNew === 0) maxScoreNew = maxScoreAll

  // Apply trust bonus to existing tags for ranking
  if (existingTagSet.size > 0) {
    const trustBonus = maxScoreAll * 0.25
    for (const tag of existingTagSet) {
      const current = deduped.get(tag) || 0
      deduped.set(tag, current + trustBonus)
    }
  }

  // Phase 2 #5: give review mode more headroom for sparse files
  const targetCount = computeTargetCount(markdownContent)
  const capCandidates = Math.max(maxCandidates, targetCount * 3)

  const sorted = [...deduped.entries()]
    .filter(([tag]) => isValidTag(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, capCandidates)

  const topicWords = extractTopicWords(opts)

  const candidates = sorted.map(([tag, score]) => {
    const isExisting = existingTagSet.has(tag)
    // For confidence, use score minus trust bonus to reflect true content support
    const regexScore = isExisting ? Math.max(0, score - maxScoreAll * 0.25) : score
    const flags = weightFlags.get(tag) || new Set()
    const strongSource = flags.has('heading') || flags.has('code') || flags.has('path') || flags.has('compound')

    let confidence
    if (isExisting) {
      // Existing tags: measure against maxScoreAll as before
      confidence = regexScore >= maxScoreAll * 0.6 ? 'high'
        : regexScore >= maxScoreAll * 0.3 ? 'medium'
        : 'low'
    } else {
      // New tags: measure against maxScoreNew so a top new candidate can reach 'high'
      const highFloor = maxScoreNew * 0.6
      const medFloor = maxScoreNew * 0.3
      if (regexScore >= highFloor && strongSource) confidence = 'high'
      else if (regexScore >= medFloor) confidence = 'medium'
      else if (regexScore >= highFloor) confidence = 'medium'  // high score, weak source
      else confidence = 'low'
    }

    // Phase 2 #6 follow-up: compound tags need topic cohesion + frequency/structure
    // to reach 'high'. Cross-domain compounds (e.g. mentioned once in prose) leak
    // through findKnownCompounds's corpus match, so gate them here.
    if (!isExisting && flags.has('compound') && confidence === 'high') {
      const count = compoundCounts.get(tag) || 0
      const gateFrequency = count >= 2 || flags.has('heading') || flags.has('code')
      const parts = tag.split('-')
      const gateTopic = flags.has('heading')
        || parts.some(p => topicWords.has(p))
        || parts.some(p => existingTagSet.has(p))
      if (!(gateFrequency && gateTopic)) {
        confidence = (gateFrequency || gateTopic) ? 'medium' : 'low'
      }
    }

    // Single-word new tags need a topic anchor to reach 'high'. Without this,
    // generic infra words (thread, environment) ride raw body/header frequency
    // into high in docs where they have no topical support — e.g. "Environment"
    // column headers repeated across every integration's URL table.
    if (!isExisting && !tag.includes('-') && confidence === 'high') {
      const hasTopicAnchor = flags.has('heading')
        || topicWords.has(tag)
        || existingTagSet.has(tag)
      if (!hasTopicAnchor) {
        confidence = 'medium'
      }
    }

    // Rescue 'low' → 'medium' for multi-occurrence body words. Flow docs don't
    // repeat domain terms in headings (they describe steps), so words like
    // "filter" appearing 3+ times in step text / Guards / States stall in low
    // despite being legitimate topical signals. STOPWORDS already screens out
    // generic prose, so frequency alone is a safe promotion signal here.
    if (!isExisting && confidence === 'low' && !tag.includes('-')) {
      const bodyCount = bodyCounts.get(tag) || 0
      if (bodyCount >= 3) {
        confidence = 'medium'
      }
    }

    return {
      tag,
      score: Math.round(score * 100) / 100,
      regex_score: Math.round(regexScore * 100) / 100,
      confidence,
      source: isExisting ? 'existing' : 'new',
      sources: [...flags]
    }
  })

  return { candidates, maxScore: maxScoreAll, maxScoreNew }
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

/**
 * Extract body-text words from markdown content for corpus frequency analysis.
 * Returns the unique set of valid body words in a single file (weight-1 candidates).
 * Mirrors the body-text processing in extractTagsFromText so the corpus filter
 * matches exactly what the extractor would emit from body text.
 */
function extractBodyWordsFromContent(markdownContent) {
  let cleaned = (markdownContent || '').replace(/```[\s\S]*?```/g, '')
  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/g, '')
  cleaned = cleaned.replace(/[a-zA-Z0-9._-]+\.(svc|cluster|local|corp|internal)\b[^\s]*/g, '')
  cleaned = stripTableDataRows(cleaned)

  const bodyOnly = cleaned
    .replace(/^#{1,4}\s+.+$/gm, '')
    .replace(/\*\*[^*]+\*\*/g, '')
    .replace(/`[^`]+`/g, '')

  const words = new Set()
  for (const w of splitWords(bodyOnly)) {
    const n = normalize(w)
    if (n && isValidTag(n)) words.add(n)
  }
  return words
}

module.exports = { extractTagsFromText, extractCandidatesFromText, extractBodyWordsFromContent, STOPWORDS, SHORT_KEEP }
