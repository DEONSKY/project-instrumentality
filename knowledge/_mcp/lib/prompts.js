const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { loadRules } = require('./rules')
const pkgPaths = require('./pkg-paths')

// Fallback values used when prompt_overrides config can't be resolved (e.g.
// _rules.md missing). Match getDefaultRules().prompt_overrides.
const DEFAULT_BASE_DIR = 'knowledge/_templates/prompts'
const DEFAULT_OVERRIDE_DIR = 'knowledge/_prompt-overrides'
// Resolved via pkg-paths so it points at the real knowledge/_templates/prompts
// whether running from source (lib/) or compiled (dist/lib/).
const BUNDLED_PROMPTS_DIR = path.join(pkgPaths.bundledTemplatesDir(), 'prompts')
const DEFAULT_VALID_TYPES = ['replace', 'extend-before', 'extend-after', 'suppress', 'section-replace']
const DEFAULT_PROTECTED = ['drift-summary', 'ask-sync', 'conform-check', 'conform-resolve']

function getOverridesConfig() {
  try {
    const cfg = loadRules('knowledge').getPromptOverrides() || {}
    return {
      base_dir: cfg.base_dir || DEFAULT_BASE_DIR,
      override_dir: cfg.override_dir || DEFAULT_OVERRIDE_DIR,
      valid_override_types: Array.isArray(cfg.valid_override_types) && cfg.valid_override_types.length
        ? cfg.valid_override_types
        : DEFAULT_VALID_TYPES,
      suppress_requires_reason: cfg.suppress_requires_reason !== false,
      protected: Array.isArray(cfg.protected) ? cfg.protected : DEFAULT_PROTECTED
    }
  } catch {
    return {
      base_dir: DEFAULT_BASE_DIR,
      override_dir: DEFAULT_OVERRIDE_DIR,
      valid_override_types: DEFAULT_VALID_TYPES,
      suppress_requires_reason: true,
      protected: DEFAULT_PROTECTED
    }
  }
}

function resolveBaseDir(configuredBaseDir) {
  if (fs.existsSync(configuredBaseDir)) return configuredBaseDir
  return BUNDLED_PROMPTS_DIR
}

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  const parsed = matter(fs.readFileSync(filePath, 'utf8'))
  return { ...parsed, content: stripCommentHeader(parsed.content) }
}

/**
 * Bundled prompt templates carry a leading `#`-comment doc block (placeholder
 * docs etc.) separated from the real prompt body by a standalone `---` line.
 * That block isn't YAML frontmatter (the file starts with `#`, not `---`), so
 * gray-matter leaves it in `content` and it would otherwise leak into every
 * agent context. Strip it — but only when it's unambiguously a comment header:
 * a `---` divider exists AND every preceding non-blank line starts with `#`.
 * This protects templates that use `---` as a real markdown rule inside the
 * body (e.g. issue-triage.md) and those with no divider at all.
 */
function stripCommentHeader(content) {
  if (!content) return content
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) {
      // Found the first divider — strip the header only if everything above it
      // is comment (`#…`) or blank.
      return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
    }
    if (lines[i].trim() !== '' && !lines[i].trimStart().startsWith('#')) {
      // Real content before any divider — not a comment header. Leave as-is.
      return content
    }
  }
  return content
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
  const cfg = getOverridesConfig()
  const basePath = path.join(resolveBaseDir(cfg.base_dir), `${promptName}.md`)
  const overridePath = path.join(cfg.override_dir, `${promptName}.md`)

  const base = loadFile(basePath)
  if (!base) throw new Error(`Base prompt not found: ${promptName}`)

  const override = loadFile(overridePath)

  if (!override) {
    return fillPlaceholders(base.content, context)
  }

  const { override: type, section, reason } = override.data

  if (!cfg.valid_override_types.includes(type)) {
    throw new Error(
      `Invalid override type: ${type}. Valid: ${cfg.valid_override_types.join(', ')}`
    )
  }

  if (type === 'suppress') {
    if (cfg.protected.includes(promptName)) {
      throw new Error(
        `Prompt "${promptName}" is protected and cannot be suppressed.`
      )
    }
    if (cfg.suppress_requires_reason && !reason) {
      throw new Error(
        `Prompt override "${promptName}" uses suppress but is missing required reason: field`
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

module.exports = { resolvePrompt, stripCommentHeader }
