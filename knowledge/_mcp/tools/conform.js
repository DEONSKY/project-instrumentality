const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const matter = require('gray-matter')
const simpleGit = require('simple-git')
const yaml = require('js-yaml')
const { resolvePrompt } = require('../lib/prompts')
const { loadGraph } = require('../lib/graph')
const { loadRules } = require('../lib/rules')
const { globMatch } = require('../lib/patterns')
const { detectSubmodules } = require('../lib/submodule-sweep')
const {
  loadStandardsIndex,
  inferAppScope,
  getRule,
  validateStandard
} = require('../lib/standards')
const { preFilter } = require('../lib/rule-detect')
const {
  readLedger,
  writeLedger,
  addPromotions,
  removePromotions,
  getSuppressedPairs,
  applyFileChangesToLedger,
  computeRuleFingerprint
} = require('../lib/promotion-ledger')
const { runTool: runReindex } = require('./reindex')
const {
  parseNameStatus,
  authorHandleFromEmail,
  baselineReachable,
  getLocalGitUserHandle
} = require('../lib/git-ops')
const { KB_ROOT } = require('../lib/kb-constants')
const {
  STANDARDS_DRIFT_PATH,
  STANDARDS_BACKLOG_PATH,
  DRIFT_LOG_DIR,
  PENDING_DIR,
  STANDARDS_DRIFT_HEADER,
  STANDARDS_BACKLOG_HEADER,
  BASELINE_RE,
  parseBaseline,
  setBaseline,
  ensureHeader,
  parseAcknowledgement,
  formatAcknowledgement,
  readQueue,
  writeQueue,
  formatFileLine,
  getDriftLogPath,
  appendToDriftLog,
  writePending,
  readPending,
  clearPending,
  upsertQueueEntry,
  applyFileChangesToQueue,
  findEntryByKey,
  removeEntry
} = require('./conform/queue')

// Diff prefetch budgets — mirror drift's caps so a noisy run can't blow the
// agent's context. The reproducible `cmd` is always preserved when content is
// dropped so the agent can fetch the full diff manually.
const PER_FILE_LINE_CAP = 400
const TOTAL_LINE_CAP = 6000

// Per-file content cap when sampling for the LLM judge. Keeps the prompt
// bounded; the agent can always re-read the full file via Read if it needs to.
const PER_FILE_CHAR_CAP = 8000
// Total cap across all files in one Phase 1 prompt. Without this, a sweep
// with many evaluations multiplied PER_FILE_CHAR_CAP by N and blew past the
// MCP response budget (observed at 165KB on a real consumer repo). Tuned to
// 32KB so the prompt + diffs (capped separately) + envelope land under the
// ~64KB MCP response budget on most setups. When exceeded, remaining files
// emit a stub pointing the agent at `cat` so it can fetch on demand without
// losing the requested_evaluations list.
const TOTAL_CONTENT_CHAR_CAP = 32000


// ── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve changed files relative to `ref`. When `includeWorkingTree` is true,
 * also union the parent's working-tree changes (staged + unstaged + untracked)
 * AND each submodule's working-tree state — even submodules whose parent
 * gitlink hasn't moved. Files carry a private `_source` tag the caller can
 * propagate onto queue entries.
 */
async function getChangedFiles(git, ref, { includeWorkingTree = false } = {}) {
  // Parent committed: ref..HEAD, with committed submodule pointer changes
  // expanded into the actual files-inside.
  let committed = []
  try {
    const result = await git.diff(['--name-status', '-M', ref, 'HEAD'])
    committed = await expandSubmoduleEntries(git, parseNameStatus(result), ref)
  } catch {
    try {
      const fallback = '4b825dc642cb6eb9a060e54bf899d15f7dcb6820'
      const result = await git.diff(['--name-status', '-M', fallback, 'HEAD'])
      committed = await expandSubmoduleEntries(git, parseNameStatus(result), fallback)
    } catch {
      committed = []
    }
  }
  for (const f of committed) f._source = 'committed'

  if (!includeWorkingTree) return committed

  // Parent working tree (no second ref → git diffs against working dir,
  // capturing staged + unstaged in one shot).
  let parentWorkingTree = []
  try {
    const result = await git.diff(['--name-status', '-M', ref])
    parentWorkingTree = parseNameStatus(result)
  } catch { /* leave empty */ }

  let parentUntracked = []
  try {
    const out = await git.raw(['ls-files', '--others', '--exclude-standard'])
    parentUntracked = out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(p => ({ status: 'A', path: p }))
  } catch { /* leave empty */ }

  // Submodule pointer files may surface in the parent working-tree diff
  // (status 'M' when there are inside-edits). Strip them so we don't
  // double-count after expanding inside-changes below.
  const submodules = detectSubmodules(process.cwd())
  const subPathSet = new Set(submodules.map(s => s.path))
  parentWorkingTree = parentWorkingTree.filter(f => !subPathSet.has(f.path))
  parentUntracked = parentUntracked.filter(f => !subPathSet.has(f.path))

  // Iterate every submodule, regardless of pointer movement — uncommitted
  // edits inside a submodule must surface even when the parent gitlink
  // hasn't been bumped.
  const subFiles = []
  for (const sub of submodules) {
    try {
      const subRefLine = (await git.raw(['ls-tree', ref, '--', sub.path])).trim()
      const m = subRefLine.match(/^160000 commit ([a-f0-9]+)/)
      const subRef = m ? m[1] : null
      if (!subRef) continue
      const subGit = simpleGit(sub.fullPath)
      // Working-tree diff inside the submodule, anchored at the parent's
      // recorded gitlink (so the diff reads "everything the author has
      // touched relative to the queue baseline").
      try {
        const result = await subGit.diff(['--name-status', '-M', subRef])
        for (const sf of parseNameStatus(result)) {
          subFiles.push({
            ...sf,
            path: `${sub.path}/${sf.path}`,
            ...(sf.oldPath ? { oldPath: `${sub.path}/${sf.oldPath}` } : {})
          })
        }
      } catch { /* fall through to untracked */ }
      // Untracked inside the submodule
      try {
        const out = await subGit.raw(['ls-files', '--others', '--exclude-standard'])
        for (const p of out.split('\n').map(l => l.trim()).filter(Boolean)) {
          subFiles.push({ status: 'A', path: `${sub.path}/${p}` })
        }
      } catch { /* leave empty */ }
    } catch { /* submodule missing or inaccessible — skip */ }
  }

  // Dedup against committed. Working-tree presence wins on Latest so the UI
  // renders "working tree" even when an earlier commit also touched the file.
  const committedByPath = new Map()
  for (const f of committed) {
    committedByPath.set(f.path, f)
    if (f.oldPath) committedByPath.set(f.oldPath, f)
  }

  for (const f of [...parentWorkingTree, ...parentUntracked, ...subFiles]) {
    const existing = committedByPath.get(f.path)
      || (f.oldPath ? committedByPath.get(f.oldPath) : undefined)
    if (existing) {
      existing._source = 'working-tree'
    } else {
      f._source = 'working-tree'
      committed.push(f)
      committedByPath.set(f.path, f)
      if (f.oldPath) committedByPath.set(f.oldPath, f)
    }
  }

  return committed
}

/**
 * Resolve the local git user's handle (mailmap-aware via authorHandleFromEmail-
 * style stripping) so purely-uncommitted entries can be credited to the
 * author rather than showing as anonymous. Returns null when both
 * user.email and user.name are unset.
 */
// getLocalGitUserHandle is imported from ../lib/git-ops

