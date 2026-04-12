const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { matterStringify } = require('../lib/matter-utils')
const { runTool: reindex } = require('./reindex')
const { extractTagsFromText, extractCandidatesFromText } = require('../lib/tag-extract')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

async function runTool({ file_path, mode, tags } = {}) {
  const effectiveMode = mode || 'fast'

  // Mode: apply — write LLM-reviewed tags directly
  if (effectiveMode === 'apply') {
    return applyReviewedTags(tags)
  }

  const files = resolveFiles(file_path)
  if (files.error) return files

  // Mode: review — return candidates for LLM validation, don't write
  if (effectiveMode === 'review') {
    return buildReview(files)
  }

  // Mode: fast — extract and overwrite tags
  return fastTag(files)
}

/**
 * Fast mode: regex-extract tags and overwrite frontmatter.
 */
async function fastTag(files) {
  let tagged = 0
  let skipped = 0
  let totalTagsChanged = 0
  const sample = {}

  for (const fp of files) {
    const result = processFile(fp)
    if (!result) {
      skipped++
      continue
    }
    if (result.changed) {
      tagged++
      totalTagsChanged += result.tags.length
      if (Object.keys(sample).length < 5) {
        const rel = fp.replace(/^knowledge\//, '')
        sample[rel] = result.tags
      }
    }
  }

  if (tagged > 0) {
    await reindex({ silent: true })
  }

  return {
    mode: 'fast',
    tagged,
    skipped,
    files_scanned: files.length,
    sample
  }
}

/**
 * Review mode: return scored candidates grouped by source and confidence.
 * Shows preserved (existing with content support), new candidates, and possibly stale tags.
 * Does NOT write any tags.
 */
function buildReview(files) {
  const review = {}

  for (const fp of files) {
    let content
    try { content = fs.readFileSync(fp, 'utf8') } catch { continue }

    let parsed
    try {
      parsed = matter(content)
      if (!parsed.data || typeof parsed.data !== 'object') continue
    } catch { continue }

    const id = parsed.data.id || path.basename(fp, '.md')
    const existingTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : []
    const candidates = extractCandidatesFromText(parsed.content, { id, filePath: fp, existingTags })

    const rel = fp.replace(/^knowledge\//, '')

    // Categorize candidates
    const preserved = []      // existing tags with content support
    const possiblyStale = []  // existing tags with zero/very low regex score
    const newCandidates = { high: [], medium: [], low: [] }

    for (const c of candidates) {
      if (c.source === 'existing') {
        if (c.regex_score > 0) {
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
    review,
    _instruction: 'For each file: PRESERVED tags have content support and should be kept unless you disagree. NEW CANDIDATES are grouped by confidence — review MEDIUM and LOW tags, decide KEEP or DROP. POSSIBLY STALE tags exist in frontmatter but have weak/no content support — consider removing them. You may suggest up to 3 missing tags per file. Then call kb_autotag with mode "apply" and tags parameter: { "file/path.md": ["tag1", ...] }.'
  }
}

/**
 * Apply mode: write LLM-reviewed tags directly to frontmatter.
 */
async function applyReviewedTags(tagsMap) {
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

  if (applied > 0) {
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
  const extractedTags = extractTagsFromText(parsed.content, {
    id: parsed.data.id,
    filePath,
    existingTags
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

module.exports = { runTool }
