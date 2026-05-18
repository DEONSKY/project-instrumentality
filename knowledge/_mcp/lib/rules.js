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
        specs: 4,
        data: 3,
        integrations: 2,
        decisions: 1,
        standards: 2,
        sync: 1
      },
      never_group: ['data', 'decisions', 'sync']
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
      always_shared: ['data', 'integrations', 'decisions', 'standards']
    },
    code_path_patterns: [
      {
        intent: 'validation',
        kb_target: 'data/validation/common.md',
        paths: ['src/validators/**']
      },
      {
        intent: 'form',
        kb_target: 'specs/features/{name}.md',
        paths: ['src/components/**Form*'],
        name_extraction: { strip_suffix: ['Form', 'Screen', 'Page', 'View', 'Container'], case: 'kebab' }
      },
      {
        intent: 'component',
        kb_target: 'components/{name}.md',
        paths: ['src/components/**'],
        name_extraction: { strip_suffix: ['Component'], case: 'kebab' }
      },
      {
        intent: 'route-guard',
        kb_target: 'specs/flows/{name}.guards.md',
        paths: ['src/routes/**']
      },
      {
        intent: 'api-contract',
        kb_target: 'specs/features/{name}.api.md',
        paths: ['src/api/**']
      },
      {
        intent: 'data-model',
        kb_target: 'data/schema/{name}.md',
        paths: ['src/models/**']
      },
      {
        intent: 'service-logic',
        kb_target: 'specs/flows/{name}.md',
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

  // Validate code_path_patterns at load time. Errors propagate as warnings,
  // not throws — loading must succeed even with malformed entries (matches
  // how validateRule is consumed by lint).
  if (Array.isArray(raw.code_path_patterns)) {
    const { validateCodePathPattern } = require('./pattern-audit')
    for (let i = 0; i < raw.code_path_patterns.length; i++) {
      const r = validateCodePathPattern(raw.code_path_patterns[i])
      if (!r.valid) {
        for (const e of r.errors) {
          process.stderr.write(`[kb-rules] code_path_patterns[${i}]: ${e}\n`)
        }
      }
    }
  }

  return {
    getDepthPolicy: () => raw.depth_policy || getDefaultRules().depth_policy,
    getSecretPatterns: () => raw.secret_patterns || getDefaultRules().secret_patterns,
    getCodePathPatterns: () => raw.code_path_patterns || getDefaultRules().code_path_patterns,
    getPromptOverrides: () => raw.prompt_overrides || getDefaultRules().prompt_overrides,
    getCrossAppRefConfig: () => raw.cross_app_refs || getDefaultRules().cross_app_refs,
    getWorkingPathsCap: () => Number.isInteger(raw.working_paths_cap) ? raw.working_paths_cap : 10,
    getStandardsThreshold: () => Number.isInteger(raw.standards_threshold) ? raw.standards_threshold : 40,
    getAppRootPatterns: () => (raw.app_root_patterns && typeof raw.app_root_patterns === 'object') ? raw.app_root_patterns : {},
    getRaw: () => raw
  }
}

module.exports = { loadRules, getDefaultRules }
