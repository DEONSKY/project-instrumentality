const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: get } = require('./get')
const { stripInlineMarkdown, parseInlineFormatting } = require('../lib/md-to-runs')

const SUPPORTED_FORMATS = ['pdf', 'docx', 'markdown', 'confluence', 'notion', 'html', 'json']
const OUTPUT_DIR = 'knowledge/exports'
const MAX_EXPORT_CHARS = 80000
const SESSION_TTL_MS = 10 * 60 * 1000

// ── Session cache for paginated exports ──────────────────────────────────────
const exportSessions = new Map()

function getSession(key) {
  const session = exportSessions.get(key)
  if (!session) return null
  if (Date.now() - session.created > SESSION_TTL_MS) {
    exportSessions.delete(key)
    return null
  }
  return session
}

function clearSession(key) {
  exportSessions.delete(key)
}

function sessionKey(scope, format, type) {
  const s = Array.isArray(scope) ? scope.join('+') : (scope || 'all')
  return `${s}:${format}:${type || 'any'}`
}

/**
 * kb_export — Two-phase export with optional purpose, type filter, multi-scope, and pagination.
 *
 * Phase 1 (no rendered_content): Gathers KB files for the scope.
 *   For json: writes immediately (no AI needed).
 *   For other formats: returns { files, prompt } — agent renders the content.
 *   Large KBs are paginated automatically.
 *
 * Phase 2 (with rendered_content): Writes the agent-rendered content to disk.
 */
async function runTool({
  scope = 'all',
  format = 'markdown',
  type: typeFilter = null,
  purpose = null,
  app_scope: app_scope_filter = null,
  page = null,
  dry_run = false,
  rendered_content
} = {}) {
  if (!SUPPORTED_FORMATS.includes(format)) {
    return { error: `Unsupported format: ${format}. Supported: ${SUPPORTED_FORMATS.join(', ')}` }
  }

  const exportDate = new Date().toISOString().split('T')[0]
  const outputPath = buildOutputPath(format, scope, exportDate)
  const sKey = sessionKey(scope, format, typeFilter)

  // ── Phase 2: write agent-rendered content ─────────────────────────────────
  if (rendered_content !== undefined) {
    clearSession(sKey)
    if (!dry_run) {
      await writeOutput(rendered_content, format, outputPath)
    }
    return {
      output_path: dry_run ? null : outputPath,
      format,
      scope,
      dry_run,
      note: 'Export does not trigger drift detection or sync notes.'
    }
  }

  // ── Paginated continuation ────────────────────────────────────────────────
  if (page !== null && page > 1) {
    const session = getSession(sKey)
    if (!session) {
      return { error: 'Export session expired or not found. Start a new export.' }
    }
    return buildPageResponse(session, page)
  }

  // ── Phase 1: gather files, build prompt ───────────────────────────────────
  const files = await gatherContent(scope, app_scope_filter, typeFilter)

  if (files.length === 0) {
    const scopeLabel = Array.isArray(scope) ? scope.join(', ') : scope
    return { error: `No KB files found for scope: ${scopeLabel}${typeFilter ? ` (type: ${typeFilter})` : ''}` }
  }

  // JSON needs no AI — write immediately
  if (format === 'json') {
    const content = JSON.stringify(files.map(f => ({ id: f.id, type: f.type, path: f.path, content: f.content })), null, 2)
    if (!dry_run) {
      await writeOutput(content, format, outputPath)
    }
    return {
      output_path: dry_run ? null : outputPath,
      format,
      scope,
      files_included: files.length,
      dry_run,
      note: 'Export does not trigger drift detection or sync notes.'
    }
  }

  // Build prompt context
  const projectName = getProjectName()
  const purposeText = purpose || 'No specific purpose given. Produce a neutral technical reference document.'
  const scopeLabel = Array.isArray(scope) ? scope.join(', ') : scope

  const combinedContent = files.map(f => `<!-- ${f.path} -->\n${f.content}`).join('\n\n---\n\n')

  // Check if pagination is needed
  if (combinedContent.length > MAX_EXPORT_CHARS) {
    return startPaginatedExport(files, sKey, {
      scope, scopeLabel, format, purpose: purposeText,
      projectName, exportDate, outputPath, dry_run
    })
  }

  // Single-page export
  const prompt = resolvePrompt('export-format', {
    scope_label: scopeLabel,
    export_format: format,
    kb_files: combinedContent,
    project_name: projectName,
    export_date: exportDate,
    purpose: purposeText
  })

  return {
    files_included: files.length,
    format,
    scope,
    output_path: outputPath,
    prompt,
    _instruction: `Render the KB content using the prompt above, then call kb_export({ scope: ${JSON.stringify(scope)}, format: "${format}", rendered_content: "<your output>" }) to write it to disk.`
  }
}

