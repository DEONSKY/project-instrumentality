const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { runTool: reindex } = require('./reindex')

const KB_ROOT = 'knowledge'

const FOLDER_STRUCTURE = [
  'features',
  'flows',
  'data/schema',
  'validation',
  'ui',
  'integrations',
  'decisions',
  'foundation',
  '_templates/data',
  '_templates/ui',
  '_templates/foundation',
  '_templates/prompts',
  '_prompt-overrides',
  'assets/design',
  'assets/screenshots',
  'exports',
  'sync'
]

const GIT_ATTRIBUTES = `knowledge/_index.yaml           merge=kb-reindex
knowledge/sync/review-queue.md  merge=union
knowledge/sync/drift-log.md     merge=union
knowledge/sync/changelog.md     merge=union
knowledge/features/**           merge=kb-conflict
knowledge/flows/**              merge=kb-conflict
knowledge/_rules.md             merge=kb-conflict
knowledge/assets/**             filter=lfs diff=lfs merge=lfs -text
`

const CURSOR_MCP = {
  mcpServers: {
    kb: {
      command: 'node',
      args: ['knowledge/_mcp/server.js']
    }
  }
}

// Hooks check local path first, then fall back to the MCP server's own location.
// This makes them work whether or not the MCP server is installed inside the project.
const _LINT_SCRIPT = path.join(__dirname, '../scripts/lint-standalone.js')
const _SERVER_SCRIPT = path.join(__dirname, '../server.js')

const PRE_COMMIT_HOOK = `#!/bin/sh
LOCAL="knowledge/_mcp/scripts/lint-standalone.js"
BUNDLED="${_LINT_SCRIPT}"
if [ -f "$LOCAL" ]; then node "$LOCAL"
elif [ -f "$BUNDLED" ]; then node "$BUNDLED"
fi
`

const PRE_PUSH_HOOK = `#!/bin/sh
LOCAL="knowledge/_mcp/server.js"
BUNDLED="${_SERVER_SCRIPT}"
SERVER="$LOCAL"
[ -f "$BUNDLED" ] && SERVER="$BUNDLED"
node -e "
const fs = require('fs');
const drift = require('$SERVER/../tools/drift');
drift.runTool({}).then(result => {
  if (result.error) {
    process.stderr.write('[kb-drift] skipped: ' + result.error + '\\\\n');
    return;
  }
  if (result.message) {
    process.stderr.write('[kb-drift] ' + result.message + '\\\\n');
    return;
  }
  if (result.manifests && result.manifests.length > 0) {
    const date = new Date().toISOString().split('T')[0];
    const lines = ['', '## ' + date, ''];
    result.manifests.forEach(m => {
      lines.push('- \`' + m.code_file + '\` → \`' + m.kb_target + '\` (' + m.intent + ')');
    });
    lines.push('');
    lines.push('> Run \`kb_drift\` in Claude to generate and write sync notes.');
    lines.push('');
    const logPath = 'knowledge/sync/drift-log.md';
    if (fs.existsSync(logPath)) {
      fs.appendFileSync(logPath, lines.join('\\\\n'));
    }
    process.stderr.write('[kb-drift] drift detected in ' + result.manifests.length + ' file(s):\\\\n');
    result.manifests.forEach(m => {
      process.stderr.write('[kb-drift]   ' + m.code_file + ' -> ' + m.kb_target + '\\\\n');
    });
    process.stderr.write('[kb-drift] Written to knowledge/sync/drift-log.md — run kb_drift in Claude to sync.\\\\n');
  }
}).catch(() => {});
" 2>&1 || true
`

const POST_MERGE_HOOK = `#!/bin/sh
LOCAL="knowledge/_mcp/tools/reindex.js"
BUNDLED="${path.join(__dirname, '../tools/reindex.js')}"
SCRIPT="$LOCAL"
[ -f "$BUNDLED" ] && SCRIPT="$BUNDLED"
node -e "require('./$SCRIPT').runTool({})" 2>/dev/null || true
`

const POST_CHECKOUT_HOOK = `#!/bin/sh
LOCAL="knowledge/_mcp/scripts/lint-standalone.js"
BUNDLED="${_LINT_SCRIPT}"
if [ -f "$LOCAL" ]; then node "$LOCAL"
elif [ -f "$BUNDLED" ]; then node "$BUNDLED"
fi
`

