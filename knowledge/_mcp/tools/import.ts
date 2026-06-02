import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import matter from 'gray-matter'
import { resolvePrompt } from '../lib/prompts'
import { runTool as reindex } from './reindex'
import { CLASSIFY_TYPE_TO_SCAFFOLD, resolveFilePath } from '../lib/kb-paths'
import { fillTemplate, buildReviewEntry, normalizeKbFile } from '../lib/template-filler'
import { matterStringify } from '../lib/matter-utils'
import { createSessionCache } from '../lib/session-cache'
import { extractText, chunkDocument } from './import/extract'
import { embedsIn, stripEmbeds, obsidianEmbed, relocateImages, removeStagingDir, stagingDirFor } from './import/images'
import type { ToolDefinition } from '../src/types/tool'

interface Chunk {
  id: string
  heading?: string
  parent_heading?: string
  text: string
  page_hint?: string
}

interface TypeEntry { type: string; confidence: number; suggested_id?: string; reason?: string }
interface Classification {
  chunk_id: string
  types?: TypeEntry[]
  suggested_group?: string | null
  duplicate_of?: string | null
  // tolerate old flat-format fields during normalize
  type?: string
  confidence?: number
  suggested_id?: string
  reason?: string
}

interface ProposedFile {
  chunk_id: string
  heading?: string
  type: string
  confidence: number
  low_confidence: boolean
  suggested_id?: string
  suggested_group?: string | null
  target_path: string
}

interface ReviewItem { chunk: Chunk; classification: Record<string, unknown> }
interface CrossRef { from: string; to: string; relationship: string }
interface FileToWrite { path: string; content: string }
interface FillPrompt { path: string; type: string; suggested_id?: string; prompt: string }

interface ImportPlan {
  filesToWrite: FileToWrite[]
  proposed: ProposedFile[]
  needsReview: ReviewItem[]
  crossReferences: CrossRef[]
  fillPrompts: FillPrompt[]
}

interface ImportSession {
  chunks: Chunk[]
  toClassifyIds: string[]
  autoReviewIds: string[]
  classifications: Classification[]
  dry_run: boolean
  fill: boolean
  fileFingerprint: string
  images: Array<{ name: string; alt: string; page: number | null }>
  stagingDir: string
  phase: string
  plan?: ImportPlan
}

// Types at/above CONFIDENCE_THRESHOLD are accepted outright. Types in the
// mid-band [ACCEPT_THRESHOLD, CONFIDENCE_THRESHOLD) still produce a proposed
// file but are flagged `low_confidence` so the agent/human can confirm rather
// than the content being silently dropped to the review queue. Below
// ACCEPT_THRESHOLD (or `unclassified`) → review queue.
const CONFIDENCE_THRESHOLD = 0.6
const ACCEPT_THRESHOLD = 0.5
const IMPORT_REVIEW_PATH = 'knowledge/sync/import-review.md'
const BATCH_SIZE = 15
const SESSION_TTL_MS = 45 * 60 * 1000 // 45 min idle — re-stamped on every set
const SESSION_PERSIST_DIR = 'knowledge/sync/.import-sessions'
// Chunks whose classifiable text (image markdown + heading markers stripped)
// falls below this are routed straight to review — no round-trip to the agent.
const MIN_CLASSIFIABLE_CHARS = 50
const LOW_SIGNAL_REASON = 'Image-only / insufficient text — skipped classification'

// ── Session cache for paginated auto_classify ────────────────────────────────
// Disk-backed so a multi-batch run survives an MCP-server restart; idle TTL is
// refreshed on every set (callers persist after each batch).
const sessions = createSessionCache<ImportSession>(SESSION_TTL_MS, { persistDir: SESSION_PERSIST_DIR })
const getSession = (source: string) => sessions.get(source)
const clearSession = (source: string) => sessions.clear(source)
// Drop a session AND its staged images (restart / stale source).
const discardSession = (source: string): void => { clearSession(source); removeStagingDir(source) }

// Text the classifier can actually reason about, with image embeds / refs and
// heading markers removed. Used to pre-filter low-signal (e.g. screenshot-only)
// chunks — must strip `![[embeds]]` too, else an image-only chunk reads as text.
function classifiableText(text: string): string {
  return (text || '')
    .replace(/!\[\[[^\]]*\]\]/g, '')      // obsidian embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // markdown images
    .replace(/^#{1,6}\s+/gm, '')          // heading markers
    .replace(/\s+/g, ' ')
    .trim()
}

