const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { runTool: reindex } = require('./reindex')
const { extractTagsFromText } = require('../lib/tag-extract')

const KB_ROOT = 'knowledge'
const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

async function runTool({ file_path } = {}) {
  const files = resolveFiles(file_path)
  if (files.error) return files

  let tagged = 0
  let skipped = 0
  let totalTagsAdded = 0
  const sample = {}

  for (const fp of files) {
    const result = processFile(fp)
    if (!result) {
      skipped++
      continue
    }
    if (result.added > 0) {
      tagged++
      totalTagsAdded += result.added
      if (Object.keys(sample).length < 5) {
        const rel = fp.replace(/^knowledge\//, '')
        sample[rel] = result.tags
      }
    }
  }

  // Reindex once after all files are processed
  if (tagged > 0) {
    await reindex({ silent: true })
  }

  return {
    tagged,
    skipped,
    tags_added: totalTagsAdded,
    files_scanned: files.length,
    sample
  }
}

function resolveFiles(filePath) {
  if (!filePath || filePath === 'all') {
    return collectMdFiles(KB_ROOT)
  }

  const full = filePath.startsWith(KB_ROOT) ? filePath : path.join(KB_ROOT, filePath)
  if (!fs.existsSync(full)) {
    return { error: `File not found: ${full}` }
  }
  return [full]
}

function processFile(filePath) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch { return null }

  let parsed
  try {
    parsed = matter(content)
    if (!parsed.data || typeof parsed.data !== 'object') return null
  } catch { return null }

  const existingTags = Array.isArray(parsed.data.tags) ? parsed.data.tags : []
  const extractedTags = extractTagsFromText(parsed.content, { id: parsed.data.id, filePath })

  // Merge: preserve existing, add new
  const merged = [...new Set([...existingTags, ...extractedTags])]

  if (merged.length === existingTags.length && merged.every(t => existingTags.includes(t))) {
    return { added: 0, tags: existingTags }
  }

  // Write back
  parsed.data.tags = merged
  const updated = matter.stringify(parsed.content, parsed.data)
  fs.writeFileSync(filePath, updated, 'utf8')

  const added = merged.length - existingTags.length
  return { added, tags: merged }
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

module.exports = { runTool }
