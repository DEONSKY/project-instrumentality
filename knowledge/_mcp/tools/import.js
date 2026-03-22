const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: reindex } = require('./reindex')
const { CLASSIFY_TYPE_TO_SCAFFOLD, resolveFilePath, isSingletonType } = require('../lib/kb-paths')
const { fillTemplate, buildReviewEntry } = require('../lib/template-filler')

const SUPPORTED_FORMATS = ['.pdf', '.docx', '.md', '.txt', '.html']
const CONFIDENCE_THRESHOLD = 0.6
const IMPORT_REVIEW_PATH = 'knowledge/sync/import-review.md'
const BATCH_SIZE = 5
const SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ── Session cache for paginated auto_classify ────────────────────────────────
// Keyed by source path. Stores chunks + accumulated classifications.
const sessions = new Map()

function getSession(source) {
  const session = sessions.get(source)
  if (!session) return null
  if (Date.now() - session.created > SESSION_TTL_MS) {
    sessions.delete(source)
    return null
  }
  return session
}

function clearSession(source) {
  sessions.delete(source)
}

/**
 * kb_import — Document import with two modes.
 *
 * Classic mode (no auto_classify):
 *   Phase 1 (no files_to_write): Extract and chunk the source document.
 *     Returns { chunks, classify_prompts } — agent classifies each chunk.
 *   Phase 2 (with files_to_write): Write the agent-generated files.
 *
 * Auto-classify mode (auto_classify: true):
 *   Paginated — returns chunks in batches of 5 with classify prompts.
 *   Agent classifies each batch and calls back with classifications + cursor.
 *   On the final batch, server writes all files and returns a summary.
 *   Combine with dry_run: true to preview without writing.
 */
