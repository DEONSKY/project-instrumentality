const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: reindex } = require('./reindex')
const { CLASSIFY_TYPE_TO_SCAFFOLD, resolveFilePath, isSingletonType } = require('../lib/kb-paths')
const { fillTemplate, buildReviewEntry } = require('../lib/template-filler')
const { htmlHeadingsToMarkdown } = require('../lib/html-to-md-headings')

const SUPPORTED_FORMATS = ['.pdf', '.docx', '.md', '.txt', '.html']
const CONFIDENCE_THRESHOLD = 0.6
const IMPORT_REVIEW_PATH = 'knowledge/sync/import-review.md'
const BATCH_SIZE = 5
const MAX_CHUNK_CHARS = 16000
const SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ── Session cache for paginated auto_classify ────────────────────────────────
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
 *   Phase 1 (no files_to_write): Extract and chunk → returns classify prompts.
 *   Phase 2 (with files_to_write): Write agent-generated files.
 *
 * Auto-classify mode (auto_classify: true):
 *   1. Extract + chunk, return batches of 5 with classify prompts.
 *   2. Agent classifies each batch (multi-label), calls back with cursor.
 *   3. After all batches: returns import plan with proposed files + cross-refs.
 *   4. Agent calls with approve: true to write files.
 *   Combine with dry_run: true to preview proposed mappings.
 */
async function runTool({ source, dry_run = false, auto_classify = false, approve = false, classifications, cursor, files_to_write } = {}) {
  // ── Classic Phase 2: write agent-generated files ───────────────────────────
  if (files_to_write && Array.isArray(files_to_write)) {
    return applyImportFiles(files_to_write, dry_run)
  }

  // ── Auto-classify: approve a stored plan ───────────────────────────────────
  if (auto_classify && approve) {
    return executeImportPlan(source, dry_run)
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
      'For each chunk in classify_prompts[], use the prompt to classify it.',
      'The prompt returns multi-label: { types: [{ type, confidence, suggested_id, reason }], suggested_group, duplicate_of }.',
      `Chunks where all types have confidence < ${CONFIDENCE_THRESHOLD} should be appended to ${IMPORT_REVIEW_PATH}.`,
      'For each confident type, load the matching template and use import-map prompt to fill it.',
      `Then call kb_import({ source: "${source}", files_to_write: [{ path, content }] }) to write all files at once.`
    ].join(' ')
  }
}

// ── Auto-classify flow ──────────────────────────────────────────────────────

function autoClassifyStart(source, chunks, dry_run) {
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

  // Normalize classifications to multi-label format
  const normalized = newClassifications.map(normalizeClassification)
  session.classifications.push(...normalized)

  const nextCursor = cursor + BATCH_SIZE
  const { chunks } = session

  if (nextCursor < chunks.length) {
    return buildBatchResponse(source, chunks, nextCursor)
  }

  // All chunks classified — build plan
  return buildImportPlan(source, session)
}

// Handle both old flat format and new multi-label format
function normalizeClassification(cls) {
  if (cls.types && Array.isArray(cls.types)) {
    return cls // already multi-label
  }
  // Old flat format: { chunk_id, type, confidence, suggested_id }
  return {
    chunk_id: cls.chunk_id,
    types: [{ type: cls.type, confidence: cls.confidence, suggested_id: cls.suggested_id, reason: cls.reason || '' }],
    suggested_group: cls.suggested_group || null,
    duplicate_of: cls.duplicate_of || null
  }
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
      'Classify each chunk using its prompt. Return multi-label JSON:',
      '{ chunk_id, types: [{ type, confidence, suggested_id, reason }], suggested_group, duplicate_of }.',
      `Then call kb_import({ source: "${source}", auto_classify: true,`,
      `classifications: [<your results>], cursor: ${cursor + BATCH_SIZE} }).`
    ].join(' ')
  }
}

