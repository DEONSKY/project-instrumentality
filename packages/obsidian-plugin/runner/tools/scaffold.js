const fs = require('fs')
const path = require('path')
const { loadRules } = require('../lib/rules')
const { validateDepth } = require('../lib/depth')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: write } = require('./write')
const { runTool: get } = require('./get')
const { KB_ROOT, TYPE_TO_TEMPLATE, REMOVED_TYPES, VALID_STANDARD_GROUPS, getTemplatesDir, getGroupFolder, resolveFilePath } = require('../lib/kb-paths')

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

  if (type === 'agent-rules') {
    return { error: 'agent-rules moved to kb_init. Use kb_init({ regenerate_agent_rules: true, force: true }).' }
  }

  if (REMOVED_TYPES[type]) {
    return { error: `Type "${type}" was removed in the structured-standards model. ${REMOVED_TYPES[type]}.` }
  }

  if (!TYPE_TO_TEMPLATE[type]) {
    return { error: `Unknown type: ${type}. Valid: ${Object.keys(TYPE_TO_TEMPLATE).join(', ')}` }
  }

  // Standards must scaffold into one of the four canonical groups so the
  // file lands at standards/<group>/<id>.md. Reject typos early — silently
  // creating standards/typo/ would clutter the index.
  if (type === 'standard' && group && !VALID_STANDARD_GROUPS.has(group)) {
    return { error: `Invalid standard group "${group}". Valid: ${[...VALID_STANDARD_GROUPS].join(', ')}` }
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
    attachMappingStatus(r, filePath, rules)
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
  attachMappingStatus(result, filePath, rules)
  return result
}

/**
 * After a successful KB-file write, check whether any code_path_patterns entry
 * targets it. If not, attach mapping_status + suggested_pattern so the agent
 * can offer to add a pattern to _rules.md. Code→KB drift detection is silent
 * for files no pattern targets — surfacing the gap at birth keeps the system
 * in sync going forward.
 */
function attachMappingStatus(result, filePath, rules) {
  try {
    const { checkSingleKbFile } = require('../lib/pattern-audit')
    const kbRel = filePath.replace(/^knowledge\//, '')
    const status = checkSingleKbFile(kbRel, rules.getCodePathPatterns())
    if (status.unmapped) {
      result.mapping_status = 'unmapped'
      result.suggested_pattern = status.suggested_pattern
      result._mapping_instruction = 'No code_path_patterns entry targets this KB file. To enable automatic code→KB drift detection for it, add suggested_pattern to knowledge/_rules.md → code_path_patterns. Fill suggested_pattern.paths via repo grep for related source files.'
    }
  } catch (e) {
    // Don't let an audit failure block the write — the file is already saved.
    process.stderr.write(`[kb-scaffold] mapping check failed: ${e.message}\n`)
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

module.exports = {
  runTool,
  definition: {
    name: 'kb_scaffold',
    description: 'Create a new KB file from a template. With description: returns a fill prompt for the agent. With content: writes agent-filled content. Without either: writes template with placeholders.',
    inputSchema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', description: 'Template type: feature|flow|schema|validation|integration|decision|standard|group|component' },
        id: { type: 'string', description: 'File identifier (kebab-case)' },
        group: { type: 'string', description: 'Group/subfolder for standards: code|contracts|knowledge|process' },
        description: { type: 'string', description: 'Description — tool returns a fill prompt for the agent to process' },
        content: { type: 'string', description: 'Agent-filled content to write (use after processing the fill prompt)' },
        app_scope: { type: 'string', description: 'App scope for this standard (e.g. frontend, backend). Default: all' }
      }
    }
  }
}
