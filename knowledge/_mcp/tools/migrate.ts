import * as fs from 'fs'
import * as path from 'path'
import matter from 'gray-matter'
import simpleGit, { type SimpleGit } from 'simple-git'
import { resolvePrompt } from '../lib/prompts'
import type { ToolDefinition } from '../src/types/tool'

const KB_ROOT = 'knowledge'

interface MigrateFile {
  file_path: string
  current_content: string
  prompt: string
}

/**
 * kb_migrate — Prepares migration prompts for KB files after _rules.md changes.
 * Returns { files } where each entry has a prompt for the calling agent to process.
 * Does NOT write — agent reviews each prompt and calls kb_write per file.
 *
 * Signal: if the agent determines a file is already compliant, skip it.
 * Otherwise, generate updated content and call kb_write.
 */
async function runTool({ since }: { since?: string } = {}): Promise<Record<string, unknown>> {
  const git = simpleGit(process.cwd())
  const rulesPath = path.join(KB_ROOT, '_rules.md')

  // Find the commit where _rules.md last changed, or use explicit ref
  let rulesDiff = ''
  const ref = since || await findLastRulesChange(git, rulesPath)
  if (!ref) {
    return { message: 'No prior commit found that touched _rules.md. Pass `since` explicitly to compare against an older ref.', total_files: 0, files: [] }
  }
  try {
    rulesDiff = await git.diff([ref, 'HEAD', '--', rulesPath])
  } catch (e) {
    rulesDiff = ''
  }

  // No-change detection: if diff is empty or only whitespace, short-circuit
  if (!rulesDiff || !rulesDiff.trim()) {
    return { message: `No changes detected in _rules.md between ${ref} and HEAD. Nothing to migrate.`, total_files: 0, files: [] }
  }

  const allKbFiles = collectKBFiles()
  const files: MigrateFile[] = []

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
      console.error(`[migrate] Error processing ${filePath}:`, (e as Error).message)
    }
  }

  return {
    total_files: files.length,
    files,
    note: 'For each file, process the prompt. If already compliant, skip. Otherwise call kb_write with updated content.'
  }
}

// Walk back through git history for the most recent commit that touched
// _rules.md and return its parent SHA — diffing parent..HEAD then captures
// all rules changes since the last edit. Returns null if no such commit
// exists (e.g. _rules.md was just added in HEAD, or repo has no history).
async function findLastRulesChange(git: SimpleGit, rulesPath: string): Promise<string | null> {
  try {
    const log = await git.log({ file: rulesPath, maxCount: 2 })
    const commits = log.all || []
    if (commits.length === 0) return null
    // commits[0] is the latest commit that touched _rules.md. We want the
    // commit BEFORE it, so we can diff the change in.
    const latest = commits[0].hash
    try {
      const parent = await git.revparse([`${latest}^`])
      return parent.trim()
    } catch {
      // No parent — latest is the initial commit; nothing to diff against.
      return null
    }
  } catch {
    return null
  }
}

function collectKBFiles(): string[] {
  const files: string[] = []
  // F48: explicit exclusion list — avoid blanket startsWith('.') because some
  // projects host docs under .github/, .cursor/, etc. and want them indexed.
  // .obsidian holds vault plugin distributions (README.md noise) and .git
  // would be catastrophic to scan.
  const skipDirs = new Set([
    '_mcp', 'exports', 'assets', 'node_modules', '_templates', 'sync',
    '.obsidian', '.git'
  ])

  function walk(dir: string): void {
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

const definition: ToolDefinition = {
  name: 'kb_migrate',
  description: 'Migrate KB files after _rules.md changes. Returns one prompt per KB file for the calling agent to review; the agent calls kb_write per file if an update is needed. Does not write directly.',
  inputSchema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'Commit SHA to diff _rules.md from. Auto-detected by walking git log for the last commit that touched _rules.md and diffing its parent..HEAD.' }
    }
  }
}

export { runTool, definition }