async function runTool({ source, dry_run = false, auto_classify = false, classifications, cursor, files_to_write } = {}) {
  // ── Classic Phase 2: write agent-generated files ───────────────────────────
  if (files_to_write && Array.isArray(files_to_write)) {
    return applyImportFiles(files_to_write, dry_run)
  }

  // ── Auto-classify: continuation (with classifications from previous batch) ─
  if (auto_classify && classifications && Array.isArray(classifications)) {
    return autoClassifyContinue(source, classifications, cursor || 0)
  }

  // ── Extract source document ────────────────────────────────────────────────
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

  // ── Auto-classify: first call — start session, return first batch ──────────
  if (auto_classify) {
    return autoClassifyStart(source, chunks, dry_run)
  }

  // ── Classic Phase 1: return all chunks + classify prompts ──────────────────
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

// ── Auto-classify helpers ────────────────────────────────────────────────────

function autoClassifyStart(source, chunks, dry_run) {
  // Create session
  sessions.set(source, {
    chunks,
    classifications: [],
    dry_run,
    created: Date.now()
  })

  return buildBatchResponse(source, chunks, 0)
}

function autoClassifyContinue(source, newClassifications, cursor) {
  const session = getSession(source)
  if (!session) {
    return { error: `No active import session for "${source}". Start with auto_classify: true and a source path.` }
  }

  // Store the new classifications
  session.classifications.push(...newClassifications)

  const nextCursor = cursor + BATCH_SIZE
  const { chunks } = session

  // More chunks to classify?
  if (nextCursor < chunks.length) {
    return buildBatchResponse(source, chunks, nextCursor)
  }

  // All chunks classified — finalize
  return finalizeAutoClassify(source, session)
}

function buildBatchResponse(source, chunks, cursor) {
  const batch = chunks.slice(cursor, cursor + BATCH_SIZE)
  const sourceFile = path.basename(source)

  const batchPrompts = batch.map(chunk => {
    const prompt = resolvePrompt('import-classify', {
      chunk_text: chunk.text.slice(0, 1500),
      chunk_id: chunk.page_hint,
      source_file: sourceFile,
      existing_kb: ''
    })
    return {
      chunk_id: chunk.id,
      heading: chunk.heading,
      page_hint: chunk.page_hint,
      prompt
    }
  })

  return {
    auto_classify: true,
    cursor: cursor + BATCH_SIZE,
    total_chunks: chunks.length,
    remaining: Math.max(0, chunks.length - cursor - BATCH_SIZE),
    batch: batchPrompts,
    _instruction: [
      `Classify each chunk in batch[] using its prompt. Return JSON: { type, confidence, suggested_id, reason }.`,
      `Then call kb_import({ source: "${source}", auto_classify: true,`,
      `classifications: [{ chunk_id, type, confidence, suggested_id }],`,
      `cursor: ${cursor + BATCH_SIZE} }).`
    ].join(' ')
  }
}

async function finalizeAutoClassify(source, session) {
  const { chunks, classifications, dry_run } = session
  const sourceFile = path.basename(source)

  // Build a lookup: chunk_id → classification
  const classMap = new Map()
  for (const c of classifications) {
    classMap.set(c.chunk_id, c)
  }

  const confident = []
  const needsReview = []

  for (const chunk of chunks) {
    const cls = classMap.get(chunk.id)
    if (!cls) {
      needsReview.push({ chunk, classification: { type: 'unclassified', confidence: 0, reason: 'No classification received' } })
      continue
    }
    if (cls.confidence < CONFIDENCE_THRESHOLD || cls.type === 'unclassified') {
      needsReview.push({ chunk, classification: cls })
    } else {
      confident.push({ chunk, classification: cls })
    }
  }

  // Resolve scaffold types and target paths
  const filesToWrite = []
  const proposed = []

  for (const { chunk, classification } of confident) {
    const scaffoldType = CLASSIFY_TYPE_TO_SCAFFOLD[classification.type]
    if (!scaffoldType) {
      needsReview.push({ chunk, classification: { ...classification, reason: `Unknown type: ${classification.type}` } })
      continue
    }

    const targetPath = resolveFilePath(scaffoldType, classification.suggested_id)
    if (!targetPath) {
      needsReview.push({ chunk, classification: { ...classification, reason: 'Could not resolve file path' } })
      continue
    }

    const content = fillTemplate(chunk, { ...classification, scaffoldType }, sourceFile)
    if (!content) {
      needsReview.push({ chunk, classification: { ...classification, reason: 'Template not found' } })
      continue
    }

    proposed.push({
      chunk_id: chunk.id,
      heading: chunk.heading,
      type: classification.type,
      confidence: classification.confidence,
      suggested_id: classification.suggested_id,
      target_path: targetPath
    })

    filesToWrite.push({ path: targetPath, content })
  }

  // Dry run — return proposed mappings only
  if (dry_run) {
    clearSession(source)
    return {
      auto_classify: true,
      complete: true,
      dry_run: true,
      proposed,
      needs_review: needsReview.map(({ chunk, classification }) => ({
        chunk_id: chunk.id,
        heading: chunk.heading,
        best_guess: classification.type,
        confidence: classification.confidence,
        reason: classification.reason
      })),
      summary: {
        total_chunks: chunks.length,
        classified: proposed.length,
        needs_review: needsReview.length
      }
    }
  }

  // Write files
  const writeResult = await applyImportFiles(filesToWrite, false)

  // Append low-confidence chunks to import-review.md
  if (needsReview.length > 0) {
    appendToReviewQueue(needsReview, sourceFile)
  }

  clearSession(source)

  return {
    auto_classify: true,
    complete: true,
    files_written: writeResult.written,
    chunk_count: chunks.length,
    skipped: writeResult.skipped.length,
    needs_review: needsReview.length
  }
}

function appendToReviewQueue(entries, sourceFile) {
  const reviewEntries = entries
    .map(({ chunk, classification }) => buildReviewEntry(chunk, classification, sourceFile))
    .join('\n')

  const header = `\n---\n\n## Import: ${sourceFile} (${new Date().toISOString().split('T')[0]})\n\n`

  if (fs.existsSync(IMPORT_REVIEW_PATH)) {
    fs.appendFileSync(IMPORT_REVIEW_PATH, header + reviewEntries, 'utf8')
  } else {
    fs.mkdirSync(path.dirname(IMPORT_REVIEW_PATH), { recursive: true })
    fs.writeFileSync(IMPORT_REVIEW_PATH, `# Import Review Queue\n\nChunks that could not be confidently classified.\n${header}${reviewEntries}`, 'utf8')
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function validateKbPath(filePath) {
  const resolved = path.resolve(filePath)
  const kbDir = path.resolve('knowledge')
  if (!resolved.startsWith(kbDir + path.sep) && resolved !== kbDir) {
    return 'file_path must be inside the knowledge/ directory'
  }
  return null
}

async function applyImportFiles(files_to_write, dry_run) {
  const written = []
  const skipped = []

  for (const { path: filePath, content } of files_to_write) {
    if (!filePath || !content) continue

    const pathError = validateKbPath(filePath)
    if (pathError) {
      skipped.push({ path: filePath, reason: pathError })
      continue
    }

    // For singleton files that already exist, append instead of skipping
    if (fs.existsSync(filePath)) {
      if (isSingletonType(getTypeFromPath(filePath))) {
        if (!dry_run) {
          fs.appendFileSync(filePath, '\n' + content, 'utf8')
          written.push(filePath)
        } else {
          written.push(filePath + ' (dry_run, append)')
        }
      } else {
        skipped.push({ path: filePath, reason: 'already exists' })
      }
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

// Reverse-lookup: file path → singleton type (for append logic)
function getTypeFromPath(filePath) {
  const rel = path.relative('knowledge', filePath)
  const singletons = {
    'data/enums.md': 'enums',
    'data/relations.md': 'relations',
    'ui/components.md': 'components',
    'ui/permissions.md': 'permissions',
    'ui/copy.md': 'copy',
    'foundation/global-rules.md': 'global-rules',
    'foundation/tech-stack.md': 'tech-stack',
    'foundation/conventions.md': 'conventions'
  }
  return singletons[rel.replace(/\\/g, '/')] || null
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
  const codeBlocks = []
  const safeText = text.replace(/```[^\n]*\n[\s\S]*?\n```/g, (match) => {
    codeBlocks.push(match)
    const newlineCount = (match.match(/\n/g) || []).length
    return `__CODE_BLOCK_${codeBlocks.length - 1}__` + '\n'.repeat(Math.max(0, newlineCount - 1))
  })

  const chunks = []
  const sections = safeText.split(/\n#{1,3} /)
  sections.forEach((section, i) => {
    let restored = section
    codeBlocks.forEach((block, idx) => {
      restored = restored.replace(`__CODE_BLOCK_${idx}__`, block)
    })
    if (restored.trim().length < 50) return
    const lines = restored.trim().split('\n')
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