// ── Pagination ──────────────────────────────────────────────────────────────

function startPaginatedExport(files, sKey, ctx) {
  const pages = []
  let currentPage = []
  let currentSize = 0

  for (const file of files) {
    const entry = `<!-- ${file.path} -->\n${file.content}`
    if (currentSize + entry.length > MAX_EXPORT_CHARS && currentPage.length > 0) {
      pages.push(currentPage)
      currentPage = []
      currentSize = 0
    }
    currentPage.push(entry)
    currentSize += entry.length
  }
  if (currentPage.length > 0) pages.push(currentPage)

  const session = {
    pages,
    scope: ctx.scope,
    scopeLabel: ctx.scopeLabel,
    format: ctx.format,
    purpose: ctx.purpose,
    projectName: ctx.projectName,
    exportDate: ctx.exportDate,
    outputPath: ctx.outputPath,
    created: Date.now()
  }
  exportSessions.set(sKey, session)

  return buildPageResponse(session, 1)
}

function buildPageResponse(session, pageNum) {
  const { pages, scopeLabel, format, purpose, projectName, exportDate, scope } = session
  const totalPages = pages.length

  if (pageNum > totalPages) {
    return { error: `Page ${pageNum} exceeds total pages (${totalPages}).` }
  }

  const pageContent = pages[pageNum - 1].join('\n\n---\n\n')

  const prompt = resolvePrompt('export-format', {
    scope_label: scopeLabel,
    export_format: format,
    kb_files: pageContent,
    project_name: projectName,
    export_date: exportDate,
    purpose: purpose
  })

  const isLastPage = pageNum === totalPages

  return {
    format,
    scope,
    total_pages: totalPages,
    current_page: pageNum,
    files_in_page: pages[pageNum - 1].length,
    prompt,
    _instruction: isLastPage
      ? `This is the last page (${pageNum}/${totalPages}). Render this page, combine with all previous pages, then call kb_export({ scope: ${JSON.stringify(scope)}, format: "${format}", rendered_content: "<combined output>" }) to write to disk.`
      : `Render this page (${pageNum}/${totalPages}). Then call kb_export({ scope: ${JSON.stringify(scope)}, format: "${format}", page: ${pageNum + 1} }) to get the next page.`
  }
}

// ── Content gathering ───────────────────────────────────────────────────────

async function gatherContent(scope, app_scope_filter, typeFilter) {
  const result = await get({ task_type: 'export', scope, app_scope: app_scope_filter, type: typeFilter })
  if (!result.files) return []
  return result.files.map(file => ({
    path: file.path,
    id: file.id,
    type: file.type,
    app_scope: file.app_scope,
    content: stripFrontMatter(stripInternalContent(file.content))
  })).filter(f => f.content.length > 20)
}

