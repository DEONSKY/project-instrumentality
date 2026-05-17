// Tag extraction algorithm.
//
// Three public extractors:
//   - extractTagsFromText        : returns final tag list (autotag fast mode)
//   - extractCandidatesFromText  : returns scored candidates with confidence (review mode)
//   - extractBodyWordsFromContent: returns body word set (corpus IDF building)
//
// Constants and helpers live in lib/tag-model.js. STOPWORDS / SHORT_KEEP are
// re-exported here to preserve the previously-documented public surface.

const {
  STOPWORDS,
  ACTION_VERBS,
  SHORT_KEEP,
  normalize,
  splitWords,
  isUrlOrPath,
  isLikelyGerund,
  isValidTag,
  deduplicatePlurals,
  extractTopicWords,
  stripTableDataRows,
  computeTargetCount,
  findKnownCompounds,
  findLowercaseBigrams
} = require('./tag-model')

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

module.exports = {
  extractTagsFromText,
  extractCandidatesFromText,
  extractBodyWordsFromContent,
  // Re-exported for backward compatibility — see lib/tag-model.js for source.
  STOPWORDS,
  SHORT_KEEP
}