// Walk files and replace submodule pointer entries with the actual files changed
// inside the submodule between the parent's old and new pointer SHAs.
//
// Boundary: this only fires when the parent's pointer SHA actually moves.
// Submodule-internal commits that haven't been bumped into the parent are
// invisible to current-mode drift — the parent's diff is the source of truth.
// Run kb_conform inside the submodule, or bump the pointer first.
async function expandSubmoduleEntries(git, files, ref) {
  const out = []
  for (const f of files) {
    let isSubmodule = false
    try {
      const tree = await git.raw(['ls-tree', 'HEAD', '--', f.path])
      isSubmodule = tree.trim().startsWith('160000')
    } catch { /* not a submodule or git error — treat as regular file */ }

    if (!isSubmodule) { out.push(f); continue }

    try {
      const oldShaLine = (await git.raw(['ls-tree', ref, '--', f.path])).trim()
      const newShaLine = (await git.raw(['ls-tree', 'HEAD', '--', f.path])).trim()
      const oldSha = oldShaLine.split(/\s+/)[2]
      const newSha = newShaLine.split(/\s+/)[2]
      if (!oldSha || !newSha || oldSha === newSha) continue
      if (!fs.existsSync(f.path)) { out.push(f); continue }
      const subGit = simpleGit(f.path)
      const result = await subGit.diff(['--name-status', '-M', oldSha, newSha])
      const subFiles = parseNameStatus(result).map(sf => ({
        ...sf,
        path: `${f.path}/${sf.path}`,
        ...(sf.oldPath ? { oldPath: `${f.path}/${sf.oldPath}` } : {})
      }))
      out.push(...subFiles)
    } catch {
      out.push(f) // fallback: include the submodule entry itself
    }
  }
  return out
}

// parseNameStatus + baselineReachable are imported from ../lib/git-ops

async function resolveBootstrapRef(git) {
  // Simpler than drift's full resolveLastSyncRef chain — conform's baseline
  // doesn't need to chase remote/upstream because the diff window is local.
  // Fall back to the empty tree SHA so first-run still produces a meaningful
  // diff (everything in HEAD looks "new").
  try {
    const upstream = (await git.raw(['rev-parse', '--abbrev-ref', '@{upstream}'])).trim()
    if (upstream) return upstream
  } catch {}
  try {
    const head = (await git.raw(['rev-parse', 'HEAD~1'])).trim()
    if (head) return head
  } catch {}
  return '4b825dc642cb6eb9a060e54bf899d15f7dcb6820' // empty tree
}

// ── Phase 1 detect ────────────────────────────────────────────────────────────