function isLowSignal(chunk: Chunk): boolean {
  return classifiableText(chunk.text).length < MIN_CLASSIFIABLE_CHARS
}

// Identity of the *source file* — lets a resume validate the doc is unchanged
// without re-extracting (which would re-decode images on every poll).
function hashFile(source: string): string {
  return crypto.createHash('sha1').update(fs.readFileSync(source)).digest('hex')
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
async function runTool(
  { source, dry_run = false, auto_classify = false, approve = false, classifications, cursor, files_to_write, restart = false, fill = true, no_fill = false }: {
    source?: string
    dry_run?: boolean
    auto_classify?: boolean
    approve?: boolean
    classifications?: Classification[]
    cursor?: number
    files_to_write?: FileToWrite[]
    restart?: boolean
    fill?: boolean
    no_fill?: boolean
  } = {}
): Promise<Record<string, unknown>> {
  // Structural fill is ON by default — the importer surfaces per-file import-map
  // prompts so prose gets lifted into Fields/Rules tables. `no_fill: true` (or
  // fill: false) opts into the cheap deterministic baseline-only run.
  const fillEnabled = fill && !no_fill
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

  // ── Validate source ────────────────────────────────────────────────────────
  if (!source || !fs.existsSync(source)) {
    return { error: `Source file not found: ${source}` }
  }

  // ── Auto-classify: first call — start (or resume) session ──────────────────
  if (auto_classify) {
    if (restart) discardSession(source)
    const fileFingerprint = hashFile(source)

    // Resume check runs BEFORE extraction, so we don't re-decode images on
    // every poll. A changed file (fingerprint mismatch) discards and re-imports.
    if (!restart) {
      const existing = getSession(source)
      if (existing) {
        if (existing.fileFingerprint === fileFingerprint) return resumeSession(source, existing)
        discardSession(source)
      }
    }

    let extracted
    try {
      extracted = await extractText(source)
    } catch (e) {
      return { error: (e as Error).message }
    }
    const chunks = chunkDocument(extracted.text)
    if (chunks.length === 0) {
      return { error: 'No content chunks extracted from document.' }
    }
    return autoClassifyStart(source, chunks, extracted.images, dry_run, fileFingerprint, fillEnabled)
  }

  // ── Classic Phase 1: extract + return all chunks + classify prompts ────────
  let extracted
  try {
    extracted = await extractText(source)
  } catch (e) {
    return { error: (e as Error).message }
  }
  const chunks = chunkDocument(extracted.text)
  if (chunks.length === 0) {
    return { error: 'No content chunks extracted from document.' }
  }

  const classify_prompts = chunks.map(chunk => {
    const prompt = resolvePrompt('import-classify', {
      chunk_text: chunk.text.slice(0, 1500),
      chunk_id: chunk.page_hint,
      parent_heading: chunk.parent_heading || chunk.heading || '',
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

function autoClassifyStart(
  source: string,
  chunks: Chunk[],
  images: ImportSession['images'],
  dry_run: boolean,
  fileFingerprint: string,
  fill = false
): Record<string, unknown> {
  // Layer C: partition out low-signal chunks (screenshots, image refs) so the
  // agent never spends a round-trip "classifying" something it can't.
  const toClassifyIds: string[] = []
  const autoReviewIds: string[] = []
  for (const c of chunks) {
    (isLowSignal(c) ? autoReviewIds : toClassifyIds).push(c.id)
  }

  sessions.set(source, {
    chunks,
    toClassifyIds,
    autoReviewIds,
    classifications: [],
    dry_run,
    fill,
    fileFingerprint,
    images: images || [],
    stagingDir: stagingDirFor(source),
    phase: 'classifying'
  })
  const session = getSession(source)!

  if (toClassifyIds.length === 0) {
    // Nothing classifiable — go straight to a plan (all chunks → review).
    return buildImportPlan(source, session)
  }
  return buildBatchResponse(source, session, 0)
}

// Re-enter an in-progress (or already-planned) session after a drop/restart.
function resumeSession(source: string, session: ImportSession): Record<string, unknown> {
  if (session.phase === 'plan_ready') {
    // Plan already built before the drop — re-surface the approve step.
    return planResponse(source, session, { resumed: true })
  }
  const done = session.classifications.length
  const total = session.toClassifyIds.length
  if (done >= total) {
    return buildImportPlan(source, session)
  }
  sessions.set(source, session) // refresh idle clock
  const resp = buildBatchResponse(source, session, done)
  resp._resumed = {
    classified_so_far: done,
    total_to_classify: total,
    auto_skipped: session.autoReviewIds.length,
    note: `Resumed prior import session — continuing from chunk ${done + 1} of ${total}.`
  }
  return resp
}

function autoClassifyContinue(source: string | undefined, newClassifications: Classification[], cursor: number): Record<string, unknown> {
  const session = source ? getSession(source) : null
  if (!session || !source) {
    return { error: `No active import session for "${source}". Start with auto_classify: true and a source path.` }
  }

  // Normalize classifications to multi-label format
  const normalized = newClassifications.map(normalizeClassification)
  session.classifications.push(...normalized)
  sessions.set(source, session) // persist progress + refresh idle clock

  // `cursor` is the next-batch start returned by the previous call — serve it
  // directly (do not advance again, or every other window gets skipped).
  const total = session.toClassifyIds.length
  if (cursor < total) {
    return buildBatchResponse(source, session, cursor)
  }

  // All classifiable chunks done — build plan
  return buildImportPlan(source, session)
}

// Handle both old flat format and new multi-label format
function normalizeClassification(cls: Classification): Classification {
  if (cls.types && Array.isArray(cls.types)) {
    return cls // already multi-label
  }
  // Old flat format: { chunk_id, type, confidence, suggested_id }
  return {
    chunk_id: cls.chunk_id,
    types: [{ type: cls.type || 'unclassified', confidence: cls.confidence ?? 0, suggested_id: cls.suggested_id, reason: cls.reason || '' }],
    suggested_group: cls.suggested_group || null,
    duplicate_of: cls.duplicate_of || null
  }
}

function buildBatchResponse(source: string, session: ImportSession, cursor: number): Record<string, unknown> {
  const chunkById = new Map(session.chunks.map(c => [c.id, c]))
  const batchIds = session.toClassifyIds.slice(cursor, cursor + BATCH_SIZE)
  const batch = batchIds.map(id => chunkById.get(id)).filter((c): c is Chunk => Boolean(c))
  const total = session.toClassifyIds.length
  const sourceFile = path.basename(source)

  const batchPrompts = batch.map(chunk => {
    const prompt = resolvePrompt('import-classify', {
      chunk_text: chunk.text.slice(0, 1500),
      chunk_id: chunk.page_hint || '',
      parent_heading: chunk.parent_heading || chunk.heading || '',
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
    total_chunks: total,
    auto_skipped: session.autoReviewIds.length,
    remaining: Math.max(0, total - cursor - BATCH_SIZE),
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

function buildImportPlan(source: string, session: ImportSession): Record<string, unknown> {
  const { chunks, classifications, dry_run } = session
  const sourceFile = path.basename(source)

  // Build lookup: chunk_id → classification
  const classMap = new Map<string, Classification>()
  for (const c of classifications) {
    classMap.set(c.chunk_id, c)
  }

  const autoReviewSet = new Set(session.autoReviewIds || [])

  const proposed: ProposedFile[] = []
  const needsReview: ReviewItem[] = []

  for (const chunk of chunks) {
    const cls = classMap.get(chunk.id)
    if (!cls) {
      const reason = autoReviewSet.has(chunk.id) ? LOW_SIGNAL_REASON : 'No classification received'
      needsReview.push({ chunk, classification: { type: 'unclassified', confidence: 0, reason } })
      continue
    }

    // Accept any type at/above ACCEPT_THRESHOLD; below that (or unclassified)
    // → review. Accepted types in [ACCEPT_THRESHOLD, CONFIDENCE_THRESHOLD) are
    // flagged low_confidence so they surface for confirmation but are NOT
    // dropped (the original >=0.6 cutoff stranded real content in review).
    const acceptedTypes = (cls.types || []).filter(t => t.confidence >= ACCEPT_THRESHOLD && t.type !== 'unclassified')
    const lowTypes = (cls.types || []).filter(t => t.confidence < ACCEPT_THRESHOLD || t.type === 'unclassified')

    if (acceptedTypes.length === 0) {
      const best = (cls.types || [])[0] || { type: 'unclassified', confidence: 0 }
      needsReview.push({ chunk, classification: { ...best, reason: best.reason || 'Low confidence' } })
      continue
    }

    // Each accepted type produces a separate file
    for (const typeEntry of acceptedTypes) {
      const scaffoldType = CLASSIFY_TYPE_TO_SCAFFOLD[typeEntry.type]
      if (!scaffoldType) {
        needsReview.push({ chunk, classification: { ...typeEntry, reason: `Unknown type: ${typeEntry.type}` } })
        continue
      }

      const targetPath = resolveFilePath(scaffoldType, typeEntry.suggested_id, cls.suggested_group || undefined)
      if (!targetPath) {
        needsReview.push({ chunk, classification: { ...typeEntry, reason: 'Could not resolve file path' } })
        continue
      }

      proposed.push({
        chunk_id: chunk.id,
        heading: chunk.heading,
        type: typeEntry.type,
        confidence: typeEntry.confidence,
        low_confidence: typeEntry.confidence < CONFIDENCE_THRESHOLD,
        suggested_id: typeEntry.suggested_id,
        suggested_group: cls.suggested_group,
        target_path: targetPath
      })
    }

    // Types below the accept floor (or unclassified) go to review
    for (const t of lowTypes) {
      needsReview.push({ chunk, classification: { ...t } })
    }
  }

  // Generate cross-references
  const crossReferences = generateCrossReferences(proposed, chunks)

  // Aggregate N chunks → 1 file. Multiple chunks can resolve to the same target
  // (grouping web services by service, schema by domain, or any duplicate
  // suggested_id). Group `proposed` by target_path and build ONE file per path
  // from all contributing chunks — otherwise the 2nd+ chunk for a path is
  // silently dropped by applyImportFiles' skip-if-exists guard.
  const chunkById = new Map(chunks.map(c => [c.id, c]))
  const byPath = new Map<string, ProposedFile[]>()
  for (const entry of proposed) {
    if (!byPath.has(entry.target_path)) byPath.set(entry.target_path, [])
    byPath.get(entry.target_path)!.push(entry)
  }

  const filesToWrite: FileToWrite[] = []
  const fillPrompts: FillPrompt[] = []
  for (const [targetPath, entries] of byPath) {
    const contributing = entries.map(e => chunkById.get(e.chunk_id)).filter((c): c is Chunk => Boolean(c))
    const mergedChunk = mergeChunks(contributing, entries)
    const depsForFile = [...new Set(
      crossReferences
        .filter(r => r.from === targetPath && r.to !== targetPath)
        .map(r => r.to.replace(/^knowledge\//, '').replace(/\.md$/, ''))
    )]

    const scaffoldType = CLASSIFY_TYPE_TO_SCAFFOLD[entries[0].type]
    const content = fillTemplate(mergedChunk, { ...entries[0], scaffoldType }, sourceFile, depsForFile)
    if (!content) {
      for (const e of entries) {
        const ch = chunkById.get(e.chunk_id)
        if (ch) needsReview.push({ chunk: ch, classification: { ...e, reason: 'Template not found' } })
      }
      continue
    }
    filesToWrite.push({ path: targetPath, content })

    // Hybrid fill: when fill is on, surface an import-map prompt per file so the
    // agent can replace the deterministic baseline with content extracted from
    // the merged chunk text. Filled files are written via files_to_write and
    // normalized by applyImportFiles (same post-process as the baseline).
    if (session.fill) {
      // Feed the BASELINE content (frontmatter + ## Imported Content + tags +
      // depends_on) into the fill prompt, not the raw template — so the agent
      // enriches the baseline in place and can't drop provenance/tags/links.
      const prompt = buildFillPrompt(scaffoldType, content, mergedChunk, entries[0], sourceFile)
      if (prompt) fillPrompts.push({ path: targetPath, type: entries[0].type, suggested_id: entries[0].suggested_id, prompt })
    }
  }

  // Attach images from image-only chunks (which never produced a file of their
  // own) to the nearest content doc, so screenshots stay with their section
  // instead of being orphaned. Prunes pure-image chunks from review.
  attachOrphanEmbeds(chunks, proposed, filesToWrite, needsReview)

  // Store plan in session (persisted to disk — survives a restart before approve)
  session.plan = { filesToWrite, proposed, needsReview, crossReferences, fillPrompts }
  session.phase = 'plan_ready'
  sessions.set(source, session)

  // If dry_run was set from the start, return plan as final result
  if (dry_run) {
    clearSession(source)
    return planResponse(source, session, { dry_run: true })
  }

  return planResponse(source, session)
}

// Attach embeds from image-only / unclassified chunks to the nearest content
// doc (preceding, else following). A pure-image chunk whose embeds land
// somewhere is dropped from the review queue. If nothing was classified there
// are no anchors — those images stay staged and surface via the review queue.
function attachOrphanEmbeds(chunks: Chunk[], proposed: ProposedFile[], filesToWrite: FileToWrite[], needsReview: ReviewItem[]): void {
  const fileByPath = new Map(filesToWrite.map(f => [f.path, f]))
  const indexOf = new Map(chunks.map((c, i) => [c.id, i]))
  const proposedIds = new Set(proposed.map(p => p.chunk_id))

  const anchors = proposed
    .filter(p => fileByPath.has(p.target_path))
    .map(p => ({ idx: indexOf.get(p.chunk_id) ?? 0, path: p.target_path }))
    .sort((a, b) => a.idx - b.idx)
  if (anchors.length === 0) return

  const addByPath = new Map<string, string[]>()   // path → embed names to append
  const attachedPureImage = new Set<string>()     // chunk ids to prune from review

  for (const chunk of chunks) {
    if (proposedIds.has(chunk.id)) continue // its embeds already live in its own doc
    const names = embedsIn(chunk.text)
    if (!names.length) continue
    const ci = indexOf.get(chunk.id) ?? 0
    let anchor = anchors[0]
    for (const a of anchors) { if (a.idx <= ci) anchor = a; else break }
    if (!addByPath.has(anchor.path)) addByPath.set(anchor.path, [])
    addByPath.get(anchor.path)!.push(...names)
    if (classifiableText(chunk.text).length === 0) attachedPureImage.add(chunk.id)
  }

  for (const [p, names] of addByPath) {
    const file = fileByPath.get(p)!
    const existing = new Set(embedsIn(file.content))
    const add = [...new Set(names)].filter(n => !existing.has(n))
    if (add.length) {
      file.content = file.content.replace(/\s*$/, '') +
        '\n\n## Screenshots\n\n' + add.map(obsidianEmbed).join('\n\n') + '\n'
    }
  }

  for (let i = needsReview.length - 1; i >= 0; i--) {
    if (attachedPureImage.has(needsReview[i].chunk.id)) needsReview.splice(i, 1)
  }
}

// Render the stored plan as a tool response. Reused on resume so a session that
// dropped after planning but before approve can re-surface the same plan.
function planResponse(source: string, session: ImportSession, { dry_run = false, resumed = false }: { dry_run?: boolean; resumed?: boolean } = {}): Record<string, unknown> {
  const { chunks } = session
  const { filesToWrite, proposed, needsReview, crossReferences, fillPrompts } = session.plan!

  const resp: Record<string, unknown> = {
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
        low_confidence: p.low_confidence || false,
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
      resumed ? 'Resumed a previously planned import — the plan below is ready to approve.' : 'Review the proposed import plan above.',
      `To execute, call kb_import({ source: "${source}", auto_classify: true, approve: true }).`,
      `To preview without writing, call kb_import({ source: "${source}", auto_classify: true, approve: true, dry_run: true }).`,
      'To cancel, do nothing (session expires after 45 min idle). To re-import from scratch, pass restart: true.'
    ].join(' ')
  }

  // Hybrid fill: offer per-file import-map prompts. Filling is optional — the
  // deterministic baseline is written on approve; filled content (written via
  // files_to_write) supersedes it and is normalized the same way.
  if (fillPrompts && fillPrompts.length > 0) {
    resp.fill_prompts = fillPrompts
    resp._fill_instruction = [
      'Fill is ON. Optionally, for each entry in fill_prompts[], run the prompt to produce richer',
      'content from the source text, then call',
      `kb_import({ source: "${source}", files_to_write: [{ path, content }, ...] }) to write the filled files.`,
      'Files you do not fill are covered by the deterministic baseline on approve.'
    ].join(' ')
  }

  if (dry_run) resp.dry_run = true
  return resp
}

async function executeImportPlan(source: string | undefined, dry_run: boolean): Promise<Record<string, unknown>> {
  const session = source ? getSession(source) : null
  if (!session || !source || session.phase !== 'plan_ready') {
    return { error: `No import plan ready for "${source}". Run auto_classify first.` }
  }

  const plan = session.plan!
  const { filesToWrite, needsReview } = plan
  const sourceFile = path.basename(source)

  if (dry_run) {
    clearSession(source)
    return {
      auto_classify: true,
      complete: true,
      dry_run: true,
      proposed: plan.proposed,
      needs_review: needsReview.map(({ chunk, classification }) => ({
        chunk_id: chunk.id,
        heading: chunk.heading,
        best_guess: classification.type,
        confidence: classification.confidence,
        reason: classification.reason
      })),
      summary: {
        total_chunks: session.chunks.length,
        classified: plan.proposed.length,
        needs_review: needsReview.length
      }
    }
  }

  // Write files
  const writeResult = await applyImportFiles(filesToWrite, false)

  // Relocate staged images into each written doc's mirror folder. Bare-filename
  // embeds resolve post-move, so no content rewrite. Only for files actually
  // written; un-relocated images (e.g. an all-screenshots source with no doc)
  // stay in staging rather than being deleted.
  if (session.stagingDir) {
    const written = new Set(writeResult.written)
    for (const f of filesToWrite) {
      if (!written.has(f.path)) continue
      const names = embedsIn(f.content)
      if (names.length) relocateImages(names, session.stagingDir, f.path)
    }
    try { fs.rmdirSync(session.stagingDir) } catch { /* not empty / already gone */ }
  }

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

// ── Aggregation & fill helpers ──────────────────────────────────────────────

// Combine the chunks that target one file into a single synthetic chunk. Each
// section is concatenated under its own heading so an aggregated doc (e.g. all
// of a service's endpoints, or a domain's tables) carries every contributing
// section. import_chunk records all source ids for provenance.
function mergeChunks(chunks: Chunk[], entries: ProposedFile[]): { id: string; heading?: string; text: string } {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const c of chunks) {
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    const heading = c.heading ? `### ${c.heading}\n\n` : ''
    parts.push(heading + c.text)
  }
  const ids = [...seen]
  return {
    id: ids.length === 1 ? ids[0] : ids.join(','),
    heading: (chunks[0] && chunks[0].heading) || (entries[0] && entries[0].heading) || undefined,
    text: parts.join('\n\n')
  }
}

// Build an import-map (LLM fill) prompt for one target file: the already-built
// BASELINE content (frontmatter + ## Imported Content + tags + depends_on) plus
// the merged source text. The agent enriches the baseline in place — filling
// the empty Fields/Rules tables from the prose — and returns the result, which
// is written via files_to_write and normalized by applyImportFiles. Passing the
// baseline (not the raw template) guarantees provenance, tags, and cross-refs
// survive the fill.
function buildFillPrompt(scaffoldType: string, baselineContent: string, mergedChunk: { id: string; text: string }, entry: ProposedFile, sourceFile: string): string | null {
  if (!baselineContent) return null
  return resolvePrompt('import-map', {
    chunk_text: mergedChunk.text,
    chunk_id: mergedChunk.id,
    source_file: sourceFile,
    kb_type: scaffoldType,
    template: baselineContent,
    suggested_id: entry.suggested_id || '',
    kb_context: ''
  })
}

// ── Cross-reference generation ──────────────────────────────────────────────

// Priority order for directional depends_on links
const TYPE_PRIORITY: Record<string, number> = { feature: 1, flow: 2, policy: 3, validation: 4, schema: 5, integration: 6, technical: 7, decision: 8, reference: 9, component: 10, standard: 11 }

function generateCrossReferences(proposed: ProposedFile[], chunks: Chunk[]): CrossRef[] {
  const refs: CrossRef[] = []

  // 1. Same-chunk: if one chunk produced multiple types, cross-reference them
  const byChunk = new Map<string, ProposedFile[]>()
  for (const p of proposed) {
    if (!byChunk.has(p.chunk_id)) byChunk.set(p.chunk_id, [])
    byChunk.get(p.chunk_id)!.push(p)
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
  const byGroup = new Map<string, ProposedFile[]>()
  for (const p of proposed) {
    if (!p.suggested_group) continue
    if (!byGroup.has(p.suggested_group)) byGroup.set(p.suggested_group, [])
    byGroup.get(p.suggested_group)!.push(p)
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
  const chunkMap = new Map<string, Chunk>()
  for (const c of chunks) chunkMap.set(c.id, c)

  for (const from of proposed) {
    const chunk = chunkMap.get(from.chunk_id)
    if (!chunk) continue
    // Strip image embeds first — an embed filename contains a slugified id and
    // would otherwise fabricate a bogus `mentions` edge.
    const text = stripEmbeds(chunk.text).toLowerCase()

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

function appendToReviewQueue(entries: ReviewItem[], sourceFile: string): void {
  const reviewEntries = entries
    .map(({ chunk, classification }) => buildReviewEntry(
      chunk as Parameters<typeof buildReviewEntry>[0],
      classification as Parameters<typeof buildReviewEntry>[1],
      sourceFile
    ))
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

// Shared post-process for EVERY written file (deterministic baseline AND
// agent/LLM-filled content): force id == filename, drop residual placeholders
// and the forbidden `status` field, strip ghost wikilinks, guarantee required
// frontmatter. Idempotent on already-normalized content. Falls back to the raw
// content if frontmatter can't be parsed (lint will then flag it).
function normalizeWrittenFile(filePath: string, content: string): string {
  try {
    const parsed = matter(content)
    const id = path.basename(filePath, '.md')
    const { fm, body } = normalizeKbFile(parsed.data || {}, parsed.content || '', { id })
    return matterStringify(body, fm)
  } catch {
    return content
  }
}

function validateKbPath(filePath: string): string | null {
  const resolved = path.resolve(filePath)
  const kbDir = path.resolve('knowledge')
  if (!resolved.startsWith(kbDir + path.sep) && resolved !== kbDir) {
    return 'file_path must be inside the knowledge/ directory'
  }
  return null
}

async function applyImportFiles(files_to_write: FileToWrite[], dry_run: boolean): Promise<Record<string, unknown> & { written: string[]; skipped: Array<{ path: string; reason: string }> }> {
  const written: string[] = []
  const skipped: Array<{ path: string; reason: string }> = []

  for (const { path: filePath, content } of files_to_write) {
    if (!filePath || !content) continue

    const pathError = validateKbPath(filePath)
    if (pathError) {
      skipped.push({ path: filePath, reason: pathError })
      continue
    }

    if (fs.existsSync(filePath)) {
      skipped.push({ path: filePath, reason: 'already exists' })
      continue
    }

    const finalContent = normalizeWrittenFile(filePath, content)

    if (!dry_run) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, finalContent, 'utf8')
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

const definition: ToolDefinition = {
  name: 'kb_import',
  description: 'Import a document (PDF/DOCX/HTML/MD/TXT) into the KB. Auto-classify mode (recommended): Phase 1 extracts and classifies in batches (multi-label). Phase 2 returns an import plan with proposed files and cross-references, plus per-file fill prompts (structural fill is ON by default — lifts prose into Fields/Rules tables; pass no_fill: true for the cheap baseline-only run). Phase 3 (approve: true) writes files. Images are extracted to per-document asset folders and embedded as Obsidian ![[...]] links — auto_classify mode only. Classic mode: Phase 1 returns chunks, Phase 2 writes agent-generated files.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Path to the source document (PDF, DOCX, MD, TXT, HTML)' },
      dry_run: { type: 'boolean', description: 'Preview without writing', default: false },
      auto_classify: { type: 'boolean', description: 'Paginated classification mode — returns chunks in batches for agent to classify, then returns import plan for approval', default: false },
      approve: { type: 'boolean', description: 'Execute a previously generated import plan (requires auto_classify)', default: false },
      classifications: { type: 'array', description: 'Agent multi-label classification results from previous batch', items: { type: 'object', properties: { chunk_id: { type: 'string' }, types: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, confidence: { type: 'number' }, suggested_id: { type: 'string' }, reason: { type: 'string' } }, required: ['type', 'confidence', 'suggested_id'] } }, suggested_group: { type: 'string' }, duplicate_of: { type: 'string' } }, required: ['chunk_id', 'types'] } },
      cursor: { type: 'number', description: 'Current position in chunk list (returned by previous auto_classify call)' },
      restart: { type: 'boolean', description: 'Discard any saved progress for this source and re-import from scratch (auto_classify)', default: false },
      no_fill: { type: 'boolean', description: 'Opt out of structural fill (default ON). With no_fill, the plan writes the deterministic baseline only — prose stays under ## Imported Content and is NOT lifted into Fields/Rules tables.', default: false },
      files_to_write: { type: 'array', description: 'Classic Phase 2: agent-generated files to write', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }
    }
  }
}

export { runTool, definition }