// ── Plan phase ──────────────────────────────────────────────────────────────

function buildImportPlan(source, session) {
  const { chunks, classifications, dry_run } = session
  const sourceFile = path.basename(source)

  // Build lookup: chunk_id → classification
  const classMap = new Map()
  for (const c of classifications) {
    classMap.set(c.chunk_id, c)
  }

  const proposed = []
  const needsReview = []

  for (const chunk of chunks) {
    const cls = classMap.get(chunk.id)
    if (!cls) {
      needsReview.push({ chunk, classification: { type: 'unclassified', confidence: 0, reason: 'No classification received' } })
      continue
    }

    // Filter to confident types
    const confidentTypes = (cls.types || []).filter(t => t.confidence >= CONFIDENCE_THRESHOLD && t.type !== 'unclassified')
    const lowTypes = (cls.types || []).filter(t => t.confidence < CONFIDENCE_THRESHOLD || t.type === 'unclassified')

    if (confidentTypes.length === 0) {
      const best = (cls.types || [])[0] || { type: 'unclassified', confidence: 0 }
      needsReview.push({ chunk, classification: { ...best, reason: best.reason || 'Low confidence' } })
      continue
    }

    // Each confident type produces a separate file
    for (const typeEntry of confidentTypes) {
      const scaffoldType = CLASSIFY_TYPE_TO_SCAFFOLD[typeEntry.type]
      if (!scaffoldType) {
        needsReview.push({ chunk, classification: { ...typeEntry, reason: `Unknown type: ${typeEntry.type}` } })
        continue
      }

      const targetPath = resolveFilePath(scaffoldType, typeEntry.suggested_id)
      if (!targetPath) {
        needsReview.push({ chunk, classification: { ...typeEntry, reason: 'Could not resolve file path' } })
        continue
      }

      proposed.push({
        chunk_id: chunk.id,
        heading: chunk.heading,
        type: typeEntry.type,
        confidence: typeEntry.confidence,
        suggested_id: typeEntry.suggested_id,
        suggested_group: cls.suggested_group,
        target_path: targetPath
      })
    }

    // Low-confidence types from same chunk go to review
    for (const t of lowTypes) {
      needsReview.push({ chunk, classification: t })
    }
  }

  // Generate cross-references
  const crossReferences = generateCrossReferences(proposed, chunks)

  // Build file contents with cross-references
  const filesToWrite = []
  for (const entry of proposed) {
    const chunk = chunks.find(c => c.id === entry.chunk_id)
    const depsForFile = crossReferences
      .filter(r => r.from === entry.target_path)
      .map(r => r.to.replace(/^knowledge\//, '').replace(/\.md$/, ''))

    const scaffoldType = CLASSIFY_TYPE_TO_SCAFFOLD[entry.type]
    const content = fillTemplate(chunk, { ...entry, scaffoldType }, sourceFile, depsForFile)
    if (!content) {
      needsReview.push({ chunk, classification: { ...entry, reason: 'Template not found' } })
      continue
    }
    filesToWrite.push({ path: entry.target_path, content })
  }

  // Store plan in session
  session.plan = { filesToWrite, proposed, needsReview, crossReferences }
  session.phase = 'plan_ready'

  const planResponse = {
    auto_classify: true,
    complete: false,
    plan: {
      sections_detected: chunks.length,
      proposed_files: proposed.map(p => ({
        path: p.target_path,
        from_chunk: p.chunk_id,
        heading: p.heading,
        type: p.type,
        confidence: p.confidence,
        suggested_id: p.suggested_id
      })),
      cross_references: crossReferences,
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
        needs_review: needsReview.length,
        total_files: filesToWrite.length
      }
    },
    _instruction: [
      'Review the proposed import plan above.',
      `To execute, call kb_import({ source: "${source}", auto_classify: true, approve: true }).`,
      `To preview without writing, call kb_import({ source: "${source}", auto_classify: true, approve: true, dry_run: true }).`,
      'To cancel, do nothing (session expires in 10 minutes).'
    ].join(' ')
  }

  // If dry_run was set from the start, return plan as final result
  if (dry_run) {
    planResponse.dry_run = true
    clearSession(source)
  }

  return planResponse
}

async function executeImportPlan(source, dry_run) {
  const session = getSession(source)
  if (!session || session.phase !== 'plan_ready') {
    return { error: `No import plan ready for "${source}". Run auto_classify first.` }
  }

  const { filesToWrite, needsReview } = session.plan
  const sourceFile = path.basename(source)

  if (dry_run) {
    clearSession(source)
    return {
      auto_classify: true,
      complete: true,
      dry_run: true,
      proposed: session.plan.proposed,
      needs_review: needsReview.map(({ chunk, classification }) => ({
        chunk_id: chunk.id,
        heading: chunk.heading,
        best_guess: classification.type,
        confidence: classification.confidence,
        reason: classification.reason
      })),
      summary: {
        total_chunks: session.chunks.length,
        classified: session.plan.proposed.length,
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
    chunk_count: session.chunks.length,
    skipped: writeResult.skipped.length,
    needs_review: needsReview.length
  }
}

// ── Cross-reference generation ──────────────────────────────────────────────

// Priority order for directional depends_on links
const TYPE_PRIORITY = { feature: 1, flow: 2, validation: 3, schema: 4, integration: 5, decision: 6, enums: 7, 'ui-permissions': 8, 'ui-copy': 9, standard: 10 }

function generateCrossReferences(proposed, chunks) {
  const refs = []

  // 1. Same-chunk: if one chunk produced multiple types, cross-reference them
  const byChunk = new Map()
  for (const p of proposed) {
    if (!byChunk.has(p.chunk_id)) byChunk.set(p.chunk_id, [])
    byChunk.get(p.chunk_id).push(p)
  }
  for (const entries of byChunk.values()) {
    if (entries.length < 2) continue
    // Higher priority type depends_on lower priority (feature → flow, feature → validation)
    const sorted = entries.slice().sort((a, b) => (TYPE_PRIORITY[a.type] || 99) - (TYPE_PRIORITY[b.type] || 99))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        refs.push({ from: sorted[i].target_path, to: sorted[j].target_path, relationship: 'depends_on' })
      }
    }
  }

  // 2. Same-group: files sharing suggested_group get directional links
  const byGroup = new Map()
  for (const p of proposed) {
    if (!p.suggested_group) continue
    if (!byGroup.has(p.suggested_group)) byGroup.set(p.suggested_group, [])
    byGroup.get(p.suggested_group).push(p)
  }
  for (const entries of byGroup.values()) {
    if (entries.length < 2) continue
    const sorted = entries.slice().sort((a, b) => (TYPE_PRIORITY[a.type] || 99) - (TYPE_PRIORITY[b.type] || 99))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!refs.some(r => r.from === sorted[i].target_path && r.to === sorted[j].target_path)) {
          refs.push({ from: sorted[i].target_path, to: sorted[j].target_path, relationship: 'depends_on' })
        }
      }
    }
  }

  // 3. Text-mention: scan chunk text for other proposed files' suggested_id values
  const chunkMap = new Map()
  for (const c of chunks) chunkMap.set(c.id, c)

  for (const from of proposed) {
    const chunk = chunkMap.get(from.chunk_id)
    if (!chunk) continue
    const text = chunk.text.toLowerCase()

    for (const to of proposed) {
      if (from.target_path === to.target_path) continue
      if (refs.some(r => r.from === from.target_path && r.to === to.target_path)) continue

      const id = to.suggested_id
      // Require at least 2 segments (e.g., "trs-request" not just "trs") to avoid false positives
      if (!id || !id.includes('-')) continue
      if (text.includes(id.toLowerCase())) {
        refs.push({ from: from.target_path, to: to.target_path, relationship: 'mentions' })
      }
    }
  }

  return refs
}