async function detect(opts) {
  const { mode = 'current', scope, since, includeDiffs = false, path_filter, readonly = false, includeWorkingTree = false, promptMode = 'inline' } = opts
  // Readonly callers (live overlay) always want working-tree visibility so the
  // panel previews drift before commit. Explicit opt-in (`include_working_tree`)
  // unlocks the same behavior for write-mode callers.
  const wantWorkingTree = readonly || includeWorkingTree
  // Forbid path_filter in current mode: current-mode Phase 1 advances baseline
  // to HEAD on success, so a filtered sweep would silently skip files that fall
  // outside the filter on the next run.
  if (path_filter && mode !== 'aspirational') {
    return { error: 'path_filter is only valid in aspirational mode (current mode advances baseline based on the full diff and would skip filtered files on subsequent sweeps)' }
  }
  const filterGlobs = normalizePathFilter(path_filter)
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER

  const git = simpleGit(process.cwd())
  const rules = loadRules(KB_ROOT)
  const graph = loadGraph(KB_ROOT)
  const standardsIndex = loadStandardsIndex(graph)

  // Footgun guard: if any standard has a non-`all` app_scope but
  // _rules.md has no app_root_patterns, every file's inferred scope is
  // null and `appScopeMatches` rejects every scoped standard silently —
  // the user sees 0 evaluations with no explanation. Surface it.
  const configWarnings = []
  const rawRules = typeof rules.getRaw === 'function' ? rules.getRaw() : rules
  const hasAppRootPatterns = rawRules && rawRules.app_root_patterns && Object.keys(rawRules.app_root_patterns).length > 0
  if (!hasAppRootPatterns) {
    const scopedStandards = standardsIndex.filter(s => {
      const sc = s.app_scope
      if (!sc) return false
      if (sc === 'all') return false
      if (Array.isArray(sc)) return !sc.includes('all') && sc.length > 0
      return true
    })
    if (scopedStandards.length > 0) {
      const sample = scopedStandards.slice(0, 3).map(s => `${s.id} (app_scope: ${Array.isArray(s.app_scope) ? s.app_scope.join(',') : s.app_scope})`).join('; ')
      configWarnings.push(
        `${scopedStandards.length} standard(s) declare a non-\`all\` app_scope but knowledge/_rules.md has no \`app_root_patterns\` block — `
        + `every file's inferred scope is null, so these standards never match. `
        + `Example: ${sample}. `
        + `Fix: add an \`app_root_patterns\` map to _rules.md mapping path globs to app names (e.g. \`ms-linestop-admin-be/**: admin-be\`).`
      )
    }
  }

  // Stale-index check: the standards index drives rule fingerprints used by
  // promotion auto-close. If a reviewer edits a standard manually (outside
  // kb_write) the on-disk file changes but `_index.yaml` doesn't — the
  // fingerprint stays the same and auto-close silently no-ops. Compare mtimes
  // and surface a warning rather than auto-reindexing, so the workflow stays
  // explicit.
  const staleStandards = findStaleStandards()
  if (staleStandards.length > 0) {
    const sample = staleStandards.slice(0, 3).join(', ')
    configWarnings.push(
      `${staleStandards.length} standard file(s) modified after last kb_reindex (${sample}${staleStandards.length > 3 ? ', …' : ''}). `
      + `Promotion auto-close compares rule fingerprints from _index.yaml — if you just edited a standard, run kb_reindex before kb_conform so fingerprint mismatches are detected.`
    )
  }

  const queueState = readQueue(queuePath, queueHeader)
  const ledgerState = readLedger()
  let baseline = since && since !== 'last-sync' ? since : parseBaseline(queueState.header)
  if (baseline && !(await baselineReachable(git, baseline))) {
    process.stderr.write(`[kb-conform] warning: baseline ${baseline} unreachable; re-bootstrapping\n`)
    baseline = await resolveBootstrapRef(git)
  }
  if (!baseline) baseline = await resolveBootstrapRef(git)

  // Head info for stamping new entries' Since/Latest
  let headSha = 'HEAD'
  let headShort = 'unknown'
  let headDate = new Date().toISOString().split('T')[0]
  try {
    const log = await git.log({ maxCount: 1 })
    if (log.latest) {
      headSha = log.latest.hash
      headShort = headSha.slice(0, 7)
      headDate = log.latest.date.split('T')[0]
    }
  } catch { /* non-fatal */ }

  // Resolve which files Phase 1 considers
  let candidateFiles = []
  if (mode === 'aspirational' && scope) {
    // Aspirational: scope is the standard's file path. Find rules in that
    // standard and intersect the tracked-file set with their applies_to.paths.
    const stdEntry = standardsIndex.find(s => s.path === scope.replace(/^knowledge\//, '') || s.path === scope)
    if (!stdEntry) {
      return { error: `Standard not found in index: ${scope}. Run kb_reindex first.` }
    }
    const ruleGlobs = []
    if (stdEntry.kind === 'contract') {
      for (const party of Object.values(stdEntry.parties || {})) {
        for (const p of (party.applies_to && party.applies_to.paths) || []) ruleGlobs.push(p)
      }
    } else {
      for (const rule of stdEntry.rules) {
        for (const p of (rule.applies_to && rule.applies_to.paths) || []) ruleGlobs.push(p)
      }
    }
    const tracked = await listTrackedFiles(git)
    const candidates = new Map() // path → 'committed' | 'working-tree'
    for (const rel of tracked) candidates.set(rel, 'committed')
    // F18: include uncommitted (untracked-non-ignored + tracked-modified) when
    // the caller opted in via `include_working_tree` or is a readonly live
    // overlay. Untracked first so a path showing up both ways still gets a
    // sensible source tag.
    if (wantWorkingTree) {
      try {
        const untrackedOut = await git.raw(['ls-files', '--others', '--exclude-standard'])
        for (const rel of untrackedOut.split('\n').map(l => l.trim()).filter(Boolean)) {
          if (!candidates.has(rel)) candidates.set(rel, 'working-tree')
        }
      } catch { /* leave empty */ }
    }
    const collected = new Set()
    const sourceByPath = new Map()
    for (const [rel, src] of candidates) {
      if (!ruleGlobs.some(g => globMatch(rel, g))) continue
      if (filterGlobs && !filterGlobs.some(g => globMatch(rel, g))) continue
      collected.add(rel)
      sourceByPath.set(rel, src)
    }
    if (filterGlobs && collected.size === 0) {
      return { error: `path_filter ${JSON.stringify(path_filter)} produced no candidates inside standard "${stdEntry.id}" (intersection with applies_to.paths is empty)` }
    }
    candidateFiles = [...collected].map(p => ({ status: 'A', path: p, _source: sourceByPath.get(p) || 'committed' }))
  } else {
    // Current-diff mode: changed files between baseline and HEAD. When the
    // caller opted in (`include_working_tree`) or is a readonly live overlay,
    // also union the working tree so the sidebar / agent can preview standards
    // drift before commit. The default write path keeps `baseline..HEAD`
    // semantics, matching today's published-queue behavior.
    candidateFiles = await getChangedFiles(git, baseline, { includeWorkingTree: wantWorkingTree })
    if (scope) {
      candidateFiles = candidateFiles.filter(f => globMatch(f.path, scope) || (f.oldPath && globMatch(f.oldPath, scope)))
    }
  }
  // Resolved once per detect call — used to credit purely-uncommitted entries
  // to the local user when no committed history covers the file.
  const localUser = readonly ? await getLocalGitUserHandle(git) : null

  // Handle deletions and renames against open queue entries up front
  const renamed = []
  const deleted = []
  for (const f of candidateFiles) {
    if (f.status === 'R' && f.oldPath) renamed.push({ from: f.oldPath, to: f.path })
    if (f.status === 'D') deleted.push(f.path)
  }
  if (renamed.length || deleted.length) {
    applyFileChangesToQueue(queueState, renamed, deleted)
    applyFileChangesToLedger(ledgerState, renamed, deleted)
  }

  // Handle deleted standards — auto-dismiss entries whose standard no longer
  // exists in the graph. Catches the case where a standard file is removed
  // (kb_write delete or external rm); keeps the queue from accumulating
  // ghosts.
  const liveStandardIds = new Set(standardsIndex.map(s => s.id))
  const autoDismissed = []
  queueState.entries = queueState.entries.filter(e => {
    if (e.standardId && !liveStandardIds.has(e.standardId)) {
      autoDismissed.push({ event_type: 'auto-dismissed-standard-removed', queue_key: e.queueKey, reason: `standard "${e.standardId}" removed` })
      return false
    }
    return true
  })
  if (autoDismissed.length && !readonly) appendToDriftLog(autoDismissed)

  // Auto-close promotion ledger entries whose standard is gone or whose rule
  // fingerprint has changed (i.e. a senior reviewer updated the standard).
  // Both events drop the entry from suppression so the rule re-evaluates
  // normally on this run.
  const autoClosedPromotions = []
  const survivingLedger = []
  for (const entry of ledgerState.entries) {
    if (!liveStandardIds.has(entry.standardId)) {
      autoClosedPromotions.push({
        event_type: 'auto-closed-promotion-standard-removed',
        queue_key: entry.queueKey,
        reason: `standard "${entry.standardId}" removed`
      })
      continue
    }
    const std = standardsIndex.find(s => s.id === entry.standardId)
    const rule = std && (std.rules || []).find(r => r.id === entry.ruleId)
    if (!rule) {
      autoClosedPromotions.push({
        event_type: 'auto-closed-promotion-standard-removed',
        queue_key: entry.queueKey,
        reason: `rule "${entry.ruleId}" removed from standard "${entry.standardId}"`
      })
      continue
    }
    const currentFingerprint = computeRuleFingerprint(rule, std)
    if (entry.ruleFingerprint && entry.ruleFingerprint !== currentFingerprint) {
      autoClosedPromotions.push({
        event_type: 'auto-closed-promotion-rule-changed',
        queue_key: entry.queueKey,
        reason: `rule fingerprint changed (${entry.ruleFingerprint} → ${currentFingerprint})`
      })
      continue
    }
    survivingLedger.push(entry)
  }
  if (autoClosedPromotions.length) {
    ledgerState.entries = survivingLedger
    if (!readonly) {
      writeLedger(ledgerState)
      appendToDriftLog(autoClosedPromotions)
    }
  }

  // Build suppression set: (queueKey → Set<filePath>) of pairs awaiting senior
  // review. Applied to llm-survivors below so promoted (file, rule) pairs don't
  // re-fire until the standard changes or closed_promotion is called.
  const suppressedPairs = getSuppressedPairs(ledgerState)
  const isSuppressed = (standardId, ruleId, filePath) => {
    const files = suppressedPairs.get(`${standardId}.${ruleId}`)
    return files ? files.has(filePath) : false
  }

  // Pre-filter every (file, rule) pair; survivors go into requested_evaluations
  const requestedEvaluations = []
  const naCount = { count: 0 }
  const fileContents = new Map()
  const sprawlWarnings = []

  for (const f of candidateFiles) {
    if (f.status === 'D') continue // deleted files don't need conformance check
    const filePath = f.path
    const fileSource = f._source || 'committed'
    const fileAuthor = fileSource === 'working-tree' ? localUser : null
    const appScope = inferAppScope(filePath, rules)

    let content
    const readFile = () => {
      if (fileContents.has(filePath)) return fileContents.get(filePath)
      try {
        const c = fs.readFileSync(filePath, 'utf8')
        fileContents.set(filePath, c)
        return c
      } catch {
        fileContents.set(filePath, '')
        return ''
      }
    }

    for (const std of standardsIndex) {
      if (!appScopeMatches(std.app_scope, appScope)) continue

      // Sprawl warning: surface once per oversize standard. Counts *parsed*
      // rules from the standards index, not raw frontmatter entries — malformed
      // rules are dropped by validateStandard before they reach here, so a
      // file with 50 broken rules won't trip this. That's intentional: sprawl
      // measures enforcement load, and lint already reports each invalid rule
      // individually.
      const threshold = rules.getStandardsThreshold()
      if (Array.isArray(std.rules) && std.rules.length > threshold && !sprawlWarnings.find(w => w.standard_id === std.id)) {
        sprawlWarnings.push({ standard_id: std.id, rule_count: std.rules.length, threshold })
      }

      if (std.kind === 'contract') {
        // For contracts, every party whose applies_to.paths matches contributes
        // its rules. Each rule may have its own optional applies_to filter.
        const matchingParties = []
        for (const [partyName, party] of Object.entries(std.parties || {})) {
          if (!appScopeMatches(party.app_scope, appScope)) continue
          const partyPaths = (party.applies_to && party.applies_to.paths) || []
          if (partyPaths.some(p => globMatch(filePath, p))) {
            matchingParties.push({ partyName, party })
          }
        }
        if (matchingParties.length === 0) continue

        if (!content) content = readFile()

        const surviving = []
        for (const rule of std.rules) {
          // Rule-level applies_to is optional intersect filter for contracts
          if (rule.applies_to && Array.isArray(rule.applies_to.paths) && rule.applies_to.paths.length > 0) {
            if (!rule.applies_to.paths.some(p => globMatch(filePath, p))) {
              naCount.count++
              continue
            }
          }
          const result = preFilter(rule, filePath, content)
          if (result.decision === 'na' || result.decision === 'pass') { naCount.count++; continue }
          if (result.decision === 'fail') {
            // Deterministic fail — queue immediately without round-tripping the LLM.
            // Use the first matching party for the file label.
            upsertQueueEntry(queueState, std, rule, [{
              partyName: matchingParties[0].partyName,
              filePath,
              sinceCommit: headShort,
              sinceDate: headDate,
              source: fileSource,
              ...(fileAuthor && { author: fileAuthor })
            }], 'static detector matched (regex/ast-grep)')
            continue
          }
          if (isSuppressed(std.id, rule.id, filePath)) { naCount.count++; continue }
          surviving.push(rule.id)
        }
        if (surviving.length > 0) {
          requestedEvaluations.push({ file: filePath, standard_id: std.id, rule_ids: surviving, parties: matchingParties.map(p => p.partyName), source: fileSource })
        }
      } else {
        // stack-local / process / knowledge
        const matchingRules = std.rules.filter(rule => {
          const paths = (rule.applies_to && rule.applies_to.paths) || []
          return paths.some(p => globMatch(filePath, p))
        })
        if (matchingRules.length === 0) continue

        if (!content) content = readFile()

        const surviving = []
        for (const rule of matchingRules) {
          const result = preFilter(rule, filePath, content)
          if (result.decision === 'na' || result.decision === 'pass') { naCount.count++; continue }
          if (result.decision === 'fail') {
            upsertQueueEntry(queueState, std, rule, [{
              partyName: null,
              filePath,
              sinceCommit: headShort,
              sinceDate: headDate,
              source: fileSource,
              ...(fileAuthor && { author: fileAuthor })
            }], 'static detector matched (regex/ast-grep)')
            continue
          }
          if (isSuppressed(std.id, rule.id, filePath)) { naCount.count++; continue }
          surviving.push(rule.id)
        }
        if (surviving.length > 0) {
          requestedEvaluations.push({ file: filePath, standard_id: std.id, rule_ids: surviving, source: fileSource })
        }
      }
    }
  }

  // Persist any auto-flagged (deterministic fail) entries. In readonly mode
  // the live watcher gets the entries via the response payload (`_state`)
  // without writing to disk.
  if (!readonly) {
    writeQueue(queuePath, queueState.header, queueState.entries)
    // Persist ledger too — applyFileChangesToLedger may have rewritten paths or
    // dropped rows for deleted files; writing unconditionally keeps disk in sync.
    writeLedger(ledgerState)
  }

  // Build prompt for surviving triples that need LLM judgment
  let prompt = null
  if (requestedEvaluations.length > 0) {
    const ruleSpecsTable = buildRuleSpecsTable(requestedEvaluations, standardsIndex)
    const filesPrompt = buildFileContentsBlock(requestedEvaluations, fileContents)
    try {
      prompt = resolvePrompt('conform-check', {
        // Don't embed the full requested_evaluations JSON — it's already a
        // top-level structured field in the same result, so embedding it again
        // doubled it in the agent's context. The updated template references the
        // field instead; we still pass a short pointer (not the JSON) so a
        // not-yet-synced template degrades to this string rather than a literal
        // {{requested_evaluations}} placeholder.
        requested_evaluations: '(see the requested_evaluations field in this tool result — evaluate every triple there)',
        rule_specs: ruleSpecsTable,
        file_contents: filesPrompt
      })
    } catch (e) {
      prompt = `Error building prompt: ${e.message}`
    }
    if (mode === 'aspirational' && !filterGlobs && requestedEvaluations.length > 200) {
      prompt = `> NOTE: ${requestedEvaluations.length} evaluations in this sweep — if that exceeds what you can judge in one response, abort and re-run with \`path_filter\` to chunk by subtree (e.g. \`path_filter: "src/admin"\`). Submit_judgments must cover every requested triple in a single call.\n\n` + prompt
    }
  }

  // Stash pending evaluations on disk so Phase 1.5 can verify completeness.
  // Lives under sync/.conform-pending/ — treated as a transient cache, not a
  // queue file. Cleared on each new Phase 1 run. Skip in readonly mode —
  // the live watcher should never overwrite a real pending session.
  const pending = {
    mode,
    scope: scope || null,
    requested: requestedEvaluations,
    head_sha_short: headShort,
    head_date: headDate
  }
  if (!readonly) writePending(pending)

  // Optional diff prefetch — only meaningful in current-diff mode
  let diffs
  if (includeDiffs && mode !== 'aspirational' && requestedEvaluations.length > 0) {
    diffs = await prefetchDiffs(git, baseline, requestedEvaluations.map(r => r.file))
  }

  // Advance baseline now if we made it this far without errors. Conform's
  // baseline doesn't carry the same "don't roll back" subtleties as drift's
  // because we always advance to HEAD on every successful run.
  if (mode !== 'aspirational') {
    queueState.header = setBaseline(queueState.header, headSha)
    if (!readonly) writeQueue(queuePath, queueState.header, queueState.entries)
  }

  // Phase 1 prompts can blow the MCP response cap (~64-105KB observed on
  // larger sweeps). `prompt_mode: "reference"` writes the prompt to disk and
  // returns a `prompt_path` for the agent to Read instead — keeps the
  // response small while preserving the same prompt content.
  let promptPath = null
  let inlinePrompt = prompt
  if (promptMode === 'reference' && prompt && !readonly) {
    try {
      const promptsDir = path.join(KB_ROOT, 'sync', '.prompts')
      if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true })
      // Deterministic filename so re-runs overwrite rather than accumulating
      // — the prompt content hash keys it; same content → same file.
      const hash = crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 12)
      const filename = `conform-phase1-${mode}-${hash}.md`
      const fullPath = path.join(promptsDir, filename)
      fs.writeFileSync(fullPath, prompt, 'utf8')
      promptPath = path.relative(process.cwd(), fullPath)
      inlinePrompt = null
    } catch (e) {
      // If the write fails, fall back to inline so the caller still gets a
      // usable response. Surface the failure in the response so it's debuggable.
      promptPath = null
      inlinePrompt = prompt
    }
  }

  return {
    mode,
    requested_evaluations: requestedEvaluations,
    prompt: inlinePrompt,
    ...(promptPath && { prompt_path: promptPath }),
    files_checked: candidateFiles.filter(f => f.status !== 'D').length,
    n_a_count: naCount.count,
    sprawl_warnings: sprawlWarnings,
    auto_dismissed: autoDismissed.length,
    ...(configWarnings.length > 0 && { config_warnings: configWarnings }),
    ...(diffs && { _diffs: diffs }),
    // Diffs are no longer prefetched by default (they were ~half this tool's
    // payload and overlap with file_contents in the prompt). Tell the agent how
    // to get change-context on demand. Suppressed for readonly callers (live
    // watcher / CI) and aspirational mode, which never use diffs.
    ...(!diffs && !readonly && mode !== 'aspirational' && requestedEvaluations.length > 0 && {
      diffs_hint: `Diffs not prefetched. For change context on a file: \`git diff ${baseline}..HEAD -- <file>\`, or re-call kb_conform with include_diffs:true.`
    }),
    // Live watcher / CI consume the in-memory entries instead of re-reading
    // the queue file. Same shape as readQueue().entries.
    ...(readonly && { _state: { entries: queueState.entries, headSha } })
  }
}

