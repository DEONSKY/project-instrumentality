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
async function runTool({ type, id, group, description, content, app_scope = 'all' } = {}) {
  if (!type) return { error: 'type is required' }
  if (!TYPE_TO_TEMPLATE[type]) {
    return { error: `Unknown type: ${type}. Valid: ${Object.keys(TYPE_TO_TEMPLATE).join(', ')}` }
  }

  const rules = loadRules(KB_ROOT)
  const filePath = resolveFilePath(type, id, group)

  const depthResult = validateDepth(filePath, rules)
  if (!depthResult.valid) {
    return { error: `Depth violation: ${depthResult.actual} levels deep, max is ${depthResult.max}`, suggestion: depthResult.suggestion }
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
    return { file_path: filePath, written: writeResult.written, lint_errors: writeResult.lint_errors }
  }

  // Description provided → return prompt for agent to fill
  if (description) {
    // Load related KB context so the agent can align with existing files
    const context = await get({ keywords: description.split(/\s+/).filter(w => w.length > 2) })
    const kbContext = (context.files || []).map(f => `<!-- ${f.path} -->\n${f.content}`).join('\n\n---\n\n')

    const prompt = resolvePrompt('scaffold-fill', {
      template_content: templateContent,
      description,
      template_type: type,
      kb_context: kbContext,
      id: id || 'new-item',
      date: today
    })

    if (prompt) {
      return {
        file_path: filePath,
        template: templateContent,
        prompt,
        _instruction: `Fill the template using the prompt above, then call kb_scaffold({ type, id, content: "<filled content>" }) to save it.`
      }
    }
  }

  // No description → write template as-is
  const writeResult = await write({ file_path: filePath, content: templateContent })
  return {
    file_path: filePath,
    written: writeResult.written,
    lint_errors: writeResult.lint_errors,
    filled_by_ai: false
  }
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
