import * as fs from 'fs'
import * as path from 'path'
import { getTemplatesDir } from './kb-paths'

const AGENT_RULE_FILES = ['CLAUDE.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md']

/**
 * Generate agent instruction files (CLAUDE.md, .cursorrules, .windsurfrules,
 * .github/copilot-instructions.md) from the shared agent-rules.md template.
 *
 * Skips files that already exist with non-empty content to preserve customizations.
 * Returns list of filenames that were written.
 */
function generateAgentRules(filesCreated: string[] = []): string[] {
  const templatePath = path.join(getTemplatesDir(), 'agent-rules.md')
  if (!fs.existsSync(templatePath)) {
    return []
  }

  const content = fs.readFileSync(templatePath, 'utf8')
  const written: string[] = []

  for (const filename of AGENT_RULE_FILES) {
    const targetPath = filename // project root (cwd)
    const exists = fs.existsSync(targetPath)
    const isEmpty = exists && fs.readFileSync(targetPath, 'utf8').trim() === ''

    if (!exists || isEmpty) {
      const parentDir = path.dirname(targetPath)
      if (parentDir && parentDir !== '.' && !fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }
      fs.writeFileSync(targetPath, content, 'utf8')
      written.push(filename)
      filesCreated.push(filename)
    }
  }

  return written
}

export { generateAgentRules, AGENT_RULE_FILES }
