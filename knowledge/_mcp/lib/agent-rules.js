const fs = require('fs')
const path = require('path')
const { getTemplatesDir } = require('./kb-paths')

const AGENT_RULE_FILES = ['CLAUDE.md', '.cursorrules', '.windsurfrules']

/**
 * Generate agent instruction files (CLAUDE.md, .cursorrules, .windsurfrules)
 * from the shared agent-rules.md template.
 *
 * Skips files that already exist with non-empty content to preserve customizations.
 * Returns list of filenames that were written.
 */
function generateAgentRules(filesCreated = []) {
  const templatePath = path.join(getTemplatesDir(), 'agent-rules.md')
  if (!fs.existsSync(templatePath)) {
    return []
  }

  const content = fs.readFileSync(templatePath, 'utf8')
  const written = []

  for (const filename of AGENT_RULE_FILES) {
    const targetPath = filename // project root (cwd)
    const exists = fs.existsSync(targetPath)
    const isEmpty = exists && fs.readFileSync(targetPath, 'utf8').trim() === ''

    if (!exists || isEmpty) {
      fs.writeFileSync(targetPath, content, 'utf8')
      written.push(filename)
      filesCreated.push(filename)
    }
  }

  return written
}

module.exports = { generateAgentRules, AGENT_RULE_FILES }
