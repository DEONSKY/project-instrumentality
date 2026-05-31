const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { matterStringify } = require('./matter-utils')
const { getTemplatesDir, TYPE_TO_TEMPLATE } = require('./kb-paths')
const { extractTagsFromText } = require('./tag-extract')

// Net structural brace count of a line, ignoring the braces inside {{...}}
// placeholders (so `Table {{name}} {` counts as +1, not +3-2+1).
function netBraces(line) {
  const structural = line.replace(/\{\{[^}]*\}\}/g, '')
  const open = (structural.match(/\{/g) || []).length
  const close = (structural.match(/\}/g) || []).length
  return open - close
}

/**
 * Remove template scaffolding that should never reach a written KB file:
 * HTML authoring-guidance comments, lines bearing unfilled {{placeholders}},
 * and any multi-line placeholder *block* a placeholder line opens (e.g. the
 * DBML `Table {{table_name}} { ... }` example). Section headers, prose, and the
 * inserted `## Imported Content` are kept.
 */
function stripPlaceholders(body) {
  const noComments = body
    .replace(/<!--[\s\S]*?-->/g, '')
    // Collapse multi-line {{ ... }} placeholders onto one line so the per-line
    // removal below catches them (a placeholder split across lines would
    // otherwise survive — the opening line has no closing }} to match).
    .replace(/\{\{[\s\S]*?\}\}/g, m => m.replace(/\s*\n\s*/g, ' '))
  const lines = noComments.split('\n')
  const out = []
  let skipDepth = 0
  for (const line of lines) {
    if (skipDepth > 0) {
      // Inside a placeholder-opened block — drop the line, track its braces.
      skipDepth += netBraces(line)
      if (skipDepth < 0) skipDepth = 0
      continue
    }
    if (/\{\{[^}]*\}\}/.test(line)) {
      const net = netBraces(line)
      if (net > 0) skipDepth = net // this line opens a block to drop
      continue // drop the placeholder line itself
    }
    out.push(line)
  }
  // Collapse runs of blank lines left behind by removals.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n'
}

/**
 * Normalize a KB file's frontmatter + body so it conforms to the canonical
 * structure regardless of how it was produced (deterministic fill OR LLM fill).
 * - forces id/aliases to the resolved id (so frontmatter id == filename)
 * - drops the forbidden `status` field
 * - removes frontmatter fields / array elements that still carry {{placeholders}}
 * - guarantees required fields (id, app_scope, created)
 * - strips residual body placeholders, blocks, and authoring comments
 * Shared by both fill paths — see kb_import.
 */
function normalizeKbFile(fm, body, { id, date } = {}) {
  const out = { ...fm }
  const today = date || new Date().toISOString().split('T')[0]

  if (id) {
    out.id = id
    out.aliases = [id]
  }
  delete out.status // forbidden by lint — workflow state doesn't belong in KB files

  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.includes('{{')) {
      delete out[k]
    } else if (Array.isArray(v)) {
      out[k] = v.filter(x => !(typeof x === 'string' && x.includes('{{')))
    }
  }

  // Required-field guards (lint requires id/app_scope/created).
  if (!out.id && id) out.id = id
  if (!out.app_scope) out.app_scope = 'all'
  if (!out.created) out.created = today

  return { fm: out, body: stripPlaceholders(body) }
}

/**
 * Fill a KB template with chunk content and classification metadata.
 * No LLM — inserts raw chunk text under an "## Imported Content" section
 * and fills frontmatter fields, then normalizes the result.
 */
function fillTemplate(chunk, classification, sourceFile, dependsOn = []) {
  const scaffoldType = classification.scaffoldType
  const templateFile = TYPE_TO_TEMPLATE[scaffoldType]
  if (!templateFile) return null

  const templatePath = path.join(getTemplatesDir(), templateFile)
  if (!fs.existsSync(templatePath)) return null

  const raw = fs.readFileSync(templatePath, 'utf8')
  const parsed = matter(raw)
  const today = new Date().toISOString().split('T')[0]

  // Build frontmatter
  const id = classification.suggested_id || 'import-' + chunk.id

  // Recurse into nested arrays/objects so substitutions reach rules[].id,
  // rules[].detect.hint, etc. Templates quote {{...}} placeholders so YAML
  // parses them as strings; without this recursion the top-level walk would
  // miss nested fields and they'd survive as literal "{{placeholder}}".
  const substitute = (val) => {
    if (typeof val === 'string') {
      return val
        .replace(/\{\{id\}\}/g, id)
        .replace(/\{\{name\}\}/g, id)
        .replace(/\{\{date\}\}/g, today)
        .replace(/\{\{app_scope\}\}/g, 'all')
        .replace(/\{\{owner\}\}/g, '')
    }
    if (Array.isArray(val)) return val.map(substitute)
    if (val && typeof val === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(val)) out[k] = substitute(v)
      return out
    }
    return val
  }
  let fm = substitute({ ...parsed.data })

  fm.import_source = sourceFile
  fm.import_chunk = chunk.id
  if (dependsOn.length > 0) {
    fm.depends_on = [...new Set([...(fm.depends_on || []), ...dependsOn])]
  }

  // Auto-extract tags from imported content
  const extractedTags = extractTagsFromText(chunk.text, { id })
  const existingTags = Array.isArray(fm.tags) ? fm.tags : []
  fm.tags = [...new Set([...existingTags, ...extractedTags])]

  // Build body: insert imported content after first heading, preserve rest
  const body = parsed.content
  const sections = body.split(/(?=\n## )/)

  let filledBody
  if (sections.length > 1) {
    // Insert after first section (usually Description/Overview)
    const importedSection = `\n## Imported Content\n\n${chunk.text}\n`
    filledBody = sections[0] + importedSection + sections.slice(1).join('')
  } else {
    filledBody = body + `\n## Imported Content\n\n${chunk.text}\n`
  }

  // Normalize: force identity, drop placeholders/status, strip body scaffolding.
  const normalized = normalizeKbFile(fm, filledBody, { id, date: today })

  // Rebuild file
  return matterStringify(normalized.body, normalized.fm)
}

/**
 * Build a markdown entry for the import-review queue.
 */
function buildReviewEntry(chunk, classification, sourceFile) {
  const heading = chunk.heading || `Chunk ${chunk.id}`
  const bestGuess = classification.type || 'unknown'
  const confidence = classification.confidence || 0
  const preview = chunk.text.slice(0, 500)

  return [
    `### ${heading}`,
    `- **Source:** ${sourceFile} — ${chunk.page_hint || chunk.id}`,
    `- **Best guess:** ${bestGuess} (confidence: ${confidence.toFixed(2)})`,
    `- **Reason:** ${classification.reason || 'N/A'}`,
    '',
    '```',
    preview,
    '```',
    ''
  ].join('\n')
}

module.exports = { fillTemplate, buildReviewEntry, normalizeKbFile, stripPlaceholders }