// ── Review queue ────────────────────────────────────────────────────────────

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

function getTypeFromPath(filePath) {
  const rel = path.relative('knowledge', filePath)
  const singletons = {
    'data/enums.md': 'enums',
    'data/relations.md': 'relations',
    'ui/components.md': 'components',
    'ui/permissions.md': 'permissions',
    'ui/copy.md': 'copy',
    'standards/global.md': 'global-rules',
    'standards/code/tech-stack.md': 'tech-stack',
    'standards/code/conventions.md': 'conventions'
  }
  return singletons[rel.replace(/\\/g, '/')] || null
}

// ── Text extraction ─────────────────────────────────────────────────────────

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
    const assetsDir = path.join('knowledge', 'assets', 'imports')
    fs.mkdirSync(assetsDir, { recursive: true })

    let imageCounter = 0
    const baseName = path.basename(filePath, ext)

    const result = await mammoth.convertToHtml({
      path: filePath,
      convertImage: mammoth.images.imgElement(function (image) {
        imageCounter++
        const imgExt = image.contentType.split('/')[1] || 'png'
        const imgName = `${baseName}-img-${imageCounter}.${imgExt}`
        const imgPath = path.join(assetsDir, imgName)

        return image.readAsBuffer().then(function (buffer) {
          fs.writeFileSync(imgPath, buffer)
          return { src: `../../assets/imports/${imgName}` }
        })
      })
    })

    // Convert HTML img tags to markdown image syntax before stripping tags
    let html = result.value.replace(
      /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
      '![$2]($1)'
    )
    html = html.replace(
      /<img[^>]*src="([^"]*)"[^>]*\/?>/gi,
      '![]($1)'
    )

    return htmlHeadingsToMarkdown(html)
  }
  return fs.readFileSync(filePath, 'utf8')
}