function stripInternalContent(content) {
  let cleaned = content
  cleaned = cleaned.replace(/^## Open questions[\s\S]*?(?=\n## |\n---|\n$)/gim, '')
  cleaned = cleaned.replace(/^## Changelog[\s\S]*?(?=\n## |\n---|\n$)/gim, '')
  cleaned = cleaned.replace(/\[\[([^\]|#]+?)(?:#[^\]|]+?)?(?:\|([^\]]+?))?\]\]/g, (_, path, display) => display || path)
  return cleaned.trim()
}

function stripFrontMatter(content) {
  return matter(content).content.trim()
}

function getProjectName() {
  const rulesPath = 'knowledge/_rules.md'
  if (fs.existsSync(rulesPath)) {
    try {
      const parsed = matter(fs.readFileSync(rulesPath, 'utf8'))
      if (parsed.data.project_name) return parsed.data.project_name
    } catch { /* fall through */ }
  }
  const globalRulesPath = 'knowledge/standards/global.md'
  if (fs.existsSync(globalRulesPath)) {
    try {
      const parsed = matter(fs.readFileSync(globalRulesPath, 'utf8'))
      if (parsed.data.project_name) return parsed.data.project_name
    } catch { /* fall through */ }
  }
  return 'Project'
}

function buildOutputPath(format, scope, exportDate) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const raw = Array.isArray(scope) ? scope.join('-') : scope
  const slug = raw.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const ext = format === 'markdown' ? 'md' : format === 'confluence' ? 'txt' : format
  return path.join(OUTPUT_DIR, `${slug}-${exportDate}.${ext}`)
}

// ── Writers ─────────────────────────────────────────────────────────────────

async function writeOutput(content, format, outputPath) {
  if (format === 'pdf') return writePdf(content, outputPath)
  if (format === 'docx') return writeDocx(content, outputPath)
  fs.writeFileSync(outputPath, content, 'utf8')
}

async function writePdf(content, outputPath) {
  const PDFDocument = require('pdfkit')
  const doc = new PDFDocument({ margin: 60 })
  const stream = fs.createWriteStream(outputPath)
  doc.pipe(stream)

  let isFirstH1 = true
  const lines = content.split('\n')

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (!isFirstH1) doc.addPage()
      isFirstH1 = false
      doc.fontSize(24).font('Helvetica-Bold').text(line.slice(2), { paragraphGap: 10 })
    } else if (line.startsWith('## ')) {
      doc.fontSize(18).font('Helvetica-Bold').text(line.slice(3), { paragraphGap: 8 })
    } else if (line.startsWith('### ')) {
      doc.fontSize(14).font('Helvetica-Bold').text(line.slice(4), { paragraphGap: 6 })
    } else if (line.startsWith('#### ')) {
      doc.fontSize(12).font('Helvetica-Bold').text(line.slice(5), { paragraphGap: 4 })
    } else if (line.startsWith('- ')) {
      doc.fontSize(11).font('Helvetica').text(`  \u2022  ${stripInlineMarkdown(line.slice(2))}`, { indent: 15 })
    } else if (/^\d+\.\s/.test(line)) {
      doc.fontSize(11).font('Helvetica').text(`  ${stripInlineMarkdown(line)}`, { indent: 15 })
    } else if (line.startsWith('---')) {
      doc.moveDown(1)
    } else if (line.trim() === '') {
      doc.moveDown(0.5)
    } else {
      doc.fontSize(11).font('Helvetica').text(stripInlineMarkdown(line), { paragraphGap: 2 })
    }
  }

  doc.end()
  return new Promise(resolve => stream.on('finish', resolve))
}

async function writeDocx(content, outputPath) {
  const { Document, Packer, Paragraph, HeadingLevel } = require('docx')

  const lines = content.split('\n')
  const children = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }))
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }))
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }))
    } else if (line.startsWith('#### ')) {
      children.push(new Paragraph({ text: line.slice(5), heading: HeadingLevel.HEADING_4 }))
    } else if (line.startsWith('- ')) {
      children.push(new Paragraph({
        children: parseInlineFormatting(line.slice(2)),
        bullet: { level: 0 }
      }))
    } else if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({
        children: parseInlineFormatting(line.replace(/^\d+\.\s/, '')),
        numbering: { reference: 'default-numbering', level: 0 }
      }))
    } else if (line.trim() === '' || line.startsWith('---')) {
      children.push(new Paragraph({ text: '' }))
    } else {
      children.push(new Paragraph({ children: parseInlineFormatting(line) }))
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', start: 1 }]
      }]
    },
    sections: [{ children }]
  })
  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(outputPath, buffer)
}

module.exports = { runTool }
