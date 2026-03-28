const path = require('path')
const fs = require('fs')

const KB_ROOT = 'knowledge'
const PROJECT_TEMPLATES_DIR = path.join(KB_ROOT, '_templates')
const BUNDLED_TEMPLATES_DIR = path.join(__dirname, '../../_templates')

function getTemplatesDir() {
  return fs.existsSync(PROJECT_TEMPLATES_DIR) ? PROJECT_TEMPLATES_DIR : BUNDLED_TEMPLATES_DIR
}

const TYPE_TO_PATH = {
  feature: 'features/{id}.md',
  flow: 'flows/{id}.md',
  schema: 'data/schema/{id}.md',
  validation: 'validation/{id}.md',
  integration: 'integrations/{id}.md',
  decision: 'decisions/{id}.md',
  standard: 'standards/{group}/{id}.md',
  group: '{folder}/_group.md',
  enums: 'data/enums.md',
  relations: 'data/relations.md',
  components: 'ui/components.md',
  permissions: 'ui/permissions.md',
  copy: 'ui/copy.md',
  'global-rules': 'standards/global.md',
  'tech-stack': 'standards/code/tech-stack.md',
  conventions: 'standards/code/conventions.md'
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
  enums: 'data/enums.md',
  relations: 'data/relations.md',
  components: 'ui/components.md',
  permissions: 'ui/permissions.md',
  copy: 'ui/copy.md',
  'global-rules': 'standards/global-rules.md',
  'tech-stack': 'standards/tech-stack.md',
  conventions: 'standards/conventions.md'
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
  'enums': 'enums',
  'ui-permissions': 'permissions',
  'ui-copy': 'copy'
}

function getGroupFolder(type) {
  const map = {
    feature: 'features',
    flow: 'flows',
    schema: 'data/schema',
    validation: 'validation',
    integration: 'integrations',
    decision: 'decisions',
    standard: 'standards'
  }
  return map[type] || 'features'
}

function resolveFilePath(type, id, group) {
  const template = TYPE_TO_PATH[type]
  if (!template) return null

  if (type === 'group') {
    const folder = group ? `${getGroupFolder(type)}/${group}` : getGroupFolder(type)
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
  getTemplatesDir,
  getGroupFolder,
  resolveFilePath,
  isSingletonType
}
