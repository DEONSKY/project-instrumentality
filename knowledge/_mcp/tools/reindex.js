const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const yaml = require('js-yaml')
const { loadGraph, saveGraph } = require('../lib/graph')
const { loadRules } = require('../lib/rules')
const { estimateTokens } = require('../lib/budget')
const { runTool: lint } = require('./lint')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules'])
const SKIP_FILES = new Set(['_index.yaml'])

async function runTool({ silent = false } = {}) {
  const rules = loadRules(KB_ROOT)
  const existingGraph = loadGraph(KB_ROOT)

  const files = {}
  const groups = {}

  // Walk all .md files in knowledge/
  collectMdFiles(KB_ROOT).forEach(filePath => {
    const relative = filePath.replace(/^knowledge\//, '')
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = matter(content)
      const data = parsed.data || {}

      // Detect @mentions and ensure they're in depends_on
      const mentions = extractMentions(parsed.content)
      const existingDeps = data.depends_on || []
      const allDeps = [...new Set([...existingDeps, ...mentions.map(m => m.replace(/^@/, '').split('#')[0])])]
        .filter(d => d && d !== relative)

      const tokensEst = estimateTokens(content)

      const entry = {
        id: data.id || path.basename(filePath, '.md'),
        app_scope: data.app_scope || 'all',
        tokens_est: tokensEst,
        always_load: data.always_load || false,
        depends_on: allDeps,
        affects_flows: data.affects_flows || [],
        tags: data.tags || []
      }

      if (data.owner) entry.owner = data.owner

      // Detect if it's a group file
      if (data.type === 'group' || path.basename(filePath) === '_group.md') {
        entry.type = 'group'
        entry.domain = data.domain || ''
        entry.shared_depends_on = data.shared_depends_on || []
        entry.files = data.files || []
        const groupKey = path.dirname(relative)
        groups[groupKey] = { ...entry, file_count: 0, group_path: relative }
      }

      // Preserve existing sync_state and notes
      const existing = (existingGraph.files || {})[relative]
      if (existing) {
        if (existing.sync_state) entry.sync_state = existing.sync_state
        if (existing.notes && existing.notes.length > 0) {
          entry.notes = deduplicateNotes(existing.notes)
        }
      }

      // Determine group membership
      const parts = relative.split('/')
      if (parts.length >= 2) {
        const groupKey = parts.slice(0, -1).join('/')
        if (groups[groupKey]) {
          entry.group = groupKey
        }
      }

      files[relative] = entry
    } catch (e) {
      if (!silent) console.error(`[reindex] Skipping ${filePath}: ${e.message}`)
    }
  })

  // Update group file counts
  Object.entries(files).forEach(([fp, entry]) => {
    if (entry.group && groups[entry.group]) {
      groups[entry.group].file_count = (groups[entry.group].file_count || 0) + 1
    }
  })

  // Detect orphaned notes
  let orphansFound = 0
  Object.entries(existingGraph.files || {}).forEach(([fp, entry]) => {
    if (entry.notes && !files[fp]) {
      orphansFound++
      appendToDriftLog(`Orphaned note path: ${fp} (file no longer exists)`)
    }
  })

  const newGraph = {
    version: '1.0',
    last_sync: new Date().toISOString().split('T')[0],
    groups,
    files
  }

  // Only write if changed
  const oldContent = fs.existsSync(path.join(KB_ROOT, '_index.yaml'))
    ? fs.readFileSync(path.join(KB_ROOT, '_index.yaml'), 'utf8')
    : ''
  const newContent = yaml.dump(newGraph, { lineWidth: 120, noRefs: true })

  let written = false
  if (oldContent.trim() !== newContent.trim()) {
    saveGraph(newGraph, KB_ROOT)
    appendToChangelog(`reindex: updated _index.yaml (${Object.keys(files).length} files)`)
    written = true
  }

  // Run lint
  const lintResult = await lint({ file_path: 'all' })

  if (!silent) {
    const errors = lintResult.violations.filter(v => v.severity === 'error')
    if (errors.length > 0) {
      console.warn(`[reindex] ${errors.length} lint error(s) found:`)
      errors.forEach(e => console.warn(`  ${e.file}: ${e.message}`))
    }
  }

  return {
    files_indexed: Object.keys(files).length,
    notes_deduped: 0,
    orphans_found: orphansFound,
    lint_errors: lintResult.error_count,
    lint_warnings: lintResult.warn_count,
    index_written: written
  }
}

function deduplicateNotes(notes) {
  const seen = new Set()
  return notes.filter(note => {
    if (seen.has(note.id)) return false
    seen.add(note.id)
    return true
  })
}

function extractMentions(content) {
  const regex = /@([\w/-]+(?:#[\w-]+)?)/g
  const mentions = []
  let match
  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1].split('#')[0])
  }
  return [...new Set(mentions)]
}

function collectMdFiles(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
      } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
        files.push(full)
      }
    })
  }

  walk(dir)
  return files
}

function appendToDriftLog(message) {
  try {
    const driftLogPath = path.join(KB_ROOT, 'sync/drift-log.md')
    const timestamp = new Date().toISOString()
    const entry = `\n- ${timestamp}: ${message}`
    const header = fs.existsSync(driftLogPath) ? '' : '# Drift Log\n\nAuto-detected divergences between KB and codebase.\n'
    fs.appendFileSync(driftLogPath, header + entry)
  } catch (e) {
    // Non-fatal
  }
}

function appendToChangelog(message) {
  try {
    const changelogPath = path.join(KB_ROOT, 'sync/changelog.md')
    const timestamp = new Date().toISOString()
    const entry = `\n- ${timestamp}: ${message}`
    const header = fs.existsSync(changelogPath) ? '' : '# Changelog\n\nAuto-generated KB change history.\n'
    fs.appendFileSync(changelogPath, header + entry)
  } catch (e) {
    // Non-fatal
  }
}

module.exports = { runTool }
