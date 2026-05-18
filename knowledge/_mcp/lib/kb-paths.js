const path = require('path')
const fs = require('fs')

const KB_ROOT = 'knowledge'
const PROJECT_TEMPLATES_DIR = path.join(KB_ROOT, '_templates')
const BUNDLED_TEMPLATES_DIR = path.join(__dirname, '../../_templates')

function getTemplatesDir() {
  return fs.existsSync(PROJECT_TEMPLATES_DIR) ? PROJECT_TEMPLATES_DIR : BUNDLED_TEMPLATES_DIR
}

const TYPE_TO_PATH = {
  feature: 'specs/features/{id}.md',
  flow: 'specs/flows/{id}.md',
  schema: 'data/schema/{id}.md',
  validation: 'data/validation/{id}.md',
  integration: 'integrations/{id}.md',
  decision: 'decisions/{id}.md',
  standard: 'standards/{id}.md',
  group: '{folder}/{folder}.md',
  component: 'components/{id}.md'
}

const TYPE_TO_TEMPLATE = {
  feature: 'feature.md',
  flow: 'flow.md',
  schema: 'schema.md',
  validation: 'validation.md',
  integration: 'integration.md',
  decision: 'decision.md',
  standard: 'standards/standard.md',
  group: 'group.md',
  component: 'component.md'
}

// Legacy types removed in favor of the structured-standards model. Surface a
// hint to anyone still calling kb_scaffold with these so they migrate cleanly.
// Includes the legacy folder-convention names (foundation/, capabilities/) in
// case a caller passes the obsolete folder as a scaffold type.
const REMOVED_TYPES = {
  'tech-stack': 'use standards/code/<id>.md for stack rules',
  'conventions': 'use one or more standards/code/<id>.md documents with structured rules',
  'foundation': 'no longer a folder convention; use standards/<group>/<id>.md',
  'capabilities': 'no longer a folder convention; use standards/<group>/<id>.md'
}

// Maps import-classify types to scaffold types
const CLASSIFY_TYPE_TO_SCAFFOLD = {
  'feature': 'feature',
  'flow': 'flow',
  'schema': 'schema',
  'validation': 'validation',
  'integration': 'integration',
  'decision': 'decision',
  'standard': 'standard',
  'process': 'standard',
  'component': 'component'
}

function getGroupFolder(type) {
  const map = {
    feature: 'specs/features',
    flow: 'specs/flows',
    schema: 'data/schema',
    validation: 'data/validation',
    integration: 'integrations',
    decision: 'decisions',
    standard: 'standards'
  }
  return map[type] || 'specs/features'
}

// Valid sub-folders under standards/<group>/<id>.md. Surfaced to scaffold/extract
// for input validation and so the agent gets a meaningful error vs. silently
// scaffolding into a typo'd folder.
const VALID_STANDARD_GROUPS = new Set(['code', 'contracts', 'knowledge', 'process'])

function resolveFilePath(type, id, group) {
  const template = TYPE_TO_PATH[type]
  if (!template) return null

  if (type === 'group') {
    const folder = group ? `${getGroupFolder(type)}/${group}` : getGroupFolder(type)
    const folderName = group || path.basename(folder)
    return path.join(KB_ROOT, folder, `${folderName}.md`)
  }

  if (id && template.includes('{id}')) {
    const base = template.replace('{id}', id)
    if (group) {
      const parts = base.split('/')
      parts.splice(parts.length - 1, 0, group)
      return path.join(KB_ROOT, parts.join('/'))
    }
    return path.join(KB_ROOT, base)
  }

  return path.join(KB_ROOT, template.replace('{id}', id || 'new-item'))
}

// Returns true if the type maps to a single shared file (not {id}-based)
function isSingletonType(type) {
  const t = TYPE_TO_PATH[type]
  return t && !t.includes('{id}')
}

module.exports = {
  KB_ROOT,
  TYPE_TO_PATH,
  TYPE_TO_TEMPLATE,
  CLASSIFY_TYPE_TO_SCAFFOLD,
  REMOVED_TYPES,
  VALID_STANDARD_GROUPS,
  getTemplatesDir,
  getGroupFolder,
  resolveFilePath,
  isSingletonType
}
