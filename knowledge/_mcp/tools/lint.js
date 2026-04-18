const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { loadRules } = require('../lib/rules')
const { extractMentions } = require('../lib/mentions')
const { validateDepth } = require('../lib/depth')
const { inferType } = require('../lib/types')
const { scan: scanSecrets } = require('../lib/secrets')
const { loadGraph } = require('../lib/graph')

const KB_ROOT = 'knowledge'
const REQUIRED_FRONTMATTER = ['id', 'app_scope', 'created']

// Folders whose files are not KB content — skip linting
const SKIP_LINT_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', '_templates', 'drift-log', 'sync', '.obsidian'])

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

  // Type/folder mismatch check
  const relativePath = filePath.replace(/^knowledge\//, '')
  const inferredType = inferType(relativePath)
  if (data.type && inferredType !== 'unknown' && data.type !== inferredType) {
    const folder = relativePath.split('/')[0]
    violations.push({
      file: filePath,
      line: 1,
      severity: 'warn',
      message: `Frontmatter type '${data.type}' does not match folder-inferred type '${inferredType}' for folder '${folder}/'. Either move the file to the correct folder or update the type field.`
    })
  }

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

  // Detect unfilled {{placeholders}} from templates
  const placeholderNames = []
  let firstPlaceholderLine = 0
  content.split('\n').forEach((line, idx) => {
    const re = /\{\{([^}]+)\}\}/g
    let m
    while ((m = re.exec(line)) !== null) {
      if (!firstPlaceholderLine) firstPlaceholderLine = idx + 1
      placeholderNames.push(m[1].trim())
    }
  })
  if (placeholderNames.length > 0) {
    const unique = [...new Set(placeholderNames)]
    const isAlwaysLoad = data.always_load === true
    violations.push({
      file: filePath,
      line: firstPlaceholderLine,
      severity: isAlwaysLoad ? 'error' : 'warn',
      message: `${placeholderNames.length} unfilled placeholder(s): ${unique.join(', ')}${isAlwaysLoad ? '. This file has always_load:true — unfilled placeholders waste tokens on EVERY query. Fill or remove them immediately.' : '. Fill these placeholders or remove the unused sections.'}`
    })
  }

  // Empty tags — files without tags are invisible to kb_get keyword search
  const tags = data.tags
  if (!tags || (Array.isArray(tags) && tags.length === 0)) {
    violations.push({
      file: filePath,
      line: 1,
      severity: 'warn',
      message: 'No tags defined. This file will only be found by path or id match in kb_get. Add domain keywords to the tags array, or run kb_autotag to extract them from content.'
    })
  }

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

function buildGitignoreChecker() {
  const patterns = []

  const sources = [
    { filePath: '.gitignore', base: '' },
    { filePath: path.join(KB_ROOT, '.gitignore'), base: KB_ROOT + '/' },
  ]

  for (const { filePath, base } of sources) {
    if (!fs.existsSync(filePath)) continue
    const lines = fs.readFileSync(filePath, 'utf8').split('\n')

    for (let line of lines) {
      line = line.trim()
      if (!line || line.startsWith('#')) continue

      const negated = line.startsWith('!')
      if (negated) line = line.slice(1).trim()

      const isDirOnly = line.endsWith('/')
      if (isDirOnly) line = line.slice(0, -1)

      const isRooted = line.startsWith('/')
      if (isRooted) line = line.slice(1)

      const hasSlash = line.includes('/')

      // Convert glob to regex
      const pat = line
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\x00')
        .replace(/\*/g, '[^/]*')
        .replace(/\x00/g, '.*')
        .replace(/\?/g, '[^/]')

      let regex
      if (hasSlash || isRooted) {
        const escapedBase = base.replace(/[.+^${}()|[\]\\]/g, '\\$&')
        regex = new RegExp('^' + escapedBase + pat + '(/|$)')
      } else {
        regex = new RegExp('(^|/)' + pat + '(/|$)')
      }

      patterns.push({ regex, negated })
    }
  }

  return (filePath) => {
    let ignored = false
    for (const { regex, negated } of patterns) {
      if (regex.test(filePath)) ignored = !negated
    }
    return ignored
  }
}

function collectKBFiles() {
  const files = []
  const isGitignored = buildGitignoreChecker()

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_LINT_DIRS.has(entry.name) && !isGitignored(full)) walk(full)
      } else if (entry.name.endsWith('.md')) {
        if (!isGitignored(full)) files.push(full)
      }
    })
  }

  walk(KB_ROOT)
  return files
}

module.exports = { runTool }
