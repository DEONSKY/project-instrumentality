import * as path from 'path'
import * as fs from 'fs'
import * as pkgPaths from './pkg-paths'

const KB_ROOT = 'knowledge'
const PROJECT_TEMPLATES_DIR = path.join(KB_ROOT, '_templates')
// Resolved via pkg-paths so the bundled fallback points at the real
// knowledge/_templates whether running from source (lib/) or compiled (dist/lib/).
const BUNDLED_TEMPLATES_DIR = pkgPaths.bundledTemplatesDir()

function getTemplatesDir(): string {
  return fs.existsSync(PROJECT_TEMPLATES_DIR) ? PROJECT_TEMPLATES_DIR : BUNDLED_TEMPLATES_DIR
}

const TYPE_TO_PATH: Record<string, string> = {
  feature: 'specs/features/{id}.md',
  flow: 'specs/flows/{id}.md',
  policy: 'specs/policies/{id}.md',
  schema: 'data/schema/{id}.md',
  validation: 'data/validation/{id}.md',
  integration: 'integrations/{id}.md',
  decision: 'decisions/{id}.md',
  standard: 'standards/{id}.md',
  reference: 'reference/{id}.md',
  technical: 'technical/{id}.md',
  group: '{folder}/{folder}.md',
  component: 'components/{id}.md'
}

const TYPE_TO_TEMPLATE: Record<string, string> = {
  feature: 'feature.md',
  flow: 'flow.md',
  policy: 'policy.md',
  schema: 'schema.md',
  validation: 'validation.md',
  integration: 'integration.md',
  decision: 'decision.md',
  standard: 'standards/standard.md',
  reference: 'reference.md',
  technical: 'technical.md',
  group: 'group.md',
  component: 'component.md'
}

// Legacy types removed in favor of the structured-standards model. Surface a
// hint to anyone still calling kb_scaffold with these so they migrate cleanly.
// Includes the legacy folder-convention names (foundation/, capabilities/) in
// case a caller passes the obsolete folder as a scaffold type.
const REMOVED_TYPES: Record<string, string> = {
  'tech-stack': 'use standards/code/<id>.md for stack rules',
  'conventions': 'use one or more standards/code/<id>.md documents with structured rules',
  'foundation': 'no longer a folder convention; use standards/<group>/<id>.md',
  'capabilities': 'no longer a folder convention; use standards/<group>/<id>.md'
}

// Maps import-classify types to scaffold types. Business "must/shall" rules
// (classified as `standard` by the prompt) become `policy` docs under specs/ —
// the structured-standards model can't be machine-filled, so genuine code/
// knowledge standards are left to manual authoring and fall through to review.
// `enums` are folded into schema; UI permission/copy chunks into feature.
const CLASSIFY_TYPE_TO_SCAFFOLD: Record<string, string> = {
  'feature': 'feature',
  'flow': 'flow',
  'policy': 'policy',
  'schema': 'schema',
  'validation': 'validation',
  'integration': 'integration',
  'decision': 'decision',
  'reference': 'reference',
  'technical': 'technical',
  'component': 'component',
  // Folded / legacy classifier labels
  'standard': 'policy',
  'enums': 'schema',
  'ui-permissions': 'feature',
  'ui-copy': 'feature'
}

function getGroupFolder(type: string): string {
  const map: Record<string, string> = {
    feature: 'specs/features',
    flow: 'specs/flows',
    policy: 'specs/policies',
    schema: 'data/schema',
    validation: 'data/validation',
    integration: 'integrations',
    decision: 'decisions',
    standard: 'standards',
    reference: 'reference',
    technical: 'technical',
    component: 'components'
  }
  return map[type] || 'specs/features'
}

// Valid sub-folders under standards/<group>/<id>.md. Surfaced to scaffold/extract
// for input validation and so the agent gets a meaningful error vs. silently
// scaffolding into a typo'd folder.
const VALID_STANDARD_GROUPS = new Set(['code', 'contracts', 'knowledge', 'process'])

function resolveFilePath(type: string, id?: string, group?: string): string | null {
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
function isSingletonType(type: string): boolean {
  const t = TYPE_TO_PATH[type]
  return Boolean(t && !t.includes('{id}'))
}

export {
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