async function runTool({ interactive = true, config = null } = {}) {
  let cfg = config

  if (interactive && !cfg) {
    cfg = await promptConfig()
  } else if (!cfg) {
    cfg = getDefaultConfig()
  }

  const filesCreated = []

  // 1. Create folder structure
  FOLDER_STRUCTURE.forEach(folder => {
    const fullPath = path.join(KB_ROOT, folder)
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
      filesCreated.push(fullPath + '/')
    }
  })

  // 2. Write sync stub files
  const syncFiles = {
    'sync/drift-log.md': '# Drift Log\n\nAuto-detected divergences between KB and codebase.\n',
    'sync/review-queue.md': '# Review Queue\n\nItems requiring attention.\n',
    'sync/changelog.md': '# Changelog\n\nAuto-generated KB change history.\n',
    'sync/import-review.md': '# Import Review\n\nChunks that could not be confidently classified during import.\n'
  }

  Object.entries(syncFiles).forEach(([rel, content]) => {
    const fullPath = path.join(KB_ROOT, rel)
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content)
      filesCreated.push(fullPath)
    }
  })

  // 3. Write _rules.md from config
  const rulesPath = path.join(KB_ROOT, '_rules.md')
  if (!fs.existsSync(rulesPath)) {
    const rulesContent = generateRulesContent(cfg)
    fs.writeFileSync(rulesPath, rulesContent)
    filesCreated.push(rulesPath)
  }

  // 4. Copy templates from _mcp internal templates
  copyTemplates(filesCreated)

  // 5. Write .gitattributes
  const gitAttrPath = '.gitattributes'
  if (!fs.existsSync(gitAttrPath)) {
    fs.writeFileSync(gitAttrPath, GIT_ATTRIBUTES)
    filesCreated.push(gitAttrPath)
  }

  // 6. Ensure git repo exists — auto-init if not (hooks require .git)
  let gitInitialized = false
  if (!fs.existsSync('.git')) {
    const { execSync } = require('child_process')
    try {
      execSync('git init', { cwd: process.cwd(), stdio: 'ignore' })
      gitInitialized = true
      console.log('[kb-init] No git repository found — ran `git init` automatically.')
    } catch (e) {
      console.warn('[kb-init] Could not run `git init`:', e.message)
    }
  }

  // 7. Install git hooks
  const hooksInstalled = installGitHooks()

  // 8. Install git merge drivers in .git/config
  installMergeDrivers()

  // 9. Write .cursor/mcp.json
  const cursorDir = '.cursor'
  if (!fs.existsSync(cursorDir)) fs.mkdirSync(cursorDir, { recursive: true })
  fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(CURSOR_MCP, null, 2))
  filesCreated.push('.cursor/mcp.json')

  // 10. Generate initial _index.yaml
  await reindex({ silent: true })
  filesCreated.push(path.join(KB_ROOT, '_index.yaml'))

  // 11. Print setup guide
  printSetupGuide(cfg)

  return {
    setup_complete: true,
    files_created: filesCreated,
    hooks_installed: hooksInstalled,
    ...(gitInitialized && { git_initialized: true, note: '`git init` was run automatically — remember to set your remote with `git remote add origin <url>`' })
  }
}

async function promptConfig() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise(resolve => rl.question(q, resolve))

  console.log('\n=== KB-MCP Setup ===\n')

  const projectName = await ask('Project name: ')
  const appNamesInput = await ask('App names (comma-separated, e.g. frontend,backend): ')
  const appNames = appNamesInput.split(',').map(s => s.trim()).filter(Boolean)

  rl.close()

  return { projectName, appNames }
}

function getDefaultConfig() {
  return { projectName: 'My Project', appNames: ['app'] }
}

