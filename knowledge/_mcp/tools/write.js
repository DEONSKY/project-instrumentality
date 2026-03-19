const fs = require('fs')
const path = require('path')
const { runTool: reindex } = require('./reindex')

async function runTool({ file_path, content }) {
  if (!file_path) return { error: 'file_path is required' }
  if (!content) return { error: 'content is required' }

  // Never write _index.yaml directly
  if (file_path.endsWith('_index.yaml')) {
    return { error: '_index.yaml must only be written by kb_reindex. Use kb_note_resolve or let reindex run automatically.' }
  }

  // Ensure parent directory exists
  const dir = path.dirname(file_path)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Write the file
  fs.writeFileSync(file_path, content, 'utf8')

  // Always call reindex as final step
  const reindexResult = await reindex({})

  return {
    written: true,
    file_path,
    lint_errors: reindexResult.lint_errors,
    lint_warnings: reindexResult.lint_warnings,
    reindex_result: reindexResult
  }
}

module.exports = { runTool }