function buildRuleSpecsTable(requested, index) {
  // Deduplicate by (standard_id, rule_id), output a compact table the agent can scan
  const seen = new Set()
  const rows = []
  for (const r of requested) {
    for (const ruleId of r.rule_ids) {
      const key = `${r.standard_id}.${ruleId}`
      if (seen.has(key)) continue
      seen.add(key)
      const lookup = getRule(index, r.standard_id, ruleId)
      if (!lookup) continue
      const sev = lookup.rule.severity || 'warn'
      const hint = (lookup.rule.detect && lookup.rule.detect.hint) || lookup.rule.description || ''
      const oneLine = String(hint).split('\n')[0].slice(0, 160)
      rows.push(`| \`${r.standard_id}.${ruleId}\` | ${sev} | ${oneLine.replace(/\|/g, '\\|')} |`)
    }
  }
  return rows.length === 0 ? '_(no rules)_' : `| Rule | Severity | Hint |\n|---|---|---|\n${rows.join('\n')}`
}

function buildFileContentsBlock(requested, contents) {
  const seen = new Set()
  const blocks = []
  let total = 0
  for (const r of requested) {
    if (seen.has(r.file)) continue
    seen.add(r.file)
    if (total >= TOTAL_CONTENT_CHAR_CAP) {
      // F13: stop embedding content past the total cap — the agent can fetch
      // these files on demand. Preserves the requested_evaluations list so
      // Phase 1.5 still validates submissions against the full set.
      blocks.push(`### ${r.file}\n\n_(content omitted — total cap reached; run: \`cat ${r.file}\` or use Read)_`)
      continue
    }
    const c = contents.get(r.file) || ''
    const remaining = TOTAL_CONTENT_CHAR_CAP - total
    const cap = Math.min(PER_FILE_CHAR_CAP, remaining)
    const truncated = c.length > cap
    const body = truncated ? c.slice(0, cap) + `\n\n// … (truncated; ${c.length - cap} more chars — run \`cat ${r.file}\` for the rest)` : c
    blocks.push(`### ${r.file}\n\n\`\`\`\n${body}\n\`\`\``)
    total += body.length
  }
  return blocks.join('\n\n')
}

