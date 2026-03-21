const fs = require('fs')
const path = require('path')
const { loadRules } = require('../lib/rules')
const { validateDepth } = require('../lib/depth')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: write } = require('./write')
const { runTool: get } = require('./get')

const KB_ROOT = 'knowledge'
// Project-local templates take priority; fall back to templates bundled with the MCP server.
const PROJECT_TEMPLATES_DIR = path.join(KB_ROOT, '_templates')
const BUNDLED_TEMPLATES_DIR = path.join(__dirname, '../../_templates')
const TEMPLATES_DIR = fs.existsSync(PROJECT_TEMPLATES_DIR) ? PROJECT_TEMPLATES_DIR : BUNDLED_TEMPLATES_DIR

const TYPE_TO_PATH = {
  feature: 'features/{id}.md',
  flow: 'flows/{id}.md',
  schema: 'data/schema/{id}.md',
  validation: 'validation/{id}.md',
  integration: 'integrations/{id}.md',
  decision: 'decisions/{id}.md',
  group: '{folder}/_group.md',
  enums: 'data/enums.md',
  relations: 'data/relations.md',
  components: 'ui/components.md',
  permissions: 'ui/permissions.md',
  copy: 'ui/copy.md',
  'global-rules': 'foundation/global-rules.md',
  'tech-stack': 'foundation/tech-stack.md',
  conventions: 'foundation/conventions.md'
}

const TYPE_TO_TEMPLATE = {
  feature: 'feature.md',
  flow: 'flow.md',
  schema: 'schema.md',
  validation: 'validation.md',
  integration: 'integration.md',
  decision: 'decision.md',
  group: 'group.md',
  enums: 'data/enums.md',
  relations: 'data/relations.md',
  components: 'ui/components.md',
  permissions: 'ui/permissions.md',
  copy: 'ui/copy.md',
  'global-rules': 'foundation/global-rules.md',
  'tech-stack': 'foundation/tech-stack.md',
  conventions: 'foundation/conventions.md'
}

/**
 * kb_scaffold — Creates a KB file from a template.
 *
 * Without description: writes the template with placeholders directly (no AI).
 * With description: returns { file_path, prompt } — the calling agent fills
 *   the template and calls kb_write({ file_path, content }) to save it.
 * With content: writes the agent-filled content directly.
 */
async function runTool({ type, id, group, description, content } = {}) {
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

  // If group folder missing, create _group.md
  if (group) {
    const groupDir = path.join(KB_ROOT, getGroupFolder(type), group)
    const groupFilePath = path.join(groupDir, '_group.md')
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
      template: templateContent,
      description,
      kb_type: type,
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

function resolveFilePath(type, id, group) {
  const template = TYPE_TO_PATH[type]
  const folder = group ? `${getGroupFolder(type)}/${group}` : getGroupFolder(type)

  if (type === 'group') {
    return path.join(KB_ROOT, folder, '_group.md')
  }

  if (id && template.includes('{id}')) {
    const base = template.replace('{id}', id)
    if (group) {
      const parts = base.split('/')
      parts.splice(1, 0, group)
      return path.join(KB_ROOT, parts.join('/'))
    }
    return path.join(KB_ROOT, base)
  }

  return path.join(KB_ROOT, template.replace('{id}', id || 'new-item'))
}

function getGroupFolder(type) {
  const map = {
    feature: 'features',
    flow: 'flows',
    schema: 'data/schema',
    validation: 'validation',
    integration: 'integrations',
    decision: 'decisions'
  }
  return map[type] || 'features'
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
