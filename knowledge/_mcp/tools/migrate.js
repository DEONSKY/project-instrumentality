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
async function runTool({ since, dry_run = false } = {}) {
  const git = simpleGit(process.cwd())
  const rulesPath = path.join(KB_ROOT, '_rules.md')

  // Find the commit where _rules.md last changed, or use explicit ref
  let rulesDiff = ''
  const ref = since || await findLastRulesChange(git, rulesPath)
  try {
    rulesDiff = await git.diff([ref, 'HEAD', '--', rulesPath])
  } catch (e) {
    rulesDiff = ''
  }

  // No-change detection: if diff is empty or only whitespace, short-circuit
  if (!rulesDiff || !rulesDiff.trim()) {
    return { message: 'No changes detected in _rules.md since last commit. Nothing to migrate.', total_files: 0, files: [] }
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
    dry_run,
    note: dry_run
      ? 'Dry run — review the prompts above. No files will be written. Re-run without dry_run to apply.'
      : 'For each file, process the prompt. If already compliant, skip. Otherwise call kb_write with updated content.'
  }
}

async function findLastRulesChange(git, rulesPath) {
  try {
    // Check if _rules.md changed in the most recent commit
    const headDiff = await git.diff(['HEAD~1', 'HEAD', '--', rulesPath])
    if (!headDiff || !headDiff.trim()) {
      // _rules.md didn't change in the last commit — return HEAD so diff is empty
      return 'HEAD'
    }
    return 'HEAD~1'
  } catch { /* fall through — e.g. only one commit in repo */ }
  return 'HEAD~1'
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
