const fs = require('fs')
const path = require('path')
const { loadGraph } = require('../lib/graph')
const { loadStandardsIndex } = require('../lib/standards')
const { globMatch } = require('../lib/patterns')

const KB_ROOT = 'knowledge'

// Mirrors analyze.js's directory skip set so we don't wander into build
// output, deps, or KB internals when scanning for source files.
const SKIP_SCAN = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  'knowledge', '.cursor', '.vscode', '.idea', '__pycache__', '.mypy_cache',
  'vendor', 'target', '.gradle', 'bin', 'obj'
])

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.kt', '.kts',
  '.rs', '.cs', '.swift', '.dart',
  '.php', '.ex', '.exs', '.clj', '.scala'
])

const DEFAULT_LOOKBACK_MONTHS = 3
const DEFAULT_DEPTH = 6

/**
 * kb_inventory — read-only signal report for senior devs deciding what to
 * promote into standards. Three deterministic outputs:
 *
 *   stale_rules         standards/rules whose applies_to.paths matches no actual files
 *   uncovered_files     source files matching no standard's applies_to globs
 *   pending_promotions  recent `promoted` entries from drift-log/<YYYY-MM>.md
 *
 * Never writes. Running it twice produces zero changes anywhere. The senior
 * dev consumes the report and decides whether to run kb_extract / kb_write to
 * extend a standard or create a new one.
 *
 * @param {object} opts
 * @param {number} opts.depth          — directory depth for source-file walk (default 6)
 * @param {number} opts.lookback_months — months of drift-log to scan for promotions (default 3)
 * @param {string} opts.scope          — optional glob to restrict the source-file walk
 */
async function runTool({ depth = DEFAULT_DEPTH, lookback_months = DEFAULT_LOOKBACK_MONTHS, scope } = {}) {
  const graph = loadGraph(KB_ROOT)
  const index = loadStandardsIndex(graph)

  const sourceFiles = collectSourceFiles(process.cwd(), depth)
  const filteredFiles = scope ? sourceFiles.filter(f => globMatch(f, scope)) : sourceFiles

  return {
    stale_rules: findStaleRules(index, sourceFiles),
    uncovered_files: findUncoveredFiles(index, filteredFiles),
    pending_promotions: collectPendingPromotions(lookback_months),
    summary: {
      standards_count: index.length,
      rules_count: index.reduce((n, s) => n + (s.rules || []).length, 0),
      source_files_scanned: filteredFiles.length,
      ...(scope && { scope })
    }
  }
}

// ── Stale rules ─────────────────────────────────────────────────────────────

/**
 * A rule is stale when none of its applies_to.paths globs (or, for contracts,
 * any party's applies_to.paths) match any actual source file in the project.
 * Likely causes: rule was written for a directory that no longer exists, glob
 * was typo'd, or the codebase moved to a different layout.
 */
function findStaleRules(index, sourceFiles) {
  const stale = []
  for (const std of index) {
    if (std.kind === 'contract') {
      // Contracts: a contract is stale only when ALL party paths match nothing
      const partyPaths = []
      for (const party of Object.values(std.parties || {})) {
        for (const p of (party.applies_to && party.applies_to.paths) || []) {
          partyPaths.push(p)
        }
      }
      const matched = sourceFiles.some(f => partyPaths.some(p => globMatch(f, p)))
      if (!matched && partyPaths.length > 0) {
        stale.push({
          standard_id: std.id,
          file: std.path,
          kind: 'contract',
          paths: partyPaths,
          reason: 'no source file matches any party applies_to.paths'
        })
      }
      continue
    }

    for (const rule of std.rules || []) {
      const paths = (rule.applies_to && rule.applies_to.paths) || []
      if (paths.length === 0) continue
      const matched = sourceFiles.some(f => paths.some(p => globMatch(f, p)))
      if (!matched) {
        stale.push({
          standard_id: std.id,
          rule_id: rule.id,
          file: std.path,
          paths,
          reason: 'no source file matches applies_to.paths'
        })
      }
    }
  }
  return stale
}

// ── Uncovered files ─────────────────────────────────────────────────────────

/**
 * A source file is uncovered when no standard's applies_to.paths matches it
 * — including any party's paths for contracts. Strong signal that the file
 * sits outside any current convention; the senior dev can decide whether to
 * extend a standard's globs or to leave it intentionally outside.
 *
 * Bounded by `cap` (default 50) so a fresh project doesn't dump every file.
 */
