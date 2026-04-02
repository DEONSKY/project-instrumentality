const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { loadRules } = require('../lib/rules')
const { extractMentions } = require('../lib/mentions')
const { validateDepth } = require('../lib/depth')
const { scan: scanSecrets } = require('../lib/secrets')
const { loadGraph } = require('../lib/graph')

const KB_ROOT = 'knowledge'
const REQUIRED_FRONTMATTER = ['id', 'app_scope', 'created']

// Folders whose files are not KB content — skip linting
const SKIP_LINT_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', '_templates', 'drift-log', 'sync'])

// Called only by kb_reindex — never directly by tools
async function runTool({ file_path = 'all' } = {}) {
  const rules = loadRules(KB_ROOT)
  const graph = loadGraph(KB_ROOT)
  const violations = []

  let filesToCheck = []

  if (file_path === 'all') {
    filesToCheck = collectKBFiles()
  } else {
    if (fs.existsSync(file_path)) filesToCheck = [file_path]
  }

  for (const fp of filesToCheck) {
    const fileViolations = lintFile(fp, rules, graph)
    violations.push(...fileViolations)
  }

  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warn')

  return { violations, error_count: errors.length, warn_count: warnings.length }
}

function lintFile(filePath, rules, graph) {
  const violations = []
  let content

  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    return [{ file: filePath, line: 0, severity: 'error', message: `Cannot read file: ${e.message}` }]
  }

  // Skip rules file
  if (filePath.endsWith('_rules.md')) return []

  // Tier 1: _index.yaml must have AUTO-GENERATED header
  if (filePath.endsWith('_index.yaml')) {
    const firstLine = content.split('\n')[0] || ''
    if (!firstLine.startsWith('# AUTO-GENERATED')) {
      return [{ file: filePath, line: 1, severity: 'warn', message: '_index.yaml missing AUTO-GENERATED header — was it edited manually? Run kb_reindex to restore.' }]
    }
    return []
  }

  // Check for conflict markers
  if (content.includes('<<<<<<<')) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: 'Unresolved git conflict markers found' })
  }

  // Parse front-matter
  let data
  try {
    const parsed = matter(content)
    data = parsed.data || {}
  } catch (e) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: `Invalid YAML front-matter: ${e.message}` })
    return violations
  }

  // Prompt override files have different required fields
  if (filePath.includes('_prompt-overrides/')) {
    return lintPromptOverride(filePath, data, rules, violations)
  }

  // Required front-matter fields
  REQUIRED_FRONTMATTER.forEach(field => {
    if (!data[field]) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `Missing required front-matter field: ${field}` })
    }
  })

  // No status fields allowed
  if (data.status !== undefined) {
    violations.push({ file: filePath, line: 1, severity: 'warn', message: 'status field found in KB file — use frontmatter fields id, type, app_scope, created; workflow state does not belong in KB files' })
  }

  // Depth check
  const depthResult = validateDepth(filePath, rules)
  if (!depthResult.valid) {
    violations.push({
      file: filePath,
      line: 1,
      severity: 'error',
      message: `Depth ${depthResult.actual} exceeds max ${depthResult.max} for this folder. Suggest: ${depthResult.suggestion}`
    })
  }

  // Secret patterns
  const secretHits = scanSecrets(content, rules.getSecretPatterns())
  secretHits.forEach(hit => {
    violations.push({
      file: filePath,
      line: hit.line,
      severity: 'error',
      message: `Secret pattern detected: "${hit.pattern}" at column ${hit.column}`
    })
  })

  // Wikilink resolution
  const mentions = extractMentions(content)

  mentions.forEach(mention => {
    const fullPath = path.join(KB_ROOT, mention)

    // Check file exists — try exact path, then with .md extension, then as directory
    const exists = fs.existsSync(fullPath) ||
      fs.existsSync(fullPath + '.md') ||
      (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory())
    if (!exists) {
      violations.push({
        file: filePath,
        line: 1,
        severity: 'warn',
        message: `Wikilink target not found: ${mention}`
      })
    }
  })

  return violations
}

function lintPromptOverride(filePath, data, rules, violations) {
  const overrides = rules.getPromptOverrides()
  const validTypes = overrides.valid_override_types || []
  const protected_ = overrides.protected || []

  if (!data.base) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: 'Prompt override missing required field: base' })
  }
  if (!data.override) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: 'Prompt override missing required field: override' })
  }
  if (data.override && !validTypes.includes(data.override)) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: `Invalid override type: ${data.override}. Valid: ${validTypes.join(', ')}` })
  }
  if (data.override === 'suppress') {
    if (protected_.includes(data.base)) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `Cannot suppress protected prompt: ${data.base}` })
    }
    if (overrides.suppress_requires_reason && !data.reason) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: 'suppress override requires a reason: field' })
    }
  }

  // Check base prompt exists
  if (data.base) {
    const basePath = path.join(overrides.base_dir || 'knowledge/_templates/prompts', `${data.base}.md`)
    if (!fs.existsSync(basePath)) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `Base prompt not found: ${data.base}` })
    }
  }

  return violations
}

function collectKBFiles() {
  const files = []

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_LINT_DIRS.has(entry.name)) walk(full)
      } else if (entry.name.endsWith('.md')) {
        files.push(full)
      }
    })
  }

  walk(KB_ROOT)
  return files
}

module.exports = { runTool }
