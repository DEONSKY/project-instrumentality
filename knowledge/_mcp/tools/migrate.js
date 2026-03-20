const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const simpleGit = require('simple-git')
const { resolvePrompt } = require('../lib/prompts')

const KB_ROOT = 'knowledge'

/**
 * kb_migrate — Prepares migration prompts for KB files after _rules.md changes.
 * Returns { files } where each entry has a prompt for the calling agent to process.
 * Does NOT write — agent reviews each prompt and calls kb_write per file.
 *
 * Signal: if the agent determines a file is already compliant, skip it.
 * Otherwise, generate updated content and call kb_write.
 */
async function runTool({} = {}) {
  const git = simpleGit(process.cwd())
  const rulesPath = path.join(KB_ROOT, '_rules.md')

  let rulesDiff = ''
  try {
    rulesDiff = await git.diff(['HEAD~1', 'HEAD', '--', rulesPath])
  } catch (e) {
    rulesDiff = '(git diff unavailable)'
  }

  if (!rulesDiff) {
    return { message: 'No changes detected in _rules.md. Run after committing _rules.md changes.' }
  }

  const allKbFiles = collectKBFiles()
  const files = []

  for (const filePath of allKbFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = matter(content)

      const prompt = resolvePrompt('migrate', {
        rules_diff: rulesDiff.slice(0, 1500),
        file_path: filePath,
        file_content: content.slice(0, 2000),
        front_matter: JSON.stringify(parsed.data, null, 2)
      })

      if (!prompt) continue

      files.push({
        file_path: filePath,
        current_content: content.slice(0, 500),
        prompt
      })
    } catch (e) {
      console.error(`[migrate] Error processing ${filePath}:`, e.message)
    }
  }

  return {
    total_files: files.length,
    files,
    note: 'For each file, process the prompt. If already compliant, skip. Otherwise call kb_write with updated content.'
  }
}

function collectKBFiles() {
  const files = []
  const skipDirs = new Set(['_mcp', 'exports', 'assets', 'node_modules', '_templates', 'sync'])

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    entries.forEach(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full)
      } else if (entry.name.endsWith('.md') && entry.name !== '_rules.md') {
        files.push(full)
      }
    })
  }

  walk(KB_ROOT)
  return files
}

module.exports = { runTool }