function findUncoveredFiles(index, sourceFiles, cap = 50) {
  // Pre-collect every glob from every rule and every contract party
  const allGlobs = []
  for (const std of index) {
    if (std.kind === 'contract') {
      for (const party of Object.values(std.parties || {})) {
        for (const p of (party.applies_to && party.applies_to.paths) || []) {
          allGlobs.push(p)
        }
      }
    } else {
      for (const rule of std.rules || []) {
        for (const p of (rule.applies_to && rule.applies_to.paths) || []) {
          allGlobs.push(p)
        }
      }
    }
  }

  const uncovered = []
  for (const f of sourceFiles) {
    if (uncovered.length >= cap) break
    if (!allGlobs.some(g => globMatch(f, g))) {
      uncovered.push(f)
    }
  }

  const truncated = uncovered.length === cap && sourceFiles.some(f => !allGlobs.some(g => globMatch(f, g)) && !uncovered.includes(f))
  return { files: uncovered, count: uncovered.length, truncated }
}

// ── Pending promotions ──────────────────────────────────────────────────────

/**
 * Walk the recent drift-log files and pull every entry where conform's
 * resolution was `promoted`. These are senior-review candidates: a developer
 * decided the standard should change, recorded the intent, and is waiting for
 * a senior dev to draft the revision via kb_extract + kb_write.
 *
 * The audit-log format is fixed by conform.js's appendToDriftLog:
 *
 *   ## <date> · CONFORMED · promoted
 *
 *   - **Queue key:** `<standard-id>.<rule-id>`
 *   - **Originating files:** `path/a`, `path/b`
 *   - **Note:** ...
 */
function collectPendingPromotions(lookbackMonths) {
  const driftLogDir = path.join(KB_ROOT, 'sync/drift-log')
  if (!fs.existsSync(driftLogDir)) return []

  const monthFiles = listRecentMonthFiles(driftLogDir, lookbackMonths)
  const promotions = []

  for (const monthFile of monthFiles) {
    const content = fs.readFileSync(monthFile, 'utf8')
    // Each event block starts with `## <date> · ...`. Split on the heading.
    const blocks = content.split(/\n(?=## )/).filter(b => b.trim())
    for (const block of blocks) {
      const heading = block.match(/^## (\S+) · CONFORMED · promoted/)
      if (!heading) continue
      const date = heading[1]
      const queueKey = (block.match(/\*\*Queue key:\*\*\s*`([^`]+)`/) || [])[1]
      const filesLine = block.match(/\*\*Originating files:\*\*\s*(.+?)(?:\n|$)/)
      const note = (block.match(/\*\*Note:\*\*\s*(.+?)(?:\n|$)/) || [])[1] || null
      const originatingFiles = filesLine
        ? [...filesLine[1].matchAll(/`([^`]+)`/g)].map(m => m[1])
        : []
      const [standardId, ruleId] = queueKey ? queueKey.split('.') : [null, null]
      promotions.push({
        date,
        queue_key: queueKey || null,
        standard_id: standardId,
        rule_id: ruleId,
        originating_files: originatingFiles,
        ...(note && { note }),
        log_file: monthFile
      })
    }
  }

  // Most-recent-first
  promotions.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return promotions
}

function listRecentMonthFiles(dir, lookbackMonths) {
  const now = new Date()
  const months = []
  for (let i = 0; i < lookbackMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.md`)
  }
  const out = []
  for (const name of months) {
    const full = path.join(dir, name)
    if (fs.existsSync(full)) out.push(full)
  }
  return out
}

// ── Source-file walk ─────────────────────────────────────────────────────────

function collectSourceFiles(rootDir, maxDepth) {
  const files = []
  function walk(dir, currentDepth) {
    if (currentDepth > maxDepth) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (SKIP_SCAN.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, currentDepth + 1)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.relative(rootDir, fullPath).split(path.sep).join('/'))
      }
    }
  }
  walk(rootDir, 0)
  return files
}

module.exports = {
  runTool,
  // Exposed for tests
  findStaleRules,
  findUncoveredFiles,
  collectPendingPromotions,
  definition: {
    name: 'kb_inventory',
    description: 'Read-only signal report for senior devs. Surfaces stale_rules (standards rules matching no source files), uncovered_files (source files matching no rule), and pending_promotions (recent `promoted` resolutions from kb_conform). Never writes. Use to inform manual kb_extract / kb_write decisions; does not auto-promote.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Directory depth for source-file walk (default 6)' },
        lookback_months: { type: 'number', description: 'Months of drift-log to scan for pending promotions (default 3)' },
        scope: { type: 'string', description: 'Optional glob to restrict the source-file walk (e.g. "ms-fe-web/**")' }
      }
    }
  }
}