// F13: char cap for the _diffs array. Line caps alone allowed a 6000-line
// budget to balloon to 100+ KB when lines were long. Once the char cap is
// hit we still emit the file entry with `dropped: ...` so the agent sees
// every file in the queue, just without the diff content.
const TOTAL_DIFF_CHAR_CAP = 40_000

async function prefetchDiffs(git, baseline, files) {
  let totalLines = 0
  let totalChars = 0
  const out = []
  for (const file of files) {
    if (totalLines >= TOTAL_LINE_CAP || totalChars >= TOTAL_DIFF_CHAR_CAP) {
      out.push({ file, cmd: `git diff ${baseline}..HEAD -- ${file}`, dropped: 'total cap reached' })
      continue
    }
    try {
      const diff = await git.diff([`${baseline}..HEAD`, '--', file])
      const lines = diff.split('\n')
      let emittedDiff
      if (lines.length > PER_FILE_LINE_CAP) {
        emittedDiff = lines.slice(0, PER_FILE_LINE_CAP).join('\n') + `\n... (${lines.length - PER_FILE_LINE_CAP} more lines truncated)`
        totalLines += PER_FILE_LINE_CAP
      } else {
        emittedDiff = diff
        totalLines += lines.length
      }
      // Per-file char cap mirrors the line cap so a single huge file can't
      // blow the total before any other file gets a chance.
      const perFileCharCap = Math.max(1, TOTAL_DIFF_CHAR_CAP - totalChars)
      if (emittedDiff.length > perFileCharCap) {
        emittedDiff = emittedDiff.slice(0, perFileCharCap) + `\n... (truncated at total-char cap; run the command above for full diff)`
      }
      out.push({ file, cmd: `git diff ${baseline}..HEAD -- ${file}`, diff: emittedDiff })
      totalChars += emittedDiff.length
    } catch (e) {
      out.push({ file, cmd: `git diff ${baseline}..HEAD -- ${file}`, error: e.message })
    }
  }
  return out
}

function appScopeMatches(scope, appScope) {
  if (!appScope) return scope === 'all' || (Array.isArray(scope) && scope.includes('all'))
  if (scope === 'all' || scope === appScope) return true
  if (Array.isArray(scope)) return scope.includes(appScope) || scope.includes('all')
  return false
}

// Walk knowledge/standards/** and report .md files whose mtime is newer than
// _index.yaml. Returned paths are relative to KB_ROOT. Empty array if the
// index is missing or up-to-date — the caller treats either as "nothing to
// warn about".
function findStaleStandards() {
  const indexPath = path.join(KB_ROOT, '_index.yaml')
  if (!fs.existsSync(indexPath)) return []
  const indexMtime = fs.statSync(indexPath).mtimeMs
  const standardsDir = path.join(KB_ROOT, 'standards')
  if (!fs.existsSync(standardsDir)) return []
  const stale = []
  const stack = [standardsDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) { stack.push(abs); continue }
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue
      try {
        if (fs.statSync(abs).mtimeMs > indexMtime) {
          stale.push(path.relative(process.cwd(), abs))
        }
      } catch { /* skip unreadable entries */ }
    }
  }
  return stale
}

