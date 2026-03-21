const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: get } = require('./get')

const SUPPORTED_FORMATS = ['pdf', 'docx', 'markdown', 'confluence', 'notion', 'html', 'json']
const OUTPUT_DIR = 'knowledge/exports'

/**
 * kb_export — Two-phase export.
 *
 * Phase 1 (no rendered_content): Gathers KB files for the scope.
 *   For json: writes immediately (no AI needed).
 *   For other formats: returns { files, prompt } — agent renders the content
 *   and calls kb_export({ scope, format, rendered_content }) to write it.
 *
 * Phase 2 (with rendered_content): Writes the agent-rendered content to disk.
 */
async function runTool({
  scope = 'all',
  format = 'markdown',
  app_scope: app_scope_filter = null,
  dry_run = false,
  rendered_content
} = {}) {
  if (!SUPPORTED_FORMATS.includes(format)) {
    return { error: `Unsupported format: ${format}. Supported: ${SUPPORTED_FORMATS.join(', ')}` }
  }

  const exportDate = new Date().toISOString().split('T')[0]
  const outputPath = buildOutputPath(format, scope, exportDate)

  // ── Phase 2: write agent-rendered content ─────────────────────────────────
  if (rendered_content !== undefined) {
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

  // ── Phase 1: gather files, build prompt ───────────────────────────────────
  const files = await gatherContent(scope, app_scope_filter)

  if (files.length === 0) {
    return { error: `No KB files found for scope: ${scope}` }
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

  // For all other formats, build prompt for agent
  const projectName = getProjectName()
  const combinedContent = files.map(f => `<!-- ${f.path} -->\n${f.content}`).join('\n\n---\n\n')

  const prompt = resolvePrompt('export-format', {
    scope_label: scope,
    export_format: format,
    kb_files: combinedContent.slice(0, 8000),
    project_name: projectName,
    export_date: exportDate
  })

  return {
    files_included: files.length,
    format,
    scope,
    output_path: outputPath,
    prompt,
    _instruction: `Render the KB content using the prompt above, then call kb_export({ scope: "${scope}", format: "${format}", rendered_content: "<your output>" }) to write it to disk.`
  }
}

async function gatherContent(scope, app_scope_filter) {
  const result = await get({ task_type: 'export', scope, app_scope: app_scope_filter })
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
  cleaned = cleaned.replace(/@[\w/-]+(?:#[\w-]+)?/g, '[ref]')
  return cleaned.trim()
}

function stripFrontMatter(content) {
  return matter(content).content.trim()
}

function getProjectName() {
  // Primary source: _rules.md front-matter (set by kb_init)
  const rulesPath = 'knowledge/_rules.md'
  if (fs.existsSync(rulesPath)) {
    try {
      const parsed = matter(fs.readFileSync(rulesPath, 'utf8'))
      if (parsed.data.project_name) return parsed.data.project_name
    } catch { /* fall through */ }
  }
  // Fallback: foundation/global-rules.md
  const globalRulesPath = 'knowledge/foundation/global-rules.md'
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
  const slug = scope.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const ext = format === 'markdown' ? 'md' : format === 'confluence' ? 'txt' : format
  return path.join(OUTPUT_DIR, `${slug}-${exportDate}.${ext}`)
}

async function writeOutput(content, format, outputPath) {
  if (format === 'pdf') {
    const PDFDocument = require('pdfkit')
    const doc = new PDFDocument()
    const stream = fs.createWriteStream(outputPath)
    doc.pipe(stream)
    doc.fontSize(11).text(content)
    doc.end()
    return new Promise(resolve => stream.on('finish', resolve))
  }
  if (format === 'docx') {
    const { Document, Packer, Paragraph } = require('docx')
    const lines = content.split('\n')
    const children = lines.map(line => new Paragraph({ text: line }))
    const doc = new Document({ sections: [{ children }] })
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(outputPath, buffer)
    return
  }
  fs.writeFileSync(outputPath, content, 'utf8')
}

module.exports = { runTool }
