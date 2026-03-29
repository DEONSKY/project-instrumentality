const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

// Project-local prompts (cwd/knowledge/_templates/prompts) take priority.
// Falls back to prompts bundled with the MCP server when the project doesn't have them yet.
const PROJECT_PROMPTS_DIR = 'knowledge/_templates/prompts'
const BUNDLED_PROMPTS_DIR = path.join(__dirname, '../../_templates/prompts')
const OVERRIDE_DIR = 'knowledge/_prompt-overrides'

const PROTECTED = ['drift-summary', 'ask-sync']

function resolveBaseDir() {
  if (fs.existsSync(PROJECT_PROMPTS_DIR)) return PROJECT_PROMPTS_DIR
  return BUNDLED_PROMPTS_DIR
}

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  return matter(fs.readFileSync(filePath, 'utf8'))
}

function fillPlaceholders(content, context = {}) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined ? context[key] : `{{${key}}}`
  })
}

function mergeSection(baseContent, overrideContent, sectionName) {
  const sectionRegex = new RegExp(
    `(## ${sectionName}[\\s\\S]*?)(?=\\n## |$)`, 'i'
  )
  const overrideMatch = overrideContent.match(sectionRegex)
  if (overrideMatch) {
    // Override contains the section header — use it directly
    return baseContent.replace(sectionRegex, overrideMatch[1])
  }
  // Override is raw replacement content — wrap with section header
  return baseContent.replace(sectionRegex, `## ${sectionName}\n\n${overrideContent.trim()}`)
}

function resolvePrompt(promptName, context = {}) {
  const basePath = path.join(resolveBaseDir(), `${promptName}.md`)
  const overridePath = path.join(OVERRIDE_DIR, `${promptName}.md`)

  const base = loadFile(basePath)
  if (!base) throw new Error(`Base prompt not found: ${promptName}`)

  const override = loadFile(overridePath)

  if (!override) {
    return fillPlaceholders(base.content, context)
  }

  const { override: type, section, reason } = override.data

  if (type === 'suppress') {
    if (PROTECTED.includes(promptName)) {
      throw new Error(
        `Prompt "${promptName}" is protected and cannot be suppressed.`
      )
    }
    return null
  }

  if (type === 'replace') {
    return fillPlaceholders(override.content, context)
  }

  if (type === 'extend-before') {
    const merged = override.content.trim() + '\n\n' + base.content.trim()
    return fillPlaceholders(merged, context)
  }

  if (type === 'extend-after') {
    const merged = base.content.trim() + '\n\n' + override.content.trim()
    return fillPlaceholders(merged, context)
  }

  if (type === 'section-replace') {
    if (!section) throw new Error(`section-replace requires a section: field`)
    // Strip leading "## " if user included it in section name
    const sectionName = section.replace(/^##\s*/, '')
    const merged = mergeSection(base.content, override.content, sectionName)
    return fillPlaceholders(merged, context)
  }

  throw new Error(`Unknown override type: ${type}`)
}

module.exports = { resolvePrompt }