// Tracked-file enumeration via git. Honors .gitignore and submodule boundaries
// for free, and avoids the N-walks-per-rule cost of the prior fs-based approach.
// --recurse-submodules pulls in submodule-internal paths so aspirational sweeps
// don't lose coverage relative to the prior fs.walk; falls back to the parent
// repo if the flag isn't supported or a submodule isn't initialized.
async function listTrackedFiles(git) {
  try {
    const out = await git.raw(['ls-files', '--recurse-submodules'])
    return out.split('\n').filter(Boolean)
  } catch {
    try {
      const out = await git.raw(['ls-files'])
      return out.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
}

// Accept string or array; auto-expand directory-shaped inputs to recursive
// globs ("src/admin" → "src/admin/**") so the most natural caller input
// matches files under that subtree instead of returning nothing.
function normalizePathFilter(input) {
  if (input == null) return null
  const arr = Array.isArray(input) ? input : [input]
  const out = []
  for (const p of arr) {
    if (typeof p !== 'string' || !p) continue
    if (/[*?]/.test(p)) { out.push(p); continue }
    out.push(p.endsWith('/') ? p + '**' : p + '/**')
  }
  return out.length ? out : null
}


// ── Phase 1.5 submit ─────────────────────────────────────────────────────────

async function submitJudgments(opts) {
  const { submit_judgments, mode = 'current' } = opts
  if (!Array.isArray(submit_judgments)) {
    return { error: 'submit_judgments must be an array of {file, standard_id, rule_id, status, reason}' }
  }
  const pending = readPending(mode)
  if (!pending) {
    const otherMode = mode === 'current' ? 'aspirational' : 'current'
    const otherPending = readPending(otherMode)
    const hint = otherPending && otherPending.requested && otherPending.requested.length > 0
      ? ` Did you mean mode: "${otherMode}"? A pending ${otherMode} session with ${otherPending.requested.length} evaluation(s) exists.`
      : ''
    return { error: `No pending evaluations found for mode "${mode}". Run kb_conform Phase 1 first.${hint}` }
  }
  if (!Array.isArray(pending.requested) || pending.requested.length === 0) {
    const otherMode = mode === 'current' ? 'aspirational' : 'current'
    const otherPending = readPending(otherMode)
    const hint = otherPending && otherPending.requested && otherPending.requested.length > 0
      ? ` Did you mean mode: "${otherMode}"? A pending ${otherMode} session with ${otherPending.requested.length} evaluation(s) exists.`
      : ''
    return { error: `Pending session for mode "${mode}" has no requested evaluations — nothing to judge.${hint}` }
  }

  // Build set of expected (file, standard_id, rule_id) triples
  const expected = new Set()
  for (const r of pending.requested) {
    for (const ruleId of r.rule_ids) {
      expected.add(`${r.file}::${r.standard_id}::${ruleId}`)
    }
  }
  const submitted = new Set()
  for (const j of submit_judgments) {
    if (!j.file || !j.standard_id || !j.rule_id || !j.status) continue
    submitted.add(`${j.file}::${j.standard_id}::${j.rule_id}`)
  }
  const gaps = []
  for (const key of expected) {
    if (!submitted.has(key)) {
      const [file, standard_id, rule_id] = key.split('::')
      gaps.push({ file, standard_id, rule_id })
    }
  }
  if (gaps.length > 0) {
    return {
      gaps,
      message: `${gaps.length} of ${expected.size} requested triple(s) missing a judgment. Fill these and resubmit.`,
      queue_advanced: false
    }
  }

  const validStatuses = new Set(['pass', 'fail', 'n/a'])
  for (const j of submit_judgments) {
    if (!validStatuses.has(j.status)) {
      return { error: `Invalid status "${j.status}" for ${j.file}.${j.standard_id}.${j.rule_id} — must be pass | fail | n/a` }
    }
  }

  // Upsert queue entries for FAIL judgments
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const queueState = readQueue(queuePath, queueHeader)
  const graph = loadGraph(KB_ROOT)
  const standardsIndex = loadStandardsIndex(graph)

  let entriesNew = 0
  let entriesReDetected = 0

  for (const j of submit_judgments) {
    if (j.status !== 'fail') continue
    const lookup = getRule(standardsIndex, j.standard_id, j.rule_id)
    if (!lookup) continue
    const { standard, rule } = lookup
    // For contracts, derive the matching party from the file path
    let partyName = null
    if (standard.kind === 'contract' && standard.parties) {
      for (const [name, p] of Object.entries(standard.parties)) {
        const paths = (p.applies_to && p.applies_to.paths) || []
        if (paths.some(g => globMatch(j.file, g))) { partyName = name; break }
      }
    }
    const outcome = upsertQueueEntry(queueState, standard, rule, [{
      partyName,
      filePath: j.file,
      sinceCommit: pending.head_sha_short,
      sinceDate: pending.head_date
    }], j.reason || '')
    if (outcome === 'new') entriesNew++
    else if (outcome === 're_detected') entriesReDetected++
  }

  writeQueue(queuePath, queueState.header, queueState.entries)
  clearPending(mode)

  return {
    queue_advanced: true,
    entries_new: entriesNew,
    entries_re_detected: entriesReDetected,
    judgments_processed: submit_judgments.length
  }
}


// ── Phase 2 resolutions ──────────────────────────────────────────────────────


async function resolveApplied(items, mode = 'current') {
  if (!Array.isArray(items)) return { error: 'applied must be an array of {queue_key}' }
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)
  const logEntries = []
  const removed = []
  const missing = []
  for (const it of items) {
    const e = findEntryByKey(state, it.queue_key)
    if (!e) { missing.push(it.queue_key); continue }
    removeEntry(state, it.queue_key)
    removed.push(it.queue_key)
    logEntries.push({ event_type: 'conformed', resolution: 'applied', queue_key: it.queue_key })
  }
  writeQueue(queuePath, state.header, state.entries)
  if (logEntries.length) appendToDriftLog(logEntries)
  return { resolved: removed.length, removed, missing }
}

async function resolveExempted(items, mode = 'current') {
  if (!Array.isArray(items)) return { error: 'exempted must be an array of {queue_key, file_paths, reason}' }
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)
  const logEntries = []
  const removed = []
  const missing = []
  const exceptionWritebacks = []

  for (const it of items) {
    if (!it.queue_key || !Array.isArray(it.file_paths) || it.file_paths.length === 0 || !it.reason) {
      return { error: `exempted item requires queue_key, file_paths[] (non-empty), reason: ${JSON.stringify(it)}` }
    }
    const e = findEntryByKey(state, it.queue_key)
    if (!e) { missing.push(it.queue_key); continue }
    exceptionWritebacks.push({
      standardId: e.standardId,
      ruleId: e.ruleId,
      paths: it.file_paths,
      reason: it.reason
    })
    removeEntry(state, it.queue_key)
    removed.push(it.queue_key)
    logEntries.push({
      event_type: 'conformed',
      resolution: 'exempted',
      queue_key: it.queue_key,
      file_paths: it.file_paths,
      reason: it.reason
    })
  }

  writeQueue(queuePath, state.header, state.entries)
  if (logEntries.length) appendToDriftLog(logEntries)

  // Apply exceptions writeback to the standards/**.md files. We do this AFTER
  // queue write so a writeback failure doesn't leave the queue half-resolved.
  // Each writeback edits the rule's `exceptions[]` array and triggers a
  // reindex via the existing kb_write hook.
  const writebackResults = []
  for (const wb of exceptionWritebacks) {
    const r = await appendExceptionToRule(wb.standardId, wb.ruleId, wb.paths, wb.reason)
    writebackResults.push({ ...wb, ...r })
  }

  return { resolved: removed.length, removed, missing, exceptions_written: writebackResults }
}

async function appendExceptionToRule(standardId, ruleId, paths, reason) {
  const graph = loadGraph(KB_ROOT)
  const fileEntry = Object.entries(graph.files || {}).find(([, e]) => e.id === standardId && e.type === 'standard')
  if (!fileEntry) return { error: `standard not found in index: ${standardId}` }
  const filePath = path.join(KB_ROOT, fileEntry[0])
  if (!fs.existsSync(filePath)) return { error: `standard file missing on disk: ${filePath}` }
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = matter(content)
  const data = parsed.data || {}
  const rules = Array.isArray(data.rules) ? data.rules : []
  const rule = rules.find(r => r && r.id === ruleId)
  if (!rule) return { error: `rule "${ruleId}" not found in standard "${standardId}"` }
  if (!Array.isArray(rule.exceptions)) rule.exceptions = []
  rule.exceptions.push({ paths, reason })

  // Validate before writing — refuse to write a malformed standard via the
  // exemption path, which would silently break lint downstream.
  const validation = validateStandard(data)
  if (!validation.valid) {
    return { error: `validation failed: ${validation.errors.join('; ')}` }
  }

  // Reconstruct the file. matter.stringify turns the data + content back into
  // frontmatter+body markdown. Body is empty for pure-frontmatter standards.
  const newContent = matter.stringify(parsed.content, data)
  fs.writeFileSync(filePath, newContent, 'utf8')

  // _index.yaml must reflect the new exceptions[] so the next Phase 1 run's
  // preFilter sees them. Without this, the graph is stale and applyExceptions
  // always returns excluded:false even though the YAML is correct.
  await runReindex({ silent: true })

  return { written: true, file_path: filePath }
}

async function resolvePromoted(items, mode = 'current') {
  if (!Array.isArray(items)) return { error: 'promoted must be an array of {queue_key, originating_files, note?}' }
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)
  const ledgerState = readLedger()
  const standardsIndex = loadStandardsIndex(loadGraph(KB_ROOT))
  const logEntries = []
  const ledgerItems = []
  const removed = []
  const missing = []
  const promotedAt = new Date().toISOString().split('T')[0]
  for (const it of items) {
    if (!it.queue_key || !Array.isArray(it.originating_files)) {
      return { error: `promoted item requires queue_key and originating_files[]: ${JSON.stringify(it)}` }
    }
    const e = findEntryByKey(state, it.queue_key)
    if (!e) { missing.push(it.queue_key); continue }

    const std = standardsIndex.find(s => s.id === e.standardId)
    const rule = std && (std.rules || []).find(r => r.id === e.ruleId)
    const ruleFingerprint = rule ? computeRuleFingerprint(rule, std) : null

    ledgerItems.push({
      queueKey: e.queueKey,
      standardId: e.standardId,
      standardKind: e.standardKind || (std && std.kind) || null,
      ruleId: e.ruleId,
      severity: e.severity,
      ruleFingerprint,
      files: it.originating_files.map(p => ({ path: p, promotedAt, ...(it.note && { note: it.note }) }))
    })

    removeEntry(state, it.queue_key)
    removed.push(it.queue_key)
    logEntries.push({
      event_type: 'conformed',
      resolution: 'promoted',
      queue_key: it.queue_key,
      originating_files: it.originating_files,
      ...(it.note && { note: it.note })
    })
  }
  addPromotions(ledgerState, ledgerItems)
  writeQueue(queuePath, state.header, state.entries)
  writeLedger(ledgerState)
  if (logEntries.length) appendToDriftLog(logEntries)
  return {
    resolved: removed.length,
    removed,
    missing,
    note: 'Promoted (file, rule) pairs are now suppressed from Phase 1 sweeps until the standard is updated (auto-close) or kb_conform is called with closed_promotion[]. Run kb_inventory to see pending_promotions; use kb_extract to draft a revised standard.'
  }
}

