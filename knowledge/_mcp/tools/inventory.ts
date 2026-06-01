import * as fs from 'fs'
import * as path from 'path'
import { loadGraph } from '../lib/graph'
import { loadStandardsIndex } from '../lib/standards'
import { globMatch, maxGlobDepth } from '../lib/patterns'
import { readLedger } from '../lib/promotion-ledger'
import type { ToolDefinition } from '../src/types/tool'

const KB_ROOT = 'knowledge'

// The standards index this tool iterates — inferred from loadStandardsIndex so
// it stays in lockstep with lib/standards.
type StandardIndex = ReturnType<typeof loadStandardsIndex>

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

const DEFAULT_DEPTH = 6

/**
 * kb_inventory — read-only signal report for senior devs deciding what to
 * promote into standards. Three deterministic outputs:
 *
 *   stale_rules         standards/rules whose applies_to.paths matches no actual files
 *   uncovered_files     source files matching no standard's applies_to globs
 *   pending_promotions  open entries from sync/standards-promotions.md (the ledger)
 *
 * Never writes. Running it twice produces zero changes anywhere. The senior
 * dev consumes the report and decides whether to run kb_extract / kb_write to
 * extend a standard, or close the promotion via kb_conform's closed_promotion.
 *
 * @param {object} opts
 * @param {number} opts.depth — directory depth for source-file walk (default 6)
 * @param {string} opts.scope — optional glob to restrict the source-file walk
 */
async function runTool({ depth = DEFAULT_DEPTH, scope }: { depth?: number; scope?: string } = {}): Promise<Record<string, unknown>> {
  const graph = loadGraph(KB_ROOT)
  const index = loadStandardsIndex(graph)

  const effectiveDepth = maxGlobDepth(collectAllGlobs(index), depth)
  const sourceFiles = collectSourceFiles(process.cwd(), effectiveDepth)
  const filteredFiles = scope ? sourceFiles.filter(f => globMatch(f, scope)) : sourceFiles

  return {
    stale_rules: findStaleRules(index, sourceFiles),
    uncovered_files: findUncoveredFiles(index, filteredFiles),
    pending_promotions: collectPendingPromotions(),
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
function findStaleRules(index: StandardIndex, sourceFiles: string[]): Array<Record<string, unknown>> {
  const stale: Array<Record<string, unknown>> = []
  for (const std of index) {
    if (std.kind === 'contract') {
      // Contracts: a contract is stale only when ALL party paths match nothing
      const partyPaths: string[] = []
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

// ── Glob collection ─────────────────────────────────────────────────────────

/**
 * Flatten every applies_to.paths glob in the index — from every rule and from
 * every contract party. Shared by findUncoveredFiles (matching) and runTool
 * (computing walk depth via maxGlobDepth).
 */
function collectAllGlobs(index: StandardIndex): string[] {
  const globs: string[] = []
  for (const std of index) {
    if (std.kind === 'contract') {
      for (const party of Object.values(std.parties || {})) {
        for (const p of (party.applies_to && party.applies_to.paths) || []) {
          globs.push(p)
        }
      }
    } else {
      for (const rule of std.rules || []) {
        for (const p of (rule.applies_to && rule.applies_to.paths) || []) {
          globs.push(p)
        }
      }
    }
  }
  return globs
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
function findUncoveredFiles(index: StandardIndex, sourceFiles: string[], cap = 50): { files: string[]; count: number; truncated: boolean } {
  const allGlobs = collectAllGlobs(index)

  const uncovered: string[] = []
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
 * Read the promotions ledger (sync/standards-promotions.md) — the source of
 * truth for (file, rule) pairs awaiting senior review. Entries here are
 * suppressed from kb_conform's Phase 1 sweeps; they auto-close when the rule's
 * fingerprint changes (i.e. a senior dev updated the standard) or when
 * kb_conform is called with closed_promotion[].
 *
 * One ledger entry produces one report row per (queue_key, file) pair so the
 * senior dev sees granularity matching what's actually suppressed.
 */
function collectPendingPromotions(): Array<Record<string, unknown>> {
  const { entries } = readLedger()
  const promotions: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    for (const f of entry.files) {
      promotions.push({
        date: f.promotedAt,
        queue_key: entry.queueKey,
        standard_id: entry.standardId,
        rule_id: entry.ruleId,
        originating_files: [f.path],
        ...(f.note && { note: f.note })
      })
    }
  }
  promotions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return promotions
}

// ── Source-file walk ─────────────────────────────────────────────────────────

function collectSourceFiles(rootDir: string, maxDepth: number): string[] {
  const files: string[] = []
  function walk(dir: string, currentDepth: number): void {
    if (currentDepth > maxDepth) return
    let entries: fs.Dirent[]
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

const definition: ToolDefinition = {
  name: 'kb_inventory',
  description: 'Read-only signal report for senior devs. Surfaces stale_rules (standards rules matching no source files), uncovered_files (source files matching no rule), and pending_promotions (open entries from the suppression ledger awaiting senior review). Never writes. Use to inform manual kb_extract / kb_write decisions, or to close promotions via kb_conform.',
  inputSchema: {
    type: 'object',
    properties: {
      depth: { type: 'number', description: 'Directory depth for source-file walk (default 6)' },
      scope: { type: 'string', description: 'Optional glob to restrict the source-file walk (e.g. "ms-fe-web/**")' }
    }
  }
}

// findStaleRules/findUncoveredFiles/collectPendingPromotions exposed for tests.
export { runTool, findStaleRules, findUncoveredFiles, collectPendingPromotions, definition }
