#!/usr/bin/env node
// kb-reindex git merge driver
// Called by git when _index.yaml has a merge conflict.
// Always exits 0 — the user never sees this conflict.
//
// Git calls: driver %O %A %B %L %P
//   %O = ancestor (tmp file path)
//   %A = ours (tmp file path) — we write the result here
//   %B = theirs (tmp file path)
//   %L = conflict marker size
//   %P = path of the file being merged

const fs = require('fs')
const path = require('path')

const [,, ancestor, ours, theirs, markerSize, filePath] = process.argv

async function main() {
  try {
    // Find the knowledge/ root by walking up from the merge driver location
    const kbRoot = findKbRoot()

    // Run reindex to regenerate _index.yaml from current KB files
    const { runTool: reindex } = require(path.join(kbRoot, '_mcp/tools/reindex'))
    await reindex({ silent: true })

    // Copy the freshly generated _index.yaml into git's "ours" slot
    const indexPath = path.join(kbRoot, '_index.yaml')
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, ours)
    }

    process.exit(0)
  } catch (err) {
    // Even on error, exit 0 so git doesn't leave conflict markers
    console.error('[kb-reindex] Error during reindex:', err.message)
    process.exit(0)
  }
}

function findKbRoot() {
  // Walk up from CWD to find knowledge/_mcp
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'knowledge')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.join(process.cwd(), 'knowledge')
}

main()