function generateRulesContent(cfg) {
  const appNames = (cfg.appNames || ['app']).join(', ')
  return `---
version: "1.0"
project_name: "${cfg.projectName || 'My Project'}"
app_names: [${appNames}]

depth_policy:
  default_max: 3
  group_trigger: 5
  group_warn: 8
  overrides:
    features: 3
    flows: 2
    ui: 2
    integrations: 2
    data: 2
    validation: 1
    decisions: 1
    foundation: 1
    sync: 1
  never_group:
    - data
    - validation
    - decisions
    - foundation
    - sync

secret_patterns:
  - sk_live_
  - "Bearer "
  - private_key
  - "password:"
  - "api_key:"
  - "secret:"

cross_app_refs:
  prefix: "@shared/"
  always_shared:
    - data
    - validation
    - integrations
    - decisions
    - foundation

code_path_patterns:
  - intent: validation
    kb_target: "validation/common.md"
    paths:
      - "src/validators/**"
  - intent: form
    kb_target: "features/{name}.md"
    paths:
      - "src/components/**Form*"
    name_extraction:
      strip_suffix: [Form, Screen, Page, View, Container]
      case: kebab
  - intent: component
    kb_target: "ui/components.md"
    paths:
      - "src/components/**"
  - intent: route-guard
    kb_target: "flows/{name}.guards.md"
    paths:
      - "src/routes/**"
  - intent: api-contract
    kb_target: "features/{name}.api.md"
    paths:
      - "src/api/**"
  - intent: data-model
    kb_target: "data/schema/{name}.md"
    paths:
      - "src/models/**"
  - intent: service-logic
    kb_target: "flows/{name}.md"
    paths:
      - "src/services/**"

prompt_overrides:
  base_dir: "knowledge/_templates/prompts"
  override_dir: "knowledge/_prompt-overrides"
  valid_override_types:
    - replace
    - extend-before
    - extend-after
    - suppress
    - section-replace
  suppress_requires_reason: true
  protected:
    - drift-summary
    - ask-sync
---

# Knowledge Base Rules

This file configures the KB-MCP system. Edit the YAML front-matter above to configure:
- Folder depth limits
- Secret patterns to block
- Code path patterns for drift detection
- Prompt override settings

See knowledge/_mcp/presets/ for stack-specific code_path_patterns presets.
`
}

function copyTemplates(filesCreated) {
  // Templates are bundled with the MCP server — copy from server location into the new project.
  const mcpTemplatesDir = path.join(__dirname, '../../_templates')
  const kbTemplatesDir = path.join(KB_ROOT, '_templates')

  if (fs.existsSync(mcpTemplatesDir)) {
    copyDirRecursive(mcpTemplatesDir, kbTemplatesDir, filesCreated)
  }
}

function copyDirRecursive(src, dest, filesCreated) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  entries.forEach(entry => {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filesCreated)
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
      filesCreated.push(destPath)
    }
  })
}

function installGitHooks() {
  const hooksDir = '.git/hooks'
  if (!fs.existsSync(hooksDir)) return []

  const hooks = {
    'pre-commit': PRE_COMMIT_HOOK,
    'pre-push': PRE_PUSH_HOOK,
    'post-merge': POST_MERGE_HOOK,
    'post-checkout': POST_CHECKOUT_HOOK
  }

  const installed = []
  Object.entries(hooks).forEach(([name, content]) => {
    const hookPath = path.join(hooksDir, name)
    if (!fs.existsSync(hookPath)) {
      fs.writeFileSync(hookPath, content)
      fs.chmodSync(hookPath, '755')
      installed.push(name)
    }
  })

  return installed
}

function installMergeDrivers() {
  try {
    const gitConfigPath = '.git/config'
    if (!fs.existsSync(gitConfigPath)) return

    let config = fs.readFileSync(gitConfigPath, 'utf8')

    const reindexDriver = `\n[merge "kb-reindex"]\n\tdriver = node knowledge/_mcp/drivers/kb-reindex.js %O %A %B %L %P\n`
    const conflictDriver = `\n[merge "kb-conflict"]\n\tdriver = node knowledge/_mcp/drivers/kb-conflict.js %O %A %B %L %P\n`

    if (!config.includes('merge "kb-reindex"')) config += reindexDriver
    if (!config.includes('merge "kb-conflict"')) config += conflictDriver

    fs.writeFileSync(gitConfigPath, config)
  } catch (e) {
    console.warn('[init] Could not install merge drivers:', e.message)
  }
}

function printSetupGuide(cfg) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           KB-MCP Setup Complete                      ║
║  Project: ${(cfg.projectName || 'My Project').padEnd(42)}║
╚══════════════════════════════════════════════════════╝

Next steps:

1. Install dependencies:
   cd knowledge/_mcp && npm install

2. Configure code paths for your stack:
   Edit knowledge/_rules.md → code_path_patterns
   Or copy a preset: knowledge/_mcp/presets/nextjs.yaml

3. Scaffold your first KB file:
   kb_scaffold type=feature id=my-first-feature

4. Add foundation files:
   kb_scaffold type=global-rules
   kb_scaffold type=tech-stack
   kb_scaffold type=conventions

5. Open in Cursor/Claude Code — the MCP server auto-starts.
   No API key needed — the agent IS the LLM.

KB root: knowledge/
MCP config: .cursor/mcp.json
Rules: knowledge/_rules.md
`)
}

module.exports = { runTool }
