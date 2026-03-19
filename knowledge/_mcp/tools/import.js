const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: reindex } = require('./reindex')

const SUPPORTED_FORMATS = ['.pdf', '.docx', '.md', '.txt', '.html']
const CONFIDENCE_THRESHOLD = 0.6
const IMPORT_REVIEW_PATH = 'knowledge/sync/import-review.md'

/**
 * kb_import — Two-phase document import.
 *
 * Phase 1 (no files_to_write): Extract and chunk the source document.
 *   Returns { chunks, classify_prompts } — agent classifies each chunk using
 *   the prompts and resolves target paths, then calls kb_import({ source, files_to_write }).
 *
 * Phase 2 (with files_to_write): Write the agent-generated files.
 *   files_to_write: [{ path, content }]
 *   Never overwrites existing KB files.
 */
async function runTool({ source, dry_run = false, files_to_write } = {}) {
  // ── Phase 2: write agent-generated files ──────────────────────────────────
  if (files_to_write && Array.isArray(files_to_write)) {
    return applyImportFiles(files_to_write, dry_run)
  }

  // ── Phase 1: extract, chunk, build classify prompts ───────────────────────
  if (!source || !fs.existsSync(source)) {
    return { error: `Source file not found: ${source}` }
  }

  let text
  try {
    text = await extractText(source)
  } catch (e) {
    return { error: e.message }
  }

  const chunks = chunkDocument(text)
  if (chunks.length === 0) {
    return { error: 'No content chunks extracted from document.' }
  }

  // Build classify_prompts — agent processes each and determines type + suggested_id
  const classify_prompts = chunks.map(chunk => {
    const prompt = resolvePrompt('import-classify', {
      chunk_text: chunk.text.slice(0, 1500),
      chunk_id: chunk.page_hint,
      source_file: path.basename(source),
      existing_kb: ''
    })
    return { chunk_id: chunk.id, heading: chunk.heading, page_hint: chunk.page_hint, prompt }
  })

  return {
    source,
    chunks,
    classify_prompts,
    _instruction: [
      'For each chunk in classify_prompts[], use the prompt to classify it (type, suggested_id, confidence, duplicate_of).',
      `Chunks with confidence < ${CONFIDENCE_THRESHOLD} or type="unclassified" should be appended to ${IMPORT_REVIEW_PATH}.`,
      'For each confident chunk, load the matching template from knowledge/_templates/ and use import-map prompt to fill it.',
      `Then call kb_import({ source: "${source}", files_to_write: [{ path, content }] }) to write all files at once.`
    ].join(' ')
  }
}

async function applyImportFiles(files_to_write, dry_run) {
  const written = []
  const skipped = []

  for (const { path: filePath, content } of files_to_write) {
    if (!filePath || !content) continue

    // Never overwrite existing KB files
    if (fs.existsSync(filePath)) {
      skipped.push({ path: filePath, reason: 'already exists' })
      continue
    }

    if (!dry_run) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content, 'utf8')
      written.push(filePath)
    } else {
      written.push(filePath + ' (dry_run)')
    }
  }

  if (!dry_run && written.length > 0) {
    await reindex({ silent: true })
  }

  return {
    summary: {
      total_files: files_to_write.length,
      written: written.length,
      skipped: skipped.length
    },
    written,
    skipped,
    dry_run
  }
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(`Unsupported format: ${ext}. Supported: ${SUPPORTED_FORMATS.join(', ')}`)
  }
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }
  return fs.readFileSync(filePath, 'utf8')
}

function chunkDocument(text) {
  const chunks = []
  const sections = text.split(/\n#{1,3} /)
  sections.forEach((section, i) => {
    if (section.trim().length < 50) return
    const lines = section.trim().split('\n')
    chunks.push({
      id: `chunk-${i + 1}`,
      heading: lines[0].replace(/^#+\s*/, '').trim(),
      text: lines.slice(1).join('\n').trim() || lines[0],
      page_hint: `section ${i + 1}`
    })
  })
  if (chunks.length === 0) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 80)
    paragraphs.forEach((para, i) => {
      chunks.push({ id: `chunk-${i + 1}`, heading: '', text: para.trim(), page_hint: `paragraph ${i + 1}` })
    })
  }
  return chunks
}

module.exports = { runTool }