// ── Document chunking ───────────────────────────────────────────────────────

function chunkDocument(text) {
  // Preserve fenced code blocks
  const codeBlocks = []
  const safeText = text.replace(/```[^\n]*\n[\s\S]*?\n```/g, (match) => {
    codeBlocks.push(match)
    const newlineCount = (match.match(/\n/g) || []).length
    return `__CODE_BLOCK_${codeBlocks.length - 1}__` + '\n'.repeat(Math.max(0, newlineCount - 1))
  })

  function restoreCodeBlocks(text) {
    let restored = text
    codeBlocks.forEach((block, idx) => {
      restored = restored.replace(`__CODE_BLOCK_${idx}__`, block)
    })
    return restored
  }

  // Split on markdown headings (H1-H6)
  const chunks = []
  const headingRegex = /\n(#{1,6}) /
  const sections = safeText.split(headingRegex)

  // sections alternates: [preamble, '#', 'heading + body', '##', 'heading + body', ...]
  // First element is text before any heading
  let idx = 0
  const headingStack = [] // tracks parent headings

  // Handle preamble (text before first heading)
  if (sections[0] && sections[0].trim().length >= 50) {
    const restored = restoreCodeBlocks(sections[0])
    chunks.push({
      id: 'chunk-1',
      heading: '',
      heading_level: 0,
      parent_heading: '',
      text: restored.trim(),
      page_hint: 'preamble'
    })
    idx = 1
  } else {
    idx = 1
  }

  let chunkCounter = chunks.length + 1

  // Process heading-content pairs
  while (idx < sections.length - 1) {
    const hashes = sections[idx]       // e.g., '##'
    const body = sections[idx + 1]     // heading text + content after heading
    idx += 2

    const level = hashes.length
    const restored = restoreCodeBlocks(body)
    if (restored.trim().length < 10) continue

    const lines = restored.trim().split('\n')
    const heading = lines[0].replace(/^#+\s*/, '').trim()
    const text = lines.slice(1).join('\n').trim() || heading

    // Update heading stack for parent tracking
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop()
    }
    const parentHeading = headingStack.length > 0 ? headingStack[headingStack.length - 1].heading : ''
    headingStack.push({ level, heading })

    const chunk = {
      id: `chunk-${chunkCounter}`,
      heading,
      heading_level: level,
      parent_heading: parentHeading,
      text,
      page_hint: `section ${chunkCounter}`
    }

    // Sub-split if chunk is too large
    if (text.length > MAX_CHUNK_CHARS) {
      const subChunks = subSplitChunk(chunk, codeBlocks)
      chunks.push(...subChunks)
      chunkCounter += subChunks.length
    } else {
      chunks.push(chunk)
      chunkCounter++
    }
  }

  // Fallback: no headings found — split on paragraphs
  if (chunks.length === 0) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 80)
    paragraphs.forEach((para, i) => {
      const chunk = {
        id: `chunk-${i + 1}`,
        heading: '',
        heading_level: 0,
        parent_heading: '',
        text: para.trim(),
        page_hint: `paragraph ${i + 1}`
      }
      if (para.length > MAX_CHUNK_CHARS) {
        chunks.push(...subSplitChunk(chunk))
      } else {
        chunks.push(chunk)
      }
    })
  }

  return chunks
}

