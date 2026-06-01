import * as fs from 'fs'
import * as path from 'path'
import matter from 'gray-matter'
import { loadRules } from '../lib/rules'
import { extractMentions } from '../lib/mentions'
import { validateDepth } from '../lib/depth'
import { inferType } from '../lib/types'
import { scan as scanSecrets } from '../lib/secrets'
import { loadGraph } from '../lib/graph'
import { validateStandard } from '../lib/standards'
import type { ToolDefinition } from '../src/types/tool'
import type { Rules } from '../src/types/rules'
import type { Graph } from '../src/types/graph'

const KB_ROOT = 'knowledge'
const REQUIRED_FRONTMATTER = ['id', 'app_scope', 'created']

interface Violation {
  file: string
  line: number
  severity: 'error' | 'warn'
  message: string
}

export interface LintResult {
  violations: Violation[]
  error_count: number
  warn_count: number
}

type Frontmatter = Record<string, unknown>

// Folders whose files are not KB content — skip linting
const SKIP_LINT_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', '_templates', 'drift-log', 'sync', '.obsidian'])

// Called only by kb_reindex — never directly by tools
async function runTool({ file_path = 'all' }: { file_path?: string } = {}): Promise<LintResult> {
  const rules = loadRules(KB_ROOT)
  const graph = loadGraph(KB_ROOT)
  const violations: Violation[] = []

  let filesToCheck: string[] = []

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

function lintFile(filePath: string, rules: Rules, graph: Graph): Violation[] {
  const violations: Violation[] = []
  let content: string

  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    return [{ file: filePath, line: 0, severity: 'error', message: `Cannot read file: ${(e as Error).message}` }]
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
  let data: Frontmatter
  try {
    const parsed = matter(content)
    data = parsed.data || {}
  } catch (e) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: `Invalid YAML front-matter: ${(e as Error).message}` })
    return violations
  }

  // F52: detect `[object Object]` serialization sentinels recursively. These
  // appear in frontmatter when a tool's template substitution path stringifies
  // an object via JS's default toString() (which returns the literal
  // "[object Object]"). The standard-schema validator below sees the structurally-
  // corrupt field (`app_scope: { '[object Object]': null }`) as "field present"
  // and the corruption goes unflagged. Hence the explicit pre-scan.
  checkSerializationSentinels(data, filePath, violations)

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

  // Structured-standard validation: enumerate every failure mode so a single
  // lint run gives the author a complete picture rather than dribbling them
  // out across edits. Lives behind type === 'standard' so feature/flow files
  // don't pay the parse cost. Explicit type: group files (folder notes living
  // under standards/<group>/<group>.md) are exempt — they describe the group,
  // not a standard, so the structured-standard schema doesn't apply.
  if ((data.type === 'standard' || inferredType === 'standard') && data.type !== 'group') {
    const stdResult = validateStandard(data)
    for (const err of stdResult.errors) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `[standard] ${err}` })
    }
    // Soft check: contract standards belong under standards/contracts/. Out-of-place
    // files still validate, but the warning prevents accidental misfiling.
    if (data.kind === 'contract' && !relativePath.startsWith('standards/contracts/')) {
      violations.push({ file: filePath, line: 1, severity: 'warn', message: `[standard] kind: contract should live under standards/contracts/` })
    }
    // Cost/coverage check: kind:llm rules without a detect.pre_filter regex
    // dispatch the LLM for every changed file matching applies_to.paths. A
    // regex hint (e.g. a field-name literal for contract drift) lets MCP's
    // cheap pre-filter skip irrelevant files in current mode.
    if (Array.isArray(data.rules)) {
      for (const rule of data.rules as Array<Record<string, unknown> & { id?: string; detect?: { kind?: string; pre_filter?: string } }>) {
        if (rule && rule.detect && rule.detect.kind === 'llm' && !rule.detect.pre_filter) {
          violations.push({
            file: filePath,
            line: 1,
            severity: 'warn',
            message: `[standard] rule "${rule.id}" uses detect.kind: llm without a detect.pre_filter regex — every changed file matching applies_to.paths will be sent to the LLM. Add a regex hint matching a likely-violation literal to gate dispatch.`
          })
        }
      }
    }
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
  const placeholderNames: string[] = []
  let firstPlaceholderLine = 0
  content.split('\n').forEach((line, idx) => {
    const re = /\{\{([^}]+)\}\}/g
    let m: RegExpExecArray | null
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

/**
 * F52: recursively scan frontmatter for `[object Object]` serialization
 * sentinels. Appears as map keys when a tool stringifies a structured value
 * via JS default toString() (e.g. `app_scope: { '[object Object]': null }`).
 * The downstream schema validator treats the corrupt field as "present" and
 * passes, so this pre-scan is needed to surface the corruption explicitly.
 */
function checkSerializationSentinels(data: unknown, filePath: string, violations: Violation[], pathPrefix = ''): void {
  if (data === null || typeof data !== 'object') return
  if (Array.isArray(data)) {
    data.forEach((item, idx) => checkSerializationSentinels(item, filePath, violations, `${pathPrefix}[${idx}]`))
    return
  }
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key
    if (key === '[object Object]') {
      violations.push({
        file: filePath,
        line: 1,
        severity: 'error',
        message: `Frontmatter at ${fullPath} contains serialization sentinel '[object Object]' as a map key — the file was written by a broken placeholder-substitution path. Rewrite the file or rerun kb_import with a fixed template.`
      })
    }
    if (typeof val === 'string' && val.includes('[object Object]')) {
      violations.push({
        file: filePath,
        line: 1,
        severity: 'error',
        message: `Frontmatter value at ${fullPath} contains serialization sentinel '[object Object]'`
      })
    }
    if (typeof val === 'object' && val !== null) {
      checkSerializationSentinels(val, filePath, violations, fullPath)
    }
  }
}

function lintPromptOverride(filePath: string, data: Frontmatter, rules: Rules, violations: Violation[]): Violation[] {
  const overrides = rules.getPromptOverrides()
  const validTypes = overrides.valid_override_types || []
  const protected_ = overrides.protected || []
  const base = data.base as string | undefined
  const override = data.override as string | undefined

  if (!base) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: 'Prompt override missing required field: base' })
  }
  if (!override) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: 'Prompt override missing required field: override' })
  }
  if (override && !validTypes.includes(override)) {
    violations.push({ file: filePath, line: 1, severity: 'error', message: `Invalid override type: ${override}. Valid: ${validTypes.join(', ')}` })
  }
  if (override === 'suppress') {
    if (base && protected_.includes(base)) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `Cannot suppress protected prompt: ${base}` })
    }
    if (overrides.suppress_requires_reason && !data.reason) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: 'suppress override requires a reason: field' })
    }
  }

  // Check base prompt exists
  if (base) {
    const basePath = path.join(overrides.base_dir || 'knowledge/_templates/prompts', `${base}.md`)
    if (!fs.existsSync(basePath)) {
      violations.push({ file: filePath, line: 1, severity: 'error', message: `Base prompt not found: ${base}` })
    }
  }

  return violations
}

function buildGitignoreChecker(): (filePath: string) => boolean {
  const patterns: Array<{ regex: RegExp; negated: boolean }> = []

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

  return (filePath: string): boolean => {
    let ignored = false
    for (const { regex, negated } of patterns) {
      if (regex.test(filePath)) ignored = !negated
    }
    return ignored
  }
}

function collectKBFiles(): string[] {
  const files: string[] = []
  const isGitignored = buildGitignoreChecker()

  function walk(dir: string): void {
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

export { runTool }
