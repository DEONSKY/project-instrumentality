const fs = require('fs')
const path = require('path')
const { loadRules } = require('../lib/rules')
const { matchAllPatterns, resolveKbTarget } = require('../lib/patterns')
const { runTool: write } = require('./write')

const KB_ROOT = 'knowledge'
const SKIP_SCAN = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  'knowledge', '.cursor', '.vscode', '.idea', '__pycache__', '.mypy_cache',
  'vendor', 'target', '.gradle', 'bin', 'obj'
])

/**
 * kb_analyze — Scan project source files and generate a KB coverage inventory.
 * Groups source files by their KB target (using code_path_patterns from _rules.md)
 * and optionally writes draft KB files for uncovered groups.
 */
async function runTool({ depth = 4, write_drafts = false } = {}) {
  const rules = loadRules(KB_ROOT)
  const raw = rules.getRaw()

  if (!raw.code_path_patterns || raw.code_path_patterns.length === 0) {
    return {
      error: 'No code_path_patterns found in _rules.md. Run kb_init or copy patterns from knowledge/_mcp/presets/<stack>.yaml first.'
    }
  }
  const patterns = raw.code_path_patterns

  // 1. Collect source files
  const sourceFiles = collectSourceFiles(process.cwd(), depth)

  // 2. Match each file against code_path_patterns
  const grouped = groupByKbTarget(sourceFiles, patterns)

  // 3. Build inventory per KB target
  const inventory = buildInventory(grouped)

  // 4. Optionally write draft KB files
  if (write_drafts) {
    const draftsWritten = []
    for (const item of inventory) {
      if (item.existing_kb_file || item.suggested_action === 'skip') continue
      const result = await writeDraftFile(item)
      if (result) draftsWritten.push(result)
    }
    return {
      inventory,
      drafts_written: draftsWritten,
      total_source_files: sourceFiles.length,
      total_groups: inventory.length,
      message: `${draftsWritten.length} draft KB file(s) created. Review and flesh out each one.`
    }
  }

  return {
    inventory,
    total_source_files: sourceFiles.length,
    total_groups: inventory.length,
    unmatched_count: grouped.get('_unmatched') ? grouped.get('_unmatched').files.length : 0,
    _instruction: 'Review the inventory. Call kb_analyze with write_drafts=true to create draft KB files, or use kb_scaffold to create specific files.'
  }
}

function collectSourceFiles(rootDir, maxDepth) {
  const files = []

  function walk(dir, currentDepth) {
    if (currentDepth > maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (SKIP_SCAN.has(entry.name)) continue

      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, currentDepth + 1)
      } else if (entry.isFile()) {
        const relPath = path.relative(rootDir, fullPath)
        // Skip non-source files
        if (isSourceFile(entry.name)) {
          files.push(relPath)
        }
      }
    }
  }

  walk(rootDir, 0)
  return files
}

function isSourceFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  const sourceExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
    '.py', '.rb', '.go', '.java', '.kt', '.kts',
    '.rs', '.cs', '.swift', '.dart',
    '.php', '.ex', '.exs', '.clj', '.scala'
  ])
  // Also match config files that patterns might reference
  const configFiles = new Set([
    'package.json', 'tsconfig.json', 'go.mod', 'pom.xml',
    'build.gradle', 'build.gradle.kts', 'requirements.txt',
    'pyproject.toml', 'Gemfile', 'Cargo.toml'
  ])
  return sourceExtensions.has(ext) || configFiles.has(filename)
}

function groupByKbTarget(sourceFiles, patterns) {
  const groups = new Map()

  for (const file of sourceFiles) {
    const matches = matchAllPatterns(file, patterns)

    if (matches.length === 0) {
      if (!groups.has('_unmatched')) {
        groups.set('_unmatched', { intent: 'unmatched', kb_target: null, files: [] })
      }
      groups.get('_unmatched').files.push(file)
      continue
    }

    for (const pattern of matches) {
      const target = resolveKbTarget(pattern, file)
      if (!groups.has(target)) {
        groups.set(target, { intent: pattern.intent, kb_target: target, files: [] })
      }
      groups.get(target).files.push(file)
    }
  }

  return groups
}

function buildInventory(grouped) {
  const inventory = []

  for (const [key, group] of grouped) {
    if (key === '_unmatched') {
      inventory.push({
        kb_target: null,
        intent: 'unmatched',
        file_count: group.files.length,
        sample_files: group.files.slice(0, 10),
        existing_kb_file: false,
        suggested_action: 'skip',
        note: 'These files do not match any code_path_pattern. Add patterns to _rules.md to cover them.'
      })
      continue
    }

    const kbFilePath = path.join(KB_ROOT, group.kb_target)
    const kbFileWithExt = kbFilePath.endsWith('.md') ? kbFilePath : kbFilePath + '.md'
    const exists = fs.existsSync(kbFileWithExt)

    inventory.push({
      kb_target: group.kb_target,
      intent: group.intent,
      file_count: group.files.length,
      sample_files: group.files.slice(0, 10),
      existing_kb_file: exists,
      suggested_action: exists ? 'review' : 'create'
    })
  }

  // Sort: create first, then review, then skip
  const actionOrder = { create: 0, review: 1, skip: 2 }
  inventory.sort((a, b) =>
    (actionOrder[a.suggested_action] ?? 9) - (actionOrder[b.suggested_action] ?? 9) ||
    b.file_count - a.file_count
  )

  return inventory
}

async function writeDraftFile(item) {
  const today = new Date().toISOString().split('T')[0]
  const id = item.kb_target
    ? path.basename(item.kb_target, '.md')
    : 'unknown'

  const fileList = item.sample_files.map(f => `- \`${f}\``).join('\n')
  const moreNote = item.file_count > 10
    ? `\n- ... and ${item.file_count - 10} more files`
    : ''

  const content = `---
id: ${id}
app_scope: all
created: ${today}
confidence: draft
tags: [auto-generated]
---

## Source files (${item.file_count} total)

${fileList}${moreNote}

## Summary

<!-- DRAFT: Describe what this group of ${item.file_count} source files implements -->

## Key behaviours

<!-- DRAFT: List the main behaviours and rules -->

## Open questions

- What is the primary purpose of these ${item.file_count} source files?
- Are there sub-features that should be separate KB entries?
- What edge cases and validation rules apply?

## Changelog

${today} — draft created by kb_analyze
`

  const filePath = `knowledge/${item.kb_target}`
  const ensuredPath = filePath.endsWith('.md') ? filePath : filePath + '.md'

  try {
    const dir = path.dirname(ensuredPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const result = await write({ file_path: ensuredPath, content })
    return { file_path: ensuredPath, written: result.written }
  } catch (e) {
    return { file_path: ensuredPath, error: e.message }
  }
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_analyze',
    description: 'Analyze project source files and generate a KB coverage inventory. Groups source files by their KB target (using code_path_patterns from _rules.md) and optionally writes draft KB files for uncovered groups. Useful for bootstrapping KB on legacy projects.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Max directory depth to scan (default: 4)', default: 4 },
        write_drafts: { type: 'boolean', description: 'Write draft KB files for uncovered groups', default: false }
      }
    }
  }
}
