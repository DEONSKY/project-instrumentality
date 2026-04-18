const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { matterStringify } = require('../lib/matter-utils')
const { runTool: reindex } = require('./reindex')
const { extractTagsFromText, extractCandidatesFromText, extractBodyWordsFromContent } = require('../lib/tag-extract')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

async function runTool({ file_path, mode, tags, skipReindex } = {}) {
  const effectiveMode = mode || 'fast'

  // Mode: apply — write LLM-reviewed tags directly
  if (effectiveMode === 'apply') {
    return applyReviewedTags(tags, skipReindex)
  }

  const files = resolveFiles(file_path)
  if (files.error) return files

  // Mode: review — return candidates for LLM validation, don't write
  if (effectiveMode === 'review') {
    return buildReview(files)
  }

  // Mode: fast — extract and overwrite tags
  return fastTag(files, skipReindex)
}

/**
 * Build a set of body-text words that appear in too many KB files to be
 * meaningful tags. Always computed fresh from the entire KB so single-file
 * writes still benefit from corpus-wide filtering.
 *
 * Thresholds scale with KB size:
 *   0–5 files   → skipped (corpus too small)
 *   6–15 files  → block words appearing in >70% of files
 *   16–50 files → >50%
 *   50+ files   → >40%
 */
function buildCorpusFilter() {
  const allFiles = collectMdFiles(KB_ROOT)
  const totalFiles = allFiles.length
  if (totalFiles < 6) return { blockedWords: new Set(), knownCompounds: new Set() }

  // Body-word IDF: a term appearing in too many files as body text is generic.
  // More aggressive than before (was 0.70/0.50/0.40).
  const bodyRatio = totalFiles <= 15 ? 0.60 : totalFiles <= 50 ? 0.40 : 0.30

  const wordFileCount = new Map()
  // Tracks tokens that appear as *parts* of distinct compound tags across the KB.
  // If `line` is a component of line-code, line-definitions, buffer-line, is-f2-line,
  // it's a category label, not a meaningful standalone tag.
  const tagPartDocs = new Map() // token -> Set of distinct compound tags it appears in
  const knownCompounds = new Set() // compound tags seen anywhere in the corpus

  for (const fp of allFiles) {
    let content
    try { content = fs.readFileSync(fp, 'utf8') } catch { continue }
    let parsed
    try { parsed = matter(content) } catch { continue }

    const words = extractBodyWordsFromContent(parsed.content)
    for (const w of words) {
      wordFileCount.set(w, (wordFileCount.get(w) || 0) + 1)
    }

    const existingTags = Array.isArray(parsed.data?.tags) ? parsed.data.tags : []
    for (const tag of existingTags) {
      if (typeof tag !== 'string') continue
      const lower = tag.toLowerCase()
      const parts = lower.split('-').filter(p => p.length > 2)
      if (parts.length < 2) continue // only compounds tell us a token is a category label
      knownCompounds.add(lower)
      for (const p of parts) {
        if (!tagPartDocs.has(p)) tagPartDocs.set(p, new Set())
        tagPartDocs.get(p).add(lower)
      }
    }
  }

  const blocked = new Set()
  for (const [word, count] of wordFileCount) {
    if (count / totalFiles > bodyRatio) blocked.add(word)
  }
  // Block any single-token that's a component of 4+ distinct compound tags —
  // self-tuning replacement for a hardcoded ["line","management","admin",...] list.
  for (const [token, compounds] of tagPartDocs) {
    if (compounds.size >= 4) blocked.add(token)
  }
  return { blockedWords: blocked, knownCompounds }
}

/**
 * Fast mode: regex-extract tags and overwrite frontmatter.
 */
