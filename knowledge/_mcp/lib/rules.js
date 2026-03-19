const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const yaml = require('js-yaml')

const DEFAULT_RULES_PATH = 'knowledge/_rules.md'

function loadRulesRaw(kbRoot = 'knowledge') {
  const rulesPath = path.join(kbRoot, '_rules.md')
  if (!fs.existsSync(rulesPath)) {
    return getDefaultRules()
  }
  const parsed = matter(fs.readFileSync(rulesPath, 'utf8'))
  return parsed.data || getDefaultRules()
}

function getDefaultRules() {
  return {
    version: '1.0',
    depth_policy: {
      default_max: 3,
      group_trigger: 5,
      group_warn: 8,
      overrides: {
        features: 3,
        flows: 2,
        ui: 2,
        integrations: 2,
        data: 1,
        validation: 1,
        decisions: 1,
        foundation: 1,
        sync: 1
      },
      never_group: ['data', 'validation', 'decisions', 'foundation', 'sync']
    },
    secret_patterns: [
      'sk_live_',
      'Bearer ',
      'private_key',
      'password:',
      'api_key:',
      'secret:'
    ],
    cross_app_refs: {
      prefix: '@shared/',
      always_shared: ['data', 'validation', 'integrations', 'decisions', 'foundation']
    },
    code_path_patterns: [
      {
        intent: 'validation',
        kb_target: 'validation/common.md',
        paths: ['src/validators/**']
      },
      {
        intent: 'form',
        kb_target: 'features/{name}.md',
        paths: ['src/components/**Form*'],
        name_extraction: { strip_suffix: ['Form', 'Screen', 'Page', 'View', 'Container'], case: 'kebab' }
      },
      {
        intent: 'component',
        kb_target: 'ui/components.md',
        paths: ['src/components/**']
      },
      {
        intent: 'route-guard',
        kb_target: 'flows/{name}.guards.md',
        paths: ['src/routes/**']
      },
      {
        intent: 'api-contract',
        kb_target: 'features/{name}.api.md',
        paths: ['src/api/**']
      },
      {
        intent: 'data-model',
        kb_target: 'data/schema/{name}.md',
        paths: ['src/models/**']
      },
      {
        intent: 'service-logic',
        kb_target: 'flows/{name}.md',
        paths: ['src/services/**']
      }
    ],
    prompt_overrides: {
      base_dir: 'knowledge/_templates/prompts',
      override_dir: 'knowledge/_prompt-overrides',
      valid_override_types: ['replace', 'extend-before', 'extend-after', 'suppress', 'section-replace'],
      suppress_requires_reason: true,
      protected: ['drift-summary', 'ask-sync']
    }
  }
}

function loadRules(kbRoot = 'knowledge') {
  const raw = loadRulesRaw(kbRoot)

  return {
    getDepthPolicy: () => raw.depth_policy || getDefaultRules().depth_policy,
    getSecretPatterns: () => raw.secret_patterns || getDefaultRules().secret_patterns,
    getCodePathPatterns: () => raw.code_path_patterns || getDefaultRules().code_path_patterns,
    getPromptOverrides: () => raw.prompt_overrides || getDefaultRules().prompt_overrides,
    getCrossAppRefConfig: () => raw.cross_app_refs || getDefaultRules().cross_app_refs,
    getRaw: () => raw
  }
}

module.exports = { loadRules, getDefaultRules }
