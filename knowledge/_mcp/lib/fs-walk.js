const fs = require('fs')
const path = require('path')

const SKIP_DIRS = new Set(['_mcp', 'exports', 'assets', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

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

module.exports = { collectMdFiles, SKIP_DIRS, SKIP_FILES }
