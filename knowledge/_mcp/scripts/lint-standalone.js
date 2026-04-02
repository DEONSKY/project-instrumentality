#!/usr/bin/env node
'use strict'

/**
 * Standalone lint script for pre-commit hook.
 * Runs without MCP server — safe for all editors (Cursor, VSCode, CLI).
 * Warns but does not block commits (exits 0).
 */

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const KB_ROOT = 'knowledge'
const REQUIRED_FRONTMATTER = ['id', 'app_scope', 'created']
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', '_templates', 'sync'])

// ─── Rules loading (inline — no require('../lib/rules') to stay standalone) ───

function loadRules() {
  const rulesPath = path.join(KB_ROOT, '_rules.md')
  if (!fs.existsSync(rulesPath)) return getDefaultRules()

  try {
    const content = fs.readFileSync(rulesPath, 'utf8')
    const parsed = matter(content)
    return parsed.data || getDefaultRules()
  } catch {
    return getDefaultRules()
  }
}

function getDefaultRules() {
  return {
    secret_patterns: ['sk_live_', 'Bearer ', 'private_key', 'password:', 'api_key:', 'secret:'],
    depth_policy: {
      default_max: 3,
      overrides: { features: 3, flows: 2, ui: 2, integrations: 2, data: 1, validation: 1, decisions: 1, foundation: 1, sync: 1 },
      never_group: ['data', 'validation', 'decisions', 'foundation', 'sync']
    }
  }
}

// ─── Scan for secret patterns ─────────────────────────────────────────────────

function scanSecrets(content, patterns) {
  const hits = []
  const lines = content.split('\n')
  const pats = patterns || []

  lines.forEach((line, idx) => {
    pats.forEach(pat => {
      const col = line.indexOf(pat)
      if (col !== -1) {
        hits.push({ pattern: pat, line: idx + 1, column: col + 1 })
      }
    })
  })

  return hits
}

// ─── Depth check ──────────────────────────────────────────────────────────────

function measureDepth(filePath) {
  const rel = filePath.replace(/^knowledge\//, '')
  return rel.split('/').length - 1
}

function getMaxDepth(filePath, rules) {
  const rel = filePath.replace(/^knowledge\//, '')
  const topFolder = rel.split('/')[0]
  const policy = rules.depth_policy || {}
  const overrides = policy.overrides || {}
  return overrides[topFolder] ?? policy.default_max ?? 3
}

// ─── Wikilink extraction ─────────────────────────────────────────────────────

function extractMentions(content) {
  // Strip fenced code blocks and inline code before scanning
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  const regex = /\[\[([^\]|#]+?)(?:#[^\]|]+?)?(?:\|[^\]]+?)?\]\]/g
  const mentions = []
  let match
  while ((match = regex.exec(stripped)) !== null) {
    const p = match[1].trim()
    if (p) mentions.push(p)
  }
  return [...new Set(mentions)]
}

// ─── Lint a single file ───────────────────────────────────────────────────────

function lintFile(filePath, rules) {
  const violations = []

  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    return [{ file: filePath, severity: 'error', message: `Cannot read: ${e.message}` }]
  }

  // Skip rules
  if (filePath.endsWith('_rules.md')) return []

  // Tier 1: _index.yaml must have AUTO-GENERATED header
  if (filePath.endsWith('_index.yaml')) {
    const firstLine = content.split('\n')[0] || ''
    if (!firstLine.startsWith('# AUTO-GENERATED')) {
      violations.push({ file: filePath, severity: 'warn', message: '_index.yaml missing AUTO-GENERATED header — was it edited manually? Run kb_reindex to restore.' })
    }
    return violations
  }

  // Conflict markers
  if (content.includes('<<<<<<<')) {
    violations.push({ file: filePath, severity: 'error', message: 'Unresolved git conflict markers' })
  }

  // Parse front-matter
  let data = {}
  try {
    data = matter(content).data || {}
  } catch (e) {
    violations.push({ file: filePath, severity: 'error', message: `Invalid YAML front-matter: ${e.message}` })
    return violations
  }

  // Prompt override files — lighter checks
  if (filePath.includes('_prompt-overrides/')) {
    if (!data.base) violations.push({ file: filePath, severity: 'error', message: 'Prompt override missing: base' })
    if (!data.override) violations.push({ file: filePath, severity: 'error', message: 'Prompt override missing: override' })
    return violations
  }

  // Required front-matter
  REQUIRED_FRONTMATTER.forEach(field => {
    if (!data[field]) {
      violations.push({ file: filePath, severity: 'error', message: `Missing front-matter: ${field}` })
    }
  })

  // No status field in KB files
  if (data.status !== undefined) {
    violations.push({ file: filePath, severity: 'warn', message: 'status belongs in _index.yaml, not KB files' })
  }

  // Depth
  const depth = measureDepth(filePath)
  const maxDepth = getMaxDepth(filePath, rules)
  if (depth > maxDepth) {
    violations.push({ file: filePath, severity: 'error', message: `Depth ${depth} exceeds max ${maxDepth} for this folder` })
  }

  // Secrets
  const secretHits = scanSecrets(content, rules.secret_patterns)
  secretHits.forEach(hit => {
    violations.push({ file: filePath, severity: 'error', message: `Secret pattern: "${hit.pattern}" at line ${hit.line}` })
  })

  // Wikilink existence (warn only)
  extractMentions(content).forEach(mention => {
    const fullPath = path.join(KB_ROOT, mention)
    const exists = fs.existsSync(fullPath) ||
      fs.existsSync(fullPath + '.md') ||
      (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory())
    if (!exists) {
      violations.push({ file: filePath, severity: 'warn', message: `Wikilink target not found: ${mention}` })
    }
  })

  return violations
}

// ─── Collect all KB files ─────────────────────────────────────────────────────

function collectKBFiles() {
  const files = []

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
      } else if (entry.name.endsWith('.md')) {
        const SYNC_SKIP = new Set(['code-drift.md', 'kb-drift.md'])
        if (!SYNC_SKIP.has(entry.name)) files.push(full)
      }
    })
  }

  walk(KB_ROOT)
  return files
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Only run if knowledge/ folder exists
  if (!fs.existsSync(KB_ROOT)) {
    process.exit(0)
  }

  const rules = loadRules()

  // Check only staged files if possible, else all
  let filesToCheck = []

  // Prefer staged files from git (passed via env or args)
  const stagedArg = process.argv[2]
  if (stagedArg && fs.existsSync(stagedArg)) {
    filesToCheck = [stagedArg]
  } else {
    filesToCheck = collectKBFiles()
  }

  const violations = []
  filesToCheck.forEach(f => {
    violations.push(...lintFile(f, rules))
  })

  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warn')

  if (violations.length === 0) {
    process.exit(0)
  }

  // Print warnings
  warnings.forEach(w => {
    process.stderr.write(`[kb-lint] WARN  ${w.file}: ${w.message}\n`)
  })

  // Print errors
  errors.forEach(e => {
    process.stderr.write(`[kb-lint] ERROR ${e.file}: ${e.message}\n`)
  })

  if (errors.length > 0) {
    process.stderr.write(`\n[kb-lint] ${errors.length} error(s), ${warnings.length} warning(s). Fix errors before committing.\n`)
  } else {
    process.stderr.write(`\n[kb-lint] ${warnings.length} warning(s).\n`)
  }

  // Warn but never block (exit 0)
  process.exit(0)
}

main()