async function fastTag(files, skipReindex) {
  const { blockedWords, knownCompounds } = buildCorpusFilter()

  let tagged = 0
  let unchanged = 0
  const failures = []
  const sample = {}

  for (const fp of files) {
    const rel = fp.replace(/^knowledge\//, '')
    const result = processFile(fp, blockedWords, knownCompounds)
    if (!result) {
      failures.push({ file: rel, reason: 'unknown skip (no return value)' })
      continue
    }
    if (result.error) {
      failures.push({ file: rel, reason: result.error })
      continue
    }
    if (result.changed) {
      tagged++
      if (Object.keys(sample).length < 5) {
        sample[rel] = result.tags
      }
    } else {
      unchanged++
    }
  }

  if (tagged > 0 && !skipReindex) {
    await reindex({ silent: true })
  }

  return {
    mode: 'fast',
    tagged,
    unchanged,
    failed: failures.length,
    files_scanned: files.length,
    sample,
    failures
  }
}

/**
 * Review mode: return scored candidates grouped by source and confidence.
 * Shows preserved (existing with content support), new candidates, and possibly stale tags.
 * Does NOT write any tags.
 */
function buildReview(files) {
  const { blockedWords, knownCompounds } = buildCorpusFilter()
  const review = {}
  const failures = []

  for (const fp of files) {
    const rel = fp.replace(/^knowledge\//, '')
    let content
    try {
      content = fs.readFileSync(fp, 'utf8')
    } catch (err) {
      failures.push({ file: rel, reason: `read failed: ${err.message}` })
      continue
    }

    let parsed
    try {
      parsed = matter(content)
    } catch (err) {
      failures.push({ file: rel, reason: `yaml parse failed: ${err.message}` })
      continue
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      failures.push({ file: rel, reason: 'missing or invalid frontmatter' })
      continue
    }

    const id = parsed.data.id || path.basename(fp, '.md')
    const existingTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : []
    const candidatesResult = extractCandidatesFromText(parsed.content, { id, filePath: fp, existingTags, blockedWords, knownCompounds })
    const candidates = candidatesResult.candidates
    const maxScoreAll = candidatesResult.maxScore

    // Categorize candidates
    const preserved = []      // existing tags with content support
    const possiblyStale = []  // existing tags with zero/very low regex score
    const newCandidates = { high: [], medium: [], low: [] }

    // Phase 2 #6: weak-support threshold for stale detection. An existing tag
    // with regex_score below 10% of the overall max is effectively unsupported
    // by current content — challenge it instead of silently preserving.
    const staleFloor = maxScoreAll * 0.10

    for (const c of candidates) {
      if (c.source === 'existing') {
        if (c.regex_score >= staleFloor) {
          preserved.push(c.tag)
        } else {
          possiblyStale.push(c.tag)
        }
      } else {
        newCandidates[c.confidence].push(c.tag)
      }
    }

    // Check for existing tags that didn't appear in candidates at all (completely gone from content)
    const candidateTags = new Set(candidates.map(c => c.tag))
    for (const tag of existingTags) {
      const normalized = tag.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      if (normalized && !candidateTags.has(normalized)) {
        possiblyStale.push(normalized)
      }
    }

    // Extract topic from folder + id for context
    const folder = path.dirname(rel)
    const topic = `${folder}/${id}`.replace(/\//g, ' ').replace(/-/g, ' ').trim()

    review[rel] = { topic, preserved, new_candidates: newCandidates, possibly_stale: possiblyStale }
  }

  return {
    mode: 'review',
    files_reviewed: Object.keys(review).length,
    failed: failures.length,
    failures,
    review,
    _instruction: 'For each file: PRESERVED tags have strong content support (>=10% of max score). NEW CANDIDATES are grouped: HIGH = strong score from a heading/code/path/known-compound (take unless wrong); MEDIUM = moderate support (review); LOW = weak support (skeptical default). POSSIBLY STALE = existing tags below the weak-support floor — challenge them. You may also suggest up to 3 missing tags per file. Then call kb_autotag with mode "apply" and tags parameter: { "file/path.md": ["tag1", ...] }.'
  }
}

/**
 * Apply mode: write LLM-reviewed tags directly to frontmatter.
 */
async function applyReviewedTags(tagsMap, skipReindex) {
  if (!tagsMap || typeof tagsMap !== 'object') {
    return { error: 'tags parameter is required for apply mode. Provide a map of file_path -> tag array.' }
  }

  let applied = 0
  let errors = 0
  const results = {}

  for (const [filePath, tagList] of Object.entries(tagsMap)) {
    if (!Array.isArray(tagList)) {
      results[filePath] = { error: 'tags must be an array of strings' }
      errors++
      continue
    }

    const full = filePath.startsWith(KB_ROOT) ? filePath : path.join(KB_ROOT, filePath)
    if (!fs.existsSync(full)) {
      results[filePath] = { error: 'file not found' }
      errors++
      continue
    }

    try {
      const content = fs.readFileSync(full, 'utf8')
      const parsed = matter(content)

      // Normalize and validate tags
      const cleanTags = tagList
        .filter(t => typeof t === 'string' && t.length > 0)
        .map(t => t.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
        .filter(t => t.length > 0)

      const uniqueTags = [...new Set(cleanTags)]

      parsed.data.tags = uniqueTags
      const updated = matterStringify(parsed.content, parsed.data)
      fs.writeFileSync(full, updated, 'utf8')

      results[filePath] = { tags: uniqueTags, count: uniqueTags.length }
      applied++
    } catch (err) {
      results[filePath] = { error: err.message }
      errors++
    }
  }

  if (applied > 0 && !skipReindex) {
    await reindex({ silent: true })
  }

  return {
    mode: 'apply',
    applied,
    errors,
    results
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

/**
 * Process a single file: extract tags and overwrite frontmatter.
 * Tags are system-owned — full replacement, no merge.
 */
function processFile(filePath, blockedWords, knownCompounds) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    return { error: `read failed: ${err.message}` }
  }

  let parsed
  try {
    parsed = matter(content)
  } catch (err) {
    return { error: `yaml parse failed: ${err.message}` }
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { error: 'missing or invalid frontmatter' }
  }

  const existingTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : []
  const extractedTags = extractTagsFromText(parsed.content, {
    id: parsed.data.id,
    filePath,
    existingTags,
    blockedWords,
    knownCompounds
  })

  // Tags with trust bonus applied — existing tags survive if content supports them
  const tagsChanged = extractedTags.length !== existingTags.length ||
    !extractedTags.every((t, i) => existingTags[i] === t)

  if (!tagsChanged) {
    return { changed: false, tags: existingTags }
  }

  parsed.data.tags = extractedTags
  const updated = matterStringify(parsed.content, parsed.data)
  fs.writeFileSync(filePath, updated, 'utf8')

  return { changed: true, tags: extractedTags }
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

module.exports = {
  runTool,
  definition: {
    name: 'kb_autotag',
    description: 'Auto-extract and manage tags for KB files. Tags are system-owned and overwritten on each run. Modes: "fast" (regex extraction, auto-applied), "review" (returns scored candidates for LLM validation), "apply" (writes LLM-reviewed tags to frontmatter).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to a single KB file (e.g. knowledge/features/auth.md), or "all" to tag the entire KB. Default: all. Used by fast and review modes.' },
        mode: { type: 'string', enum: ['fast', 'review', 'apply'], description: 'fast: regex-extract and overwrite tags (default). review: return scored candidates grouped by confidence for LLM validation. apply: write LLM-reviewed tags from the tags parameter.' },
        tags: { type: 'object', description: 'For mode=apply only. Map of file_path to tag array, e.g. { "features/auth.md": ["auth", "session", "jwt"] }.' }
      }
    }
  }
}
