const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { matterStringify } = require('../lib/matter-utils')
const { resolvePrompt } = require('../lib/prompts')
const { getDefaultRules } = require('../lib/rules')
const { loadManifest, writeManifest, walkTemplateFiles, hashFileContent, buildTemplateHashes } = require('../lib/manifest')

const KB_ROOT = 'knowledge'
const PROJECT_TEMPLATES_DIR = path.join(KB_ROOT, '_templates')
const BUNDLED_TEMPLATES_DIR = path.join(__dirname, '../../_templates')

/**
 * kb_upgrade — Upgrades project KB templates and config after MCP server update.
 *
 * Auto-updates unmodified templates, returns merge prompts for customized ones,
 * patches _rules.md with new config keys, and re-runs infrastructure setup.
 */
async function runTool({ dry_run = false, force = false } = {}) {
  // Guard: project must be initialized
  if (!fs.existsSync(PROJECT_TEMPLATES_DIR)) {
    return { error: 'knowledge/_templates/ not found. Run kb_init first.' }
  }
  const rulesPath = path.join(KB_ROOT, '_rules.md')
  if (!fs.existsSync(rulesPath)) {
    return { error: 'knowledge/_rules.md not found. Run kb_init first.' }
  }

  const pkg = require('../package.json')
  const bundledVersion = pkg.version
  const manifest = loadManifest(PROJECT_TEMPLATES_DIR)
  const manifestVersion = manifest ? manifest.mcp_version : '0.0.0'

  if (bundledVersion === manifestVersion && !force) {
    return { message: 'Already up to date.', version: bundledVersion }
  }

  // Build file inventories
  const bundledFiles = walkTemplateFiles(BUNDLED_TEMPLATES_DIR)
  const projectFiles = walkTemplateFiles(PROJECT_TEMPLATES_DIR)
  const projectMap = new Map(projectFiles.map(f => [f.relPath, f.absPath]))
  const manifestHashes = (manifest && manifest.templates) || {}

  const added = []
  const autoUpdated = []
  const conflicted = []
  const unchanged = []

  for (const { relPath, absPath: bundledPath } of bundledFiles) {
    const projectPath = projectMap.get(relPath)
    const bundledHash = hashFileContent(bundledPath)

    if (!projectPath) {
      // NEW: exists in bundle, not in project
      if (!dry_run) {
        const destPath = path.join(PROJECT_TEMPLATES_DIR, relPath)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.copyFileSync(bundledPath, destPath)
      }
      added.push(relPath)
      continue
    }

    const projectHash = hashFileContent(projectPath)

    // UNCHANGED: bundle and project are identical
    if (bundledHash === projectHash) {
      unchanged.push(relPath)
      continue
    }

    // Check if user customized the file
    const installedHash = manifestHashes[relPath]
    const isCustomized = installedHash
      ? projectHash !== installedHash   // hash differs from what we installed
      : true                            // no manifest entry — assume customized (pre-manifest project)

    if (!isCustomized || force) {
      // UNMODIFIED (or force): safe to auto-update
      if (!dry_run) {
        fs.copyFileSync(bundledPath, projectPath)
      }
      autoUpdated.push(relPath)
    } else {
      // CONFLICTED: user customized, needs merge
      const bundledContent = fs.readFileSync(bundledPath, 'utf8')
      const projectContent = fs.readFileSync(projectPath, 'utf8')

      let prompt = null
      try {
        prompt = resolvePrompt('upgrade-merge', {
          template_path: relPath,
          project_content: projectContent.slice(0, 3000),
          bundled_content: bundledContent.slice(0, 3000),
          version_from: manifestVersion,
          version_to: bundledVersion
        })
      } catch {
        prompt = `Merge conflict for ${relPath}: compare project version against bundled version and reconcile manually.`
      }

      conflicted.push({ file: relPath, prompt })
    }
  }

  // Patch _rules.md with missing keys
  const rulesPatched = dry_run ? previewRulesPatch(rulesPath) : patchRules(rulesPath)

  // Re-run kb_init for infrastructure (hooks, merge drivers, folders, agent rules)
  let infraResult = null
  if (!dry_run) {
    try {
      const { runTool: initTool } = require('./init')
      infraResult = await initTool({ interactive: false })
    } catch (e) {
      infraResult = { error: e.message }
    }
  }

  // Write updated manifest
  if (!dry_run) {
    const newHashes = buildTemplateHashes(PROJECT_TEMPLATES_DIR)
    writeManifest(PROJECT_TEMPLATES_DIR, bundledVersion, newHashes)
  }

  return {
    previous_version: manifestVersion,
    new_version: bundledVersion,
    templates_added: added,
    templates_auto_updated: autoUpdated,
    templates_conflicted: conflicted,
    templates_unchanged: unchanged,
    rules_patched: rulesPatched,
    infrastructure: dry_run ? 'skipped (dry run)' : 're-ran kb_init',
    dry_run,
    ...(conflicted.length > 0 && {
      note: 'For conflicted templates, review each prompt. Then write the merged content to the template path using kb_write.'
    })
  }
}

/**
 * Deep-merge missing keys from defaults into _rules.md frontmatter.
 * Never overwrites existing values. Returns list of patched key paths.
 */
function patchRules(rulesPath) {
  const raw = fs.readFileSync(rulesPath, 'utf8')
  const parsed = matter(raw)
  const defaults = getDefaultRules()
  const patched = []

  deepMerge(parsed.data, defaults, '', patched)

  if (patched.length > 0) {
    const updated = matterStringify(parsed.content, parsed.data)
    fs.writeFileSync(rulesPath, updated)
  }

  return patched
}

/**
 * Preview which keys would be patched without writing.
 */
function previewRulesPatch(rulesPath) {
  const raw = fs.readFileSync(rulesPath, 'utf8')
  const parsed = matter(raw)
  const defaults = getDefaultRules()
  const patched = []

  // Work on a copy to avoid mutating
  const copy = JSON.parse(JSON.stringify(parsed.data))
  deepMerge(copy, defaults, '', patched)

  return patched
}

/**
 * Recursively merge missing keys from source into target.
 * Tracks patched key paths for reporting.
 */
function deepMerge(target, source, prefix, patched) {
  for (const key of Object.keys(source)) {
    const keyPath = prefix ? `${prefix}.${key}` : key
    if (!(key in target)) {
      target[key] = source[key]
      patched.push(keyPath)
    } else if (
      typeof source[key] === 'object' && source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' && target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key], keyPath, patched)
    }
    // Arrays and scalars: if key exists in target, keep target value
  }
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_upgrade',
    description: 'Upgrade project KB templates and config after MCP server update. Auto-updates unmodified templates, returns merge prompts for customized ones, patches _rules.md with new keys.',
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'Preview changes without writing', default: false },
        force: { type: 'boolean', description: 'Overwrite all templates including customized ones', default: false }
      }
    }
  }
}