/**
 * Senior-reviewer close-out: the reviewer decided NOT to update the standard
 * for these files. Removes the ledger entry and writes an exception into the
 * rule so the file is permanently fine — same writeback path as `exempted`.
 *
 * Items shape: [{ queue_key, file_paths, reason }]. Mode is intentionally
 * ignored because the ledger is shared across modes (the same (file, rule)
 * pair shouldn't be suppressed in one mode and active in another).
 */
async function resolveClosedPromotion(items) {
  if (!Array.isArray(items)) return { error: 'closed_promotion must be an array of {queue_key, file_paths, reason}' }
  const ledgerState = readLedger()
  const logEntries = []
  const removed = []
  const missing = []
  const exceptionWritebacks = []

  for (const it of items) {
    if (!it.queue_key || !Array.isArray(it.file_paths) || it.file_paths.length === 0 || !it.reason) {
      return { error: `closed_promotion item requires queue_key, file_paths[] (non-empty), reason: ${JSON.stringify(it)}` }
    }
    const entry = ledgerState.entries.find(e => e.queueKey === it.queue_key)
    if (!entry) { missing.push(it.queue_key); continue }
    exceptionWritebacks.push({
      standardId: entry.standardId,
      ruleId: entry.ruleId,
      paths: it.file_paths,
      reason: it.reason
    })
    removed.push(it.queue_key)
    logEntries.push({
      event_type: 'closed-promotion',
      queue_key: it.queue_key,
      file_paths: it.file_paths,
      reason: it.reason
    })
  }

  removePromotions(ledgerState, items.map(it => ({ queueKey: it.queue_key, file_paths: it.file_paths })))
  writeLedger(ledgerState)
  if (logEntries.length) appendToDriftLog(logEntries)

  // Writeback exceptions AFTER ledger persistence so a failed writeback doesn't
  // leave the ledger half-updated. Mirrors the order in resolveExempted.
  const writebackResults = []
  for (const wb of exceptionWritebacks) {
    const r = await appendExceptionToRule(wb.standardId, wb.ruleId, wb.paths, wb.reason)
    writebackResults.push({ ...wb, ...r })
  }

  return { resolved: removed.length, removed, missing, exceptions_written: writebackResults }
}

async function resolveDismissed(items, mode = 'current') {
  if (!Array.isArray(items)) return { error: 'dismissed must be an array of {queue_key, reason}' }
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)
  const logEntries = []
  const removed = []
  const missing = []
  for (const it of items) {
    if (!it.queue_key || !it.reason) {
      return { error: `dismissed item requires queue_key and reason: ${JSON.stringify(it)}` }
    }
    const e = findEntryByKey(state, it.queue_key)
    if (!e) { missing.push(it.queue_key); continue }
    removeEntry(state, it.queue_key)
    removed.push(it.queue_key)
    logEntries.push({ event_type: 'dismissed-conform', queue_key: it.queue_key, reason: it.reason })
  }
  writeQueue(queuePath, state.header, state.entries)
  if (logEntries.length) appendToDriftLog(logEntries)
  return { resolved: removed.length, removed, missing }
}

// Acknowledge — non-resolving annotation. Stamps `**Acknowledged**: @author`
// on the entry block but leaves the entry in the queue. CI still treats acked
// entries as pending; a later resolving verdict overrides.
async function resolveAcknowledge(items, { mode = 'current', readonly = false } = {}) {
  if (!Array.isArray(items)) return { error: 'acknowledge must be an array of {queue_key, reason}' }
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)

  const git = simpleGit(process.cwd())
  let ackBy = null
  let ackCommit = null
  let ackDate = new Date().toISOString().split('T')[0]
  try {
    const email = (await git.raw(['config', 'user.email'])).trim()
    ackBy = authorHandleFromEmail(email)
  } catch { /* fall through to per-item error */ }
  try {
    const log = await git.log({ maxCount: 1 })
    if (log.latest) {
      ackCommit = log.latest.hash.slice(0, 7)
      ackDate = log.latest.date.split('T')[0]
    }
  } catch { /* fall through to per-item error */ }

  const acknowledged = []
  const missing = []
  const logEntries = []
  for (const it of items) {
    if (!it || !it.queue_key) {
      return { error: `acknowledge item requires queue_key: ${JSON.stringify(it)}` }
    }
    const reason = typeof it.reason === 'string' ? it.reason.trim() : ''
    if (!reason) {
      return { error: `acknowledge item requires a non-empty reason: ${JSON.stringify(it)}` }
    }
    const e = findEntryByKey(state, it.queue_key)
    if (!e) { missing.push(it.queue_key); continue }
    if (!ackBy || !ackCommit) {
      return { error: 'cannot resolve author / HEAD for acknowledgement (git config user.email + a commit on HEAD required)' }
    }
    e.acknowledgement = { by: ackBy, atCommit: ackCommit, atDate: ackDate, reason }
    acknowledged.push(it.queue_key)
    logEntries.push({ event_type: 'acknowledged', queue_key: it.queue_key, reason, by: ackBy, at_commit: ackCommit })
  }
  if (!readonly) {
    writeQueue(queuePath, state.header, state.entries)
    if (logEntries.length) appendToDriftLog(logEntries)
  }
  return { acknowledged: acknowledged.length, queue_keys: acknowledged, missing }
}

// ── Admin helpers ────────────────────────────────────────────────────────────

async function forceBaseline(opts) {
  const { force_baseline, purge, mode = 'current' } = opts
  const queuePath = mode === 'aspirational' ? STANDARDS_BACKLOG_PATH : STANDARDS_DRIFT_PATH
  const queueHeader = mode === 'aspirational' ? STANDARDS_BACKLOG_HEADER : STANDARDS_DRIFT_HEADER
  const state = readQueue(queuePath, queueHeader)
  let sha = force_baseline
  if (sha === 'HEAD') {
    try {
      const git = simpleGit(process.cwd())
      const log = await git.log({ maxCount: 1 })
      sha = log.latest ? log.latest.hash : null
    } catch { sha = null }
  }
  if (sha) state.header = setBaseline(state.header, sha)
  const entries = purge ? [] : state.entries
  writeQueue(queuePath, state.header, entries)
  return {
    baseline: sha,
    purged: !!purge,
    message: purge
      ? `Queue cleared; baseline set to ${sha ? sha.slice(0, 7) : '(unchanged)'}.`
      : `Baseline set to ${sha ? sha.slice(0, 7) : '(unchanged)'}; entries preserved.`
  }
}

// ── Tool entry ───────────────────────────────────────────────────────────────

