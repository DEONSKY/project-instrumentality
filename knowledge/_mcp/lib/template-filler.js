const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { getTemplatesDir, TYPE_TO_TEMPLATE } = require('./kb-paths')

/**
 * Fill a KB template with chunk content and classification metadata.
 * No LLM — inserts raw chunk text under an "## Imported Content" section
 * and fills frontmatter fields.
 */
function fillTemplate(chunk, classification, sourceFile) {
  const scaffoldType = classification.scaffoldType
  const templateFile = TYPE_TO_TEMPLATE[scaffoldType]
  if (!templateFile) return null

  const templatePath = path.join(getTemplatesDir(), templateFile)
  if (!fs.existsSync(templatePath)) return null

  const raw = fs.readFileSync(templatePath, 'utf8')
  const parsed = matter(raw)
  const today = new Date().toISOString().split('T')[0]

  // Build frontmatter
  const fm = { ...parsed.data }
  const id = classification.suggested_id || 'import-' + chunk.id

  // Replace {{placeholders}} in frontmatter values
  for (const [key, val] of Object.entries(fm)) {
    if (typeof val === 'string') {
      fm[key] = val
        .replace(/\{\{id\}\}/g, id)
        .replace(/\{\{name\}\}/g, id)
        .replace(/\{\{date\}\}/g, today)
        .replace(/\{\{app_scope\}\}/g, 'all')
        .replace(/\{\{owner\}\}/g, '')
    }
  }
  fm.status = 'draft'
  fm.import_source = sourceFile
  fm.import_chunk = chunk.id

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

  // Rebuild file
  return matter.stringify(filledBody, fm)
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

module.exports = { fillTemplate, buildReviewEntry }