function subSplitChunk(chunk) {
  const { text, heading, heading_level, parent_heading } = chunk
  const subChunks = []
  const suffix = 'abcdefghijklmnopqrstuvwxyz'

  // Try splitting at sub-headings within the chunk text
  const subHeadingRegex = /\n(#{1,6}) /
  const parts = text.split(subHeadingRegex)

  if (parts.length > 2) {
    // Has sub-headings — use them as split points
    let partIdx = 0
    let subIdx = 0

    // Preamble before first sub-heading
    if (parts[0] && parts[0].trim().length >= 50) {
      subChunks.push({
        id: `${chunk.id}${suffix[subIdx] || subIdx}`,
        heading: heading + ' (cont.)',
        heading_level,
        parent_heading,
        text: parts[0].trim(),
        page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
      })
      subIdx++
    }
    partIdx = 1

    while (partIdx < parts.length - 1) {
      const subBody = parts[partIdx + 1] || ''
      if (subBody.trim().length >= 50) {
        const lines = subBody.trim().split('\n')
        subChunks.push({
          id: `${chunk.id}${suffix[subIdx] || subIdx}`,
          heading: lines[0].replace(/^#+\s*/, '').trim(),
          heading_level: parts[partIdx].length,
          parent_heading: heading,
          text: lines.slice(1).join('\n').trim() || lines[0],
          page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
        })
        subIdx++
      }
      partIdx += 2
    }

    if (subChunks.length > 0) return subChunks
  }

  // Fallback: split at paragraph boundaries
  const paragraphs = text.split(/\n\n+/)
  let buffer = ''
  let subIdx = 0

  for (const para of paragraphs) {
    if (buffer.length + para.length > MAX_CHUNK_CHARS && buffer.length > 0) {
      subChunks.push({
        id: `${chunk.id}${suffix[subIdx] || subIdx}`,
        heading: subIdx === 0 ? heading : heading + ' (cont.)',
        heading_level,
        parent_heading,
        text: buffer.trim(),
        page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
      })
      subIdx++
      buffer = para
    } else {
      buffer += (buffer ? '\n\n' : '') + para
    }
  }

  if (buffer.trim().length > 0) {
    subChunks.push({
      id: `${chunk.id}${suffix[subIdx] || subIdx}`,
      heading: subIdx === 0 ? heading : heading + ' (cont.)',
      heading_level,
      parent_heading,
      text: buffer.trim(),
      page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
    })
  }

  return subChunks.length > 0 ? subChunks : [chunk]
}

module.exports = { runTool }
