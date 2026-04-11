const fs = require('fs')
const path = require('path')
const { loadRules } = require('../lib/rules')
const { validateDepth } = require('../lib/depth')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: write } = require('./write')
const { runTool: get } = require('./get')
const { KB_ROOT, TYPE_TO_TEMPLATE, getTemplatesDir, getGroupFolder, resolveFilePath } = require('../lib/kb-paths')

const TEMPLATES_DIR = getTemplatesDir()

/**
 * kb_scaffold — Creates a KB file from a template.
 *
 * Without description: writes the template with placeholders directly (no AI).
 * With description: returns { file_path, prompt } — the calling agent fills
 *   the template and calls kb_write({ file_path, content }) to save it.
 * With content: writes the agent-filled content directly.
 */
async function runTool({ type, id, group, description, content, app_scope = 'all', force = false } = {}) {
  if (!type) return { error: 'type is required' }

  // Special case: agent-rules writes to project root, not knowledge/
  if (type === 'agent-rules') {
    const { generateAgentRules, AGENT_RULE_FILES } = require('../lib/agent-rules')
    if (force) {
      // Force overwrite: delete existing files so generateAgentRules will re-create them
      const fs2 = require('fs')
      for (const f of AGENT_RULE_FILES) {
        if (fs2.existsSync(f)) fs2.writeFileSync(f, '', 'utf8')
      }
    }
    const written = generateAgentRules()
    const skipped = AGENT_RULE_FILES.filter(f => !written.includes(f))
    return {
      files_written: written,
      files_skipped: skipped,
      note: skipped.length > 0 ? 'Existing files with content were not overwritten. Use force: true to regenerate.' : undefined
    }
  }

  if (!TYPE_TO_TEMPLATE[type]) {
    return { error: `Unknown type: ${type}. Valid: ${Object.keys(TYPE_TO_TEMPLATE).join(', ')}` }
  }

  const rules = loadRules(KB_ROOT)
  const filePath = resolveFilePath(type, id, group)

  const depthResult = validateDepth(filePath, rules)
  if (!depthResult.valid) {
    return { error: `Depth violation: ${depthResult.actual} levels deep, max is ${depthResult.max}`, suggestion: depthResult.suggestion }
  }

  // Warn if the group subfolder doesn't exist yet
  let groupWarning
  if (group) {
    const parentFolder = path.join(KB_ROOT, getGroupFolder(type))
    const groupDir = path.join(parentFolder, group)
    if (!fs.existsSync(groupDir)) {
      const existingGroups = fs.existsSync(parentFolder)
        ? fs.readdirSync(parentFolder, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
        : []
      groupWarning = existingGroups.length > 0
        ? `Group '${group}' does not exist yet under ${getGroupFolder(type)}/. Existing groups: ${existingGroups.join(', ')}. A new group will be created.`
        : `Group '${group}' does not exist yet under ${getGroupFolder(type)}/. A new group will be created.`
    }
  }

  const templatePath = path.join(TEMPLATES_DIR, TYPE_TO_TEMPLATE[type])
  if (!fs.existsSync(templatePath)) {
    return { error: `Template not found: ${templatePath}` }
  }

  let templateContent = fs.readFileSync(templatePath, 'utf8')
  const today = new Date().toISOString().split('T')[0]
  templateContent = templateContent
    .replace(/\{\{id\}\}/g, id || 'new-item')
    .replace(/\{\{date\}\}/g, today)
    .replace(/\{\{app_scope\}\}/g, app_scope)

  // If group folder missing, create folder note ({name}.md)
  if (group) {
    const groupDir = path.join(KB_ROOT, getGroupFolder(type), group)
    const groupFilePath = path.join(groupDir, `${group}.md`)
    if (!fs.existsSync(groupFilePath)) {
      createGroupFile(groupFilePath, group, today)
    }
  }

  // Agent passes back filled content → write it
  if (content) {
    const writeResult = await write({ file_path: filePath, content })
    const r = { file_path: filePath, written: writeResult.written, lint_errors: writeResult.lint_errors }
    if (groupWarning) r.group_warning = groupWarning
    return r
  }

  // Description provided → return prompt for agent to fill
  if (description) {
    // Load related KB file references (not full content) to keep response small
    const context = await get({ keywords: description.split(/\s+/).filter(w => w.length > 2) })
    const relatedFiles = (context.files || []).map(f => ({ path: f.path, id: f.id, type: f.type }))

    const prompt = resolvePrompt('scaffold-fill', {
      template_content: templateContent,
      description,
      template_type: type,
      kb_context: relatedFiles.length > 0
        ? `Use kb_get to load these related files before filling:\n${relatedFiles.map(f => `- ${f.path}`).join('\n')}`
        : 'No related KB files found.',
      id: id || 'new-item',
      date: today
    })

    if (prompt) {
      const r = {
        file_path: filePath,
        template: templateContent,
        prompt,
        related_kb_files: relatedFiles,
        _instruction: `First call kb_get with the related file keywords to load context. Then fill the template using the prompt above. Finally call kb_scaffold({ type: "${type}", id: "${id || 'new-item'}", content: "<filled content>" }) to save it.`
      }
      if (groupWarning) r.group_warning = groupWarning
      return r
    }
  }

  // No description → write template as-is
  const writeResult = await write({ file_path: filePath, content: templateContent })
  const result = {
    file_path: filePath,
    written: writeResult.written,
    lint_errors: writeResult.lint_errors,
    filled_by_ai: false
  }
  if (groupWarning) result.group_warning = groupWarning
  return result
}

function createGroupFile(groupFilePath, groupName, today) {
  const templatePath = path.join(TEMPLATES_DIR, 'group.md')
  if (!fs.existsSync(templatePath)) return

  let content = fs.readFileSync(templatePath, 'utf8')
  content = content
    .replace(/\{\{domain\}\}/g, groupName)
    .replace(/\{\{date\}\}/g, today)
    .replace(/\{\{app_scope\}\}/g, 'all')
    .replace(/\{\{owner\}\}/g, '')
    .replace(/\{\{primary_entity\}\}/g, groupName)

  fs.mkdirSync(path.dirname(groupFilePath), { recursive: true })
  fs.writeFileSync(groupFilePath, content, 'utf8')
}

module.exports = { runTool }
