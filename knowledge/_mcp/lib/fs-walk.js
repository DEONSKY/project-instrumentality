const fs = require('fs')
const path = require('path')

const SKIP_DIRS = new Set(['_mcp', 'exports', 'node_modules', 'drift-log', '_templates', 'sync'])
const SKIP_FILES = new Set(['_index.yaml', '_rules.md'])

// Inside assets/, only the design/ subtree is indexed — screenshots/ and
// imports/ hold binaries and auto-pasted images. Sidecar markdown under
// assets/design/ (e.g. mockup-source.md) is meant to surface in kb_get
// keyword search — see decisions/design-asset-storage.md.
function collectMdFiles(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  const rootDir = path.resolve(dir)

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) return
        const rel = path.relative(rootDir, full)
        const assetsPrefix = 'assets' + path.sep
        const designPrefix = path.join('assets', 'design')
        if (rel.startsWith(assetsPrefix) && rel !== designPrefix && !rel.startsWith(designPrefix + path.sep)) return
        walk(full)
      } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
        files.push(full)
      }
    })
  }

  walk(dir)
  return files
}

module.exports = { collectMdFiles, SKIP_DIRS, SKIP_FILES }