async function runTool(args = {}) {
  const {
    since,
    mode = 'current',
    scope,
    path_filter,
    submit_judgments,
    applied,
    exempted,
    promoted,
    dismissed,
    closed_promotion,
    acknowledge,
    force_baseline,
    purge,
    include_diffs = false,
    readonly = false,
    include_working_tree = false,
    prompt_mode = 'inline'
  } = args

  if (force_baseline || purge) return forceBaseline({ force_baseline, purge, mode })
  if (Array.isArray(submit_judgments)) return submitJudgments({ submit_judgments, mode })
  if (Array.isArray(acknowledge)) return resolveAcknowledge(acknowledge, { mode, readonly })

  const resolutionArgs = { applied, exempted, promoted, dismissed, closed_promotion }
  const provided = Object.entries(resolutionArgs).filter(([, v]) => Array.isArray(v))
  if (provided.length > 1) {
    const keysByResolution = {}
    for (const [name, arr] of provided) {
      keysByResolution[name] = arr.map(it => it && it.queue_key).filter(Boolean)
    }
    const seen = new Map()
    const conflicts = []
    for (const [name, keys] of Object.entries(keysByResolution)) {
      for (const key of keys) {
        if (seen.has(key)) {
          conflicts.push({ queue_key: key, resolutions: [seen.get(key), name] })
        } else {
          seen.set(key, name)
        }
      }
    }
    if (conflicts.length > 0) {
      return {
        error: `Conflicting Phase 2 resolutions on the same queue_key: ${conflicts.map(c => `${c.queue_key} → [${c.resolutions.join(', ')}]`).join('; ')}. Each queue_key may appear in only one resolution array per call.`,
        conflicts
      }
    }
    return {
      error: `Multiple Phase 2 resolution arrays provided (${provided.map(([n]) => n).join(', ')}). Submit one resolution type per call to keep the audit log unambiguous.`,
      provided: provided.map(([n]) => n)
    }
  }

  if (Array.isArray(applied)) return resolveApplied(applied, mode)
  if (Array.isArray(exempted)) return resolveExempted(exempted, mode)
  if (Array.isArray(promoted)) return resolvePromoted(promoted, mode)
  if (Array.isArray(dismissed)) return resolveDismissed(dismissed, mode)
  if (Array.isArray(closed_promotion)) return resolveClosedPromotion(closed_promotion)
  return detect({ since, mode, scope, path_filter, includeDiffs: include_diffs, readonly, includeWorkingTree: include_working_tree, promptMode: prompt_mode })
}

module.exports = {
  runTool,
  // Exposed for tests / direct callers
  STANDARDS_DRIFT_PATH,
  STANDARDS_BACKLOG_PATH,
  parseBaseline,
  setBaseline,
  readQueue,
  writeQueue,
  upsertQueueEntry,
  definition: {
    name: 'kb_conform',
    description: 'Three-phase non-functional conformance check. Phase 1 (no resolution args): MCP runs cheap pre-filters and returns requested_evaluations + a prompt for the agent to evaluate. The prompt embeds the rule specs and file contents needed to judge; git diffs are NOT prefetched by default (pass include_diffs:true for the diff prefetch, or use the diffs_hint command on demand). Phase 1.5 (submit_judgments): agent submits per-rule judgments — must cover every requested triple in a single call (partial submissions return gaps[] and are not persisted across calls). Phase 2 (applied/exempted/promoted/dismissed): close queue entries. Promoted (file, rule) pairs are suppressed from re-detection until the standard is updated (auto-close on rule fingerprint change) or a senior reviewer calls closed_promotion. Aspirational mode (mode: aspirational, scope: <standard-file>): retroactive sweep into a separate backlog queue; pass path_filter to chunk a large sweep by subtree.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Override baseline SHA (default: read from queue header)' },
        mode: { type: 'string', enum: ['current', 'aspirational'], description: 'Detection mode (default: current)' },
        scope: { type: 'string', description: 'Glob filter on Phase 1 file set (current mode); or standard file path in aspirational mode' },
        path_filter: { type: ['string', 'array'], items: { type: 'string' }, description: 'Aspirational mode only: chunk a large sweep by intersecting with one or more path globs (e.g. "src/admin" or ["src/admin", "src/customer"]). Bare directory inputs auto-expand to "<dir>/**". Errors if used in current mode, or if the intersection with the standard\'s applies_to.paths is empty.' },
        submit_judgments: {
          type: 'array',
          description: 'Phase 1.5: per-(file, standard, rule) judgments. Must include every triple from the pending session in one call — partial submissions return gaps[] and are not persisted across calls.',
          items: {
            type: 'object',
            required: ['file', 'standard_id', 'rule_id', 'status'],
            properties: {
              file: { type: 'string' },
              standard_id: { type: 'string' },
              rule_id: { type: 'string' },
              status: { type: 'string', enum: ['pass', 'fail', 'n/a'] },
              reason: { type: 'string' }
            }
          }
        },
        applied: { type: 'array', description: 'Phase 2: code was fixed', items: { type: 'object', required: ['queue_key'], properties: { queue_key: { type: 'string' } } } },
        exempted: { type: 'array', description: 'Phase 2: justified exception, written into rule.exceptions[]', items: { type: 'object', required: ['queue_key', 'file_paths', 'reason'], properties: { queue_key: { type: 'string' }, file_paths: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } } } },
        promoted: { type: 'array', description: 'Phase 2: standard should change (logged; no automatic edit)', items: { type: 'object', required: ['queue_key', 'originating_files'], properties: { queue_key: { type: 'string' }, originating_files: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } } },
        dismissed: { type: 'array', description: 'Phase 2: false positive', items: { type: 'object', required: ['queue_key', 'reason'], properties: { queue_key: { type: 'string' }, reason: { type: 'string' } } } },
        closed_promotion: { type: 'array', description: 'Senior reviewer close-out: removes a previously-promoted (file, rule) from the suppression ledger AND writes an exception into the rule (so the file is permanently fine). Use when reviewer decided NOT to update the standard. If the reviewer DID update the standard, no call is needed — the next sweep auto-closes via fingerprint change.', items: { type: 'object', required: ['queue_key', 'file_paths', 'reason'], properties: { queue_key: { type: 'string' }, file_paths: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } } } },
        acknowledge: { type: 'array', description: 'Non-resolving annotation: stamps the entry with `**Acknowledged**: @author at SHA — "reason"` and leaves it in the queue. CI still treats acked entries as pending; a later resolving verdict overrides.', items: { type: 'object', required: ['queue_key', 'reason'], properties: { queue_key: { type: 'string' }, reason: { type: 'string' } } } },
        force_baseline: { type: 'string', description: 'Admin: reset baseline to a SHA or "HEAD"' },
        purge: { type: 'boolean', description: 'Admin: with force_baseline, also clear all entries' },
        include_diffs: { type: 'boolean', description: 'Phase 1: pre-fetch git diffs into result._diffs (default: false). The prompt already includes file_contents to judge against; set true only when you specifically need the diff (what changed since baseline) rather than current file state.' },
        readonly: { type: 'boolean', description: 'Compute results in memory but skip every fs write. Used by the live watcher in the extension and the soft-mode CI check.' },
        include_working_tree: { type: 'boolean', description: 'Phase 1: also evaluate uncommitted/untracked files matching the standard\'s applies_to (default: false). In current mode this unions working-tree changes with the committed diff. In aspirational mode it unions git-tracked files with untracked-non-ignored files. Useful when you want a verdict on a file before committing.' },
        prompt_mode: { type: 'string', enum: ['inline', 'reference'], description: 'Phase 1 only. "inline" (default): the agent-facing prompt is included in the response — can exceed the MCP response cap on sweeps with many evaluations. "reference": the prompt is written to knowledge/sync/.prompts/conform-phase1-<mode>-<hash>.md and a `prompt_path` field is returned instead; the agent reads the file directly. Use this when the inline response is being truncated.' }
      }
    }
  }
}
