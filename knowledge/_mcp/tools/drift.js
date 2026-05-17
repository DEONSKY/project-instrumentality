const fs = require('fs')
const path = require('path')
const simpleGit = require('simple-git')
const { loadRules } = require('../lib/rules')
const { matchAllPatterns, resolveKbTarget, expandGlob } = require('../lib/patterns')
const { loadGraph, getDependents } = require('../lib/graph')
const { detectSubmodules: detectSubmodulesHelper, resolveSubmoduleRefs } = require('../lib/submodule-sweep')
const {
  parseNameStatus: sharedParseNameStatus,
  authorHandleFromEmail,
  baselineReachable,
  getLocalGitUserHandle
} = require('../lib/git-ops')
const { KB_ROOT } = require('../lib/kb-constants')

// Submodules of drift.js — keep wire contracts (CODE_DRIFT_HEADER, ...) intact.
const { reverseMapKbTarget, matchesKbTargetPattern, isKbContentFile } = require('./drift/kb-match')
const {
  parseBaseline,
  setBaseline,
  isAncestor,
  pickDescendantSha,
  computeAdvancedBaseline,
  advanceQueueBaseline
} = require('./drift/baseline')
const {
  CODE_DRIFT_PATH,
  KB_DRIFT_PATH,
  DRIFT_LOG_DIR,
  CODE_DRIFT_HEADER,
  KB_DRIFT_HEADER,
  DRIFT_LOG_HEADER,
  parseAcknowledgement,
  formatAcknowledgement,
  extractQueueBody,
  readCodeDriftEntries,
  writeCodeDriftEntries,
  upsertCodeDriftEntry,
  readKbDriftEntries,
  writeKbDriftEntries,
  upsertKbDriftEntry,
  handleCodeRename,
  handleKbRename,
  ensureHeader,
  stampAndRecomputeFingerprints,
  appendToDriftLog,
  dedupBaselines
} = require('./drift/queue')

// drift uses similarity scores on rename/copy entries
const parseNameStatus = (output) => sharedParseNameStatus(output, { includeSimilarity: true })

// Budget for pre-fetched diffs returned via result._diffs. Prevents a single
// large drift queue from blowing the agent's context. When caps are hit, the
// diff content is dropped but the reproducible `cmd` is always preserved so
// the agent can fetch the full diff manually.
const PER_FILE_LINE_CAP = 400
const PER_ENTRY_LINE_CAP = 1500
const TOTAL_LINE_CAP = 6000
const COMMIT_CAP = 10

// v2 caps for the code_areas intersection on kb-drift entries. Bounded so a
// single wide pattern (e.g. `ms-linestop-admin-be/**`) can't starve the rest
// of the payload. When a cap is hit, the reproducible grep_cmd is preserved
// so the agent can rerun the scan manually.
const IDENTIFIER_CAP = 20
const FILES_PER_AREA_CAP = 25
const HITS_PER_AREA_CAP = 10
const HITS_PER_FILE_CAP = 3
const GREP_BUDGET_TOTAL = 200
const GREP_TIMEOUT_MS = 3000
const SNIPPET_MAX_CHARS = 120

/**
 * kb_drift — Bidirectional drift detection.
 *
 * Phase 1 (no resolution params):
 *   code→kb: code files changed → upsert entries in sync/code-drift.md
 *            keyed by KB target, tracks all code files + since-commit per file
 *   kb→code: KB files changed → upsert entries in sync/kb-drift.md
 *            keyed by KB file, tracks since-commit
 *   Each queue file carries its own baseline SHA in its header; both advance
 *   to HEAD on every successful run, regardless of whether anything drained.
 *
 * Phase 2 resolutions:
 *   summaries:    [{ kb_target, summary }]  PM approved — KB updated
 *   reverted:     [{ code_file }]            PM rejected — code file reverted
 *   kb_confirmed: [{ kb_file }]              developer confirmed code matches
 *   dismiss:      [{ queue, queue_key, reason }]  close a structurally-broken
 *                 entry (ghost kb_target that will never exist as a KB file).
 *                 Logged as DISMISSED in the audit trail — kept out of the
 *                 RESOLVED stream so dismissals stay visible as a distinct signal.
 *
 * Admin escape hatch:
 *   force_baseline: 'HEAD'|<sha> — reset both queue baselines
 *   purge:         boolean        — with force_baseline, also clear all entries
 *
 * Merge-housekeeping (called by the post-merge git hook):
 *   dedup_baselines: boolean — collapse duplicate baseline lines in queue
 *     files (introduced by `merge=union` when two branches each wrote their
 *     own baseline). Keeps the descendant SHA; warns on diverged histories.
 *
 * Live / readonly mode:
 *   readonly: true — compute drift in memory but skip every fs write
 *     (queue files, drift-log, baseline advance). Used by the live watcher
 *     in the VSCode extension and the soft-mode CI check. The result shape
 *     stays the same, including `_diffs` when `include_diffs` is set, so the
 *     caller can render entries straight from the response without touching
 *     the persisted queue files.
 *
 * Acknowledge (Phase 2 — non-resolving annotation):
 *   acknowledge: [{ queue: 'code-drift'|'kb-drift', queue_key, reason }]
 *     Annotates an entry as author-vetted ("real change, doesn't affect KB"),
 *     stamps an `**Acknowledged**: @author at SHA — "reason"` marker on the
 *     entry block, and logs a `drift-acknowledged` event. The entry stays in
 *     the queue; a subsequent resolving verdict still overrides.
 */
async function runTool({ since = 'last-sync', summaries, reverted, kb_confirmed, dismiss, acknowledge, remote, force_baseline, purge, dedup_baselines, include_diffs = true, readonly = false } = {}) {
  if (dedup_baselines) return dedupBaselines()
  if (force_baseline || purge) return resetBaselines({ force_baseline, purge, readonly })
  if (summaries && Array.isArray(summaries)) return resolveWithSummaries(summaries, { readonly })
  if (reverted && Array.isArray(reverted)) return resolveReverted(reverted, { readonly })
  if (kb_confirmed && Array.isArray(kb_confirmed)) return resolveKbConfirmed(kb_confirmed, { readonly })
  if (dismiss && Array.isArray(dismiss)) return resolveDismissed(dismiss, { readonly })
  if (acknowledge && Array.isArray(acknowledge)) return resolveAcknowledge(acknowledge, { readonly })
  return detectDrift(since, remote, { includeDiffs: include_diffs, readonly })
}

// ── Phase 1: detect drift ─────────────────────────────────────────────────────

async function detectDrift(since, remote, { includeDiffs = true, readonly = false } = {}) {
  const mainGit = simpleGit(process.cwd())
  const rules = loadRules(KB_ROOT)

  // Parse both queue files once up front; all mutations happen in memory.
  const codeState = readCodeDriftEntries()
  const kbState = readKbDriftEntries()

  // Re-bootstrap events collected here so they can be surfaced in the API
  // response (`re_bootstrapped[]`), not just stderr + drift-log/.
  const rebootstrapEvents = []

  // Resolve per-queue baselines. Explicit `since` overrides both; otherwise
  // read from the header, falling back to resolveLastSyncRef for bootstrap.
  let bCode, bKb
  if (since !== 'last-sync') {
    bCode = since
    bKb = since
  } else {
    bCode = parseBaseline(codeState.header)
    bKb = parseBaseline(kbState.header)

    // Stored baselines can become unreachable — squash-merges on the remote
    // or a checkout that never fetched the originating branch. Falling through
    // to getChangedFiles's empty-tree diff surfaces every file as "changed";
    // re-bootstrap instead and warn loudly.
    if (bCode && !(await baselineReachable(mainGit, bCode))) {
      const old = bCode
      const meta = {}
      bCode = await resolveLastSyncRef(mainGit, remote, meta)
      process.stderr.write(`[kb-drift] warning: code-drift baseline ${old} unreachable in parent repo (likely squash-merged or never fetched); re-bootstrapping. New baseline: ${bCode || '(none — skipping)'}\n`)
      if (!readonly) appendToDriftLog([{ event_type: 're-bootstrap', repo: 'parent', queue: 'code-drift', old_sha: old, new_sha: bCode, resolver_used: meta.via }])
      rebootstrapEvents.push({ repo: 'parent', queue: 'code-drift', old_sha: old, new_sha: bCode, resolver_used: meta.via })
    }
    if (bKb && !(await baselineReachable(mainGit, bKb))) {
      const old = bKb
      const meta = {}
      bKb = await resolveLastSyncRef(mainGit, remote, meta)
      process.stderr.write(`[kb-drift] warning: kb-drift baseline ${old} unreachable in parent repo (likely squash-merged or never fetched); re-bootstrapping. New baseline: ${bKb || '(none — skipping)'}\n`)
      if (!readonly) appendToDriftLog([{ event_type: 're-bootstrap', repo: 'parent', queue: 'kb-drift', old_sha: old, new_sha: bKb, resolver_used: meta.via }])
      rebootstrapEvents.push({ repo: 'parent', queue: 'kb-drift', old_sha: old, new_sha: bKb, resolver_used: meta.via })
    }

    if (!bCode) bCode = await resolveLastSyncRef(mainGit, remote)
    if (!bKb) bKb = await resolveLastSyncRef(mainGit, remote)
  }

  // HEAD info — used for sinceCommit display, submodule anchoring, and the
  // post-run baseline advance.
  let headCommit = 'unknown'
  let headDate = new Date().toISOString().split('T')[0]
  let headSha = null
  try {
    const log = await mainGit.log({ maxCount: 1 })
    if (log.latest) {
      headCommit = log.latest.hash.slice(0, 7)
      headDate = log.latest.date.split('T')[0]
      headSha = log.latest.hash
    }
  } catch { /* non-fatal */ }

  const patterns = rules.getCodePathPatterns()
  let codeEntriesNew = 0
  let codeEntriesReDetected = 0
  let kbEntriesNew = 0
  let kbEntriesReDetected = 0
  const stalePatterns = []

  // ── code→KB pass (B_code, main + submodules, non-KB files only) ───────────
  const submodules = await detectSubmodules()
  // In readonly mode (live overlay for the extensions) we union committed
  // changes with the author's working tree so the sidebar previews drift
  // before commit. The write path keeps `baseline..HEAD` semantics so the
  // published queue stays deterministic.
  const includeWorkingTree = !!readonly
  const localUser = includeWorkingTree ? await getLocalGitUserHandle(mainGit) : null
  let codeChanges = []
  let mainCodeIndex = new Map()
  if (bCode === null) {
    process.stderr.write('[kb-drift] warning: no sync baseline for code-drift — skipping code→KB detection\n')
  } else {
    try {
      const mainFiles = await getChangedFiles(mainGit, bCode, 'HEAD', { includeWorkingTree })
      mainCodeIndex = await buildCommitIndex(mainGit, bCode)
      codeChanges.push(...mainFiles.map(f => ({
        file: f.path, oldFile: f.oldPath || null, status: f.status,
        indexPath: f.path, indexOldPath: f.oldPath || null,
        fallbackCommit: headCommit, fallbackDate: headDate,
        index: mainCodeIndex, isShared: false,
        source: f._source || 'committed'
      })))
    } catch (e) {
      return { code_entries: 0, kb_entries: 0, error: e.message }
    }

    for (const sub of submodules) {
      try {
        const refs = await resolveSubmoduleRefs({
          mainGit, sub, baseline: bCode, headSha, remote,
          toolName: 'kb-drift',
          helpers: { baselineReachable, resolveLastSyncRef, getSubmodulePointerAt }
        })

        if (refs.rebootstrapEvent) {
          if (!readonly) appendToDriftLog([{ event_type: 're-bootstrap', queue: 'code-drift', ...refs.rebootstrapEvent }])
          rebootstrapEvents.push({ queue: 'code-drift', ...refs.rebootstrapEvent })
        }

        if (refs.subRef === null) {
          process.stderr.write(`[kb-drift] warning: no sync baseline for submodule ${sub.path} — skipping\n`)
          continue
        }
        if (!refs.subHeadRef) continue
        // Pointer hasn't moved → parent doesn't see any committed submodule
        // drift. In readonly mode keep going so we can still surface the
        // author's uncommitted edits inside the submodule.
        if (!refs.pointerMoved && !includeWorkingTree) continue

        const subFiles = await getChangedFiles(refs.subGit, refs.subRef, refs.subHeadRef, { includeWorkingTree })
        const subIndex = await buildCommitIndex(refs.subGit, refs.subRef, refs.subHeadRef)
        codeChanges.push(...subFiles.map(f => ({
          file: `${sub.path}/${f.path}`,
          oldFile: f.oldPath ? `${sub.path}/${f.oldPath}` : null,
          status: f.status,
          // Index keys are submodule-relative (what `git log` inside the submodule
          // reports) — keep the unprefixed path for lookup, prefix only for display.
          indexPath: f.path,
          indexOldPath: f.oldPath || null,
          fallbackCommit: refs.headInfo.commit,
          fallbackDate: refs.headInfo.date,
          index: subIndex,
          isShared: sub.isShared,
          source: f._source || 'committed'
        })))
      } catch { /* submodule may not have enough history */ }
    }
  }

  for (const entry of codeChanges) {
    const { file, oldFile, status, indexPath, indexOldPath, fallbackCommit, fallbackDate, index, isShared, source } = entry
    // code→KB only cares about non-KB new paths. KB files belong to the kb pass.
    if (isKbContentFile(file)) continue
    if (status === 'D') continue

    const range = resolveCommitRange(index, indexPath, indexOldPath)
        || { sinceCommit: fallbackCommit, sinceDate: fallbackDate, latestCommit: null, latestDate: null, author: null }
    let { sinceCommit, sinceDate, latestCommit, latestDate, author } = range

    // Working-tree entries: collapse Latest (the UI renders "working tree")
    // and credit the local user when no committed history covers this file.
    if (source === 'working-tree') {
      latestCommit = null
      latestDate = null
      if (!author && localUser) author = localUser
    }

    if (status === 'R' && oldFile) {
      const result = handleCodeRename(codeState, file, oldFile, sinceCommit, sinceDate, latestCommit, latestDate, isShared, patterns, author, { source })
      codeEntriesNew += result.outcomes.new
      codeEntriesReDetected += result.outcomes.re_detected
      if (result.stalePattern) stalePatterns.push(result.stalePattern)
      continue
    }

    // Fan out: a code file may match multiple patterns, each producing its own
    // kb_target. Symmetric with the kb→code direction (reverseMapKbTarget already
    // returns all matches). Dedup via Set when two patterns resolve to the same
    // kb_target (e.g. both use the "features/{name}.md" template with different
    // glob scopes).
    const matches = matchAllPatterns(file, patterns)
    const kbTargets = new Set(matches.map(p => resolveKbTarget(p, file)))
    for (const kbTarget of kbTargets) {
      const outcome = upsertCodeDriftEntry(codeState, kbTarget, file, sinceCommit, sinceDate, latestCommit, latestDate, isShared, undefined, author, { source })
      if (outcome === 'new') codeEntriesNew++
      else if (outcome === 're_detected') codeEntriesReDetected++
    }
  }

  // ── kb→code pass (B_kb, main repo only, KB files only) ────────────────────
  let kbChanges = []
  let mainKbIndex = new Map()
  if (bKb === null) {
    process.stderr.write('[kb-drift] warning: no sync baseline for kb-drift — skipping kb→code detection\n')
  } else {
    try {
      const mainFiles = await getChangedFiles(mainGit, bKb, 'HEAD', { includeWorkingTree })
      // Reuse mainCodeIndex when bKb === bCode to avoid a duplicate git log.
      mainKbIndex = (bKb === bCode && mainCodeIndex.size > 0)
        ? mainCodeIndex
        : await buildCommitIndex(mainGit, bKb)
      kbChanges.push(...mainFiles.map(f => ({
        file: f.path, oldFile: f.oldPath || null, status: f.status,
        indexPath: f.path, indexOldPath: f.oldPath || null,
        fallbackCommit: headCommit, fallbackDate: headDate,
        index: mainKbIndex,
        source: f._source || 'committed'
      })))
    } catch { /* non-fatal — kb pass is main-only and its failure shouldn't abort */ }
  }

  for (const entry of kbChanges) {
    const { file, oldFile, status, indexPath, indexOldPath, fallbackCommit, fallbackDate, index, source } = entry
    if (!isKbContentFile(file)) continue
    if (status === 'D') continue

    const range = resolveCommitRange(index, indexPath, indexOldPath)
        || { sinceCommit: fallbackCommit, sinceDate: fallbackDate, latestCommit: null, latestDate: null, author: null }
    let { sinceCommit, sinceDate, latestCommit, latestDate, author } = range

    if (source === 'working-tree') {
      latestCommit = null
      latestDate = null
      if (!author && localUser) author = localUser
    }

    if (status === 'R' && oldFile && isKbContentFile(oldFile)) {
      const result = handleKbRename(kbState, file, oldFile, sinceCommit, sinceDate, latestCommit, latestDate, patterns, author, { source })
      if (result.outcome === 'new') kbEntriesNew++
      else if (result.outcome === 're_detected') kbEntriesReDetected++
      continue
    }

    // Normal add/modify — or cross-boundary rename where old was non-KB:
    // treat the new KB path as a fresh add (matches the prior behavior).
    const relative = file.replace(/^knowledge\//, '')
    const codePaths = reverseMapKbTarget(relative, patterns)
    const outcome = upsertKbDriftEntry(kbState, relative, codePaths, sinceCommit, sinceDate, latestCommit, latestDate, author, { source })
    if (outcome === 'new') kbEntriesNew++
    else if (outcome === 're_detected') kbEntriesReDetected++
  }

  // Advance both baselines to HEAD (always — cleanliness lives in the queue,
  // not in the baseline) and write both files once. In readonly mode we still
  // advance the in-memory header so the returned state mirrors what *would*
  // have been written, but skip the fs writes — the live watcher and CI check
  // both consume the returned `_state` instead of re-reading from disk.
  if (headSha) {
    codeState.header = setBaseline(codeState.header, headSha)
    kbState.header = setBaseline(kbState.header, headSha)
  }

  // P3: stamp fingerprints on entries without one (lazy migration), and
  // recompute fingerprints for entries with one. Mismatches → auto-close +
  // emit AUTO-CLOSED-PATTERN-CHANGED. Mirrors the standards-side fingerprint
  // auto-close on rule changes.
  const autoCloseRecords = []
  stampAndRecomputeFingerprints(codeState, patterns, 'code-drift', autoCloseRecords, e => e.kbTarget)
  stampAndRecomputeFingerprints(kbState, patterns, 'kb-drift', autoCloseRecords, e => e.kbFile)
  if (autoCloseRecords.length > 0 && !readonly) {
    appendToDriftLog(autoCloseRecords)
  }

  if (!readonly) {
    writeCodeDriftEntries(codeState.header, codeState.entries)
    writeKbDriftEntries(kbState.header, kbState.entries)
  }

  const codeEntriesWritten = codeEntriesNew + codeEntriesReDetected
  const kbEntriesWritten = kbEntriesNew + kbEntriesReDetected
  // Also count pre-existing open entries that were not touched in this run
  const codeEntriesPending = codeState.entries.length
  const kbEntriesPending = kbState.entries.length
  const noDrift = codeEntriesWritten === 0 && kbEntriesWritten === 0
               && codeEntriesPending === 0 && kbEntriesPending === 0
  const ownedSubs = submodules.filter(s => !s.isShared).map(s => s.path)
  const sharedSubs = submodules.filter(s => s.isShared).map(s => s.path)
  const subParts = []
  if (ownedSubs.length > 0) subParts.push(`owned: ${ownedSubs.join(', ')}`)
  if (sharedSubs.length > 0) subParts.push(`shared: ${sharedSubs.join(', ')}`)
  const subInfo = subParts.length > 0 ? ` (submodules — ${subParts.join('; ')})` : ''

  const reDetectedTotal = codeEntriesReDetected + kbEntriesReDetected
  const reDetectedNote = reDetectedTotal > 0 ? ` (${reDetectedTotal} re-detected)` : ''

  // Build message: show pending queue totals (new + pre-existing) so the agent
  // always sees the true open-entry count even when no new drift was detected.
  const totalCodeOpen = Math.max(codeEntriesWritten, codeEntriesPending)
  const totalKbOpen = Math.max(kbEntriesWritten, kbEntriesPending)
  const pendingNote = (codeEntriesWritten === 0 && kbEntriesWritten === 0 && !noDrift)
    ? ' (no new drift — pre-existing open entries remain)'
    : reDetectedNote

  const result = {
    code_entries: codeEntriesWritten,
    code_entries_new: codeEntriesNew,
    code_entries_re_detected: codeEntriesReDetected,
    code_entries_pending: codeEntriesPending,
    kb_entries: kbEntriesWritten,
    kb_entries_new: kbEntriesNew,
    kb_entries_re_detected: kbEntriesReDetected,
    kb_entries_pending: kbEntriesPending,
    submodules_owned: ownedSubs,
    submodules_shared: sharedSubs,
    ...(stalePatterns.length > 0 && { stale_patterns: stalePatterns }),
    ...(rebootstrapEvents.length > 0 && { re_bootstrapped: rebootstrapEvents }),
    message: noDrift
      ? `No drift detected.${subInfo}`
      : `${totalCodeOpen} code→KB entry(s) in sync/code-drift.md, ${totalKbOpen} KB→code entry(s) in sync/kb-drift.md${pendingNote}.${subInfo}`
  }

  // Pattern audit: mechanical findings about code_path_patterns vs current
  // filesystem state. Runs inline on every drift call (~30ms budget). Skipped
  // on quiet noDrift runs except readonly mode (live watcher needs the data).
  if (!noDrift || readonly) {
    try {
      const { auditPatterns, collectSourceFiles, collectKbContentFiles, collectSubmodulePaths } = require('../lib/pattern-audit')
      const sourceFiles = collectSourceFiles(process.cwd())
      const kbFiles = collectKbContentFiles(KB_ROOT)
      const submodulePaths = collectSubmodulePaths(process.cwd())
      const audit = auditPatterns({ patterns, sourceFiles, kbFiles, submodulePaths })
      if (audit.findings.length > 0) result.pattern_audit = audit
    } catch (e) {
      process.stderr.write(`[kb-drift] pattern audit failed: ${e.message}\n`)
    }
  }

  const hasUnmappedKbEntries = (kbEntriesWritten > 0 || kbEntriesPending > 0) && (() => {
    try {
      const raw = fs.readFileSync(KB_DRIFT_PATH, 'utf8')
      return raw.includes('no mapped code paths')
    } catch { return false }
  })()

  if (!noDrift) {
    let instruction = 'For each entry in `_diffs.code` and `_diffs.kb`:\n'
      + '1. Read `diff` directly. If it is null, truncated, or has `error`, run the `cmd`.\n'
      + '2. Compare against the counterpart (KB file for code drift, listed code areas for kb drift).\n'
      + '3. For kb drift: verify the KB file is internally consistent; cross-check validation/ and flows/ for related rules.\n'
      + '4. Present both values (KB spec vs actual code) to the user and wait for explicit confirmation.\n'
      + '5. After confirmation: edit, then close with `kb_drift({ summaries: [...] })` (code drift) or `kb_drift({ kb_confirmed: [...] })` (kb drift).\n\n'
      + 'Never close silently. Never close without seeing the diff.'

    if (hasUnmappedKbEntries) {
      instruction += '\n\n⚠ One or more KB entries have no mapped code paths ("review manually"). '
        + 'For each unmapped entry: search the entire codebase for files related to the KB feature '
        + '(controllers, services, DTOs, entities, FE components, forms, i18n, DB schema) and verify '
        + 'all layers are consistent with the KB spec before confirming.'
    }

    if (submodules.length > 0) {
      instruction += '\n\nℹ Submodule files: since/latest SHAs belong to submodule history. '
        + 'The `cmd` field in `_diffs[*].files[*]` already uses `git -C <submodule>` — use it as-is.'
    }

    result._instruction = instruction
  }

  if (includeDiffs && !noDrift) {
    result._diffs = await buildDiffsPayload({ codeState, kbState, submodules })
  }

  // In readonly mode, surface the computed entries so the caller (live
  // watcher, CI check) can render them without re-reading the queue file.
  // Format matches what readCodeDriftEntries / readKbDriftEntries return.
  if (readonly) {
    result._state = {
      codeEntries: codeState.entries,
      kbEntries: kbState.entries,
      headSha
    }
  }

  return result
}

// ── Phase 2a: code→kb resolved — KB updated ──────────────────────────────────

async function resolveWithSummaries(summaries, { readonly = false } = {}) {
  const { entries: codeEntries, header } = readCodeDriftEntries()
  const openCodeTargets = new Set(codeEntries.map(e => e.kbTarget))
  const openKbFiles = new Set(readKbDriftEntries().entries.map(e => e.kbFile))

  const closed = []
  const notFound = []
  const logRecords = []

  for (const { kb_target, summary } of summaries) {
    if (!summary || !kb_target) {
      notFound.push({ kb_target, reason: 'missing kb_target or summary' })
      continue
    }
    if (openCodeTargets.has(kb_target)) {
      closed.push({ kb_target, summary })
      logRecords.push({ direction: 'code→kb', resolution: 'kb-updated', kb_target, summary })
      continue
    }
    const entry = { kb_target, reason: 'no open entry in sync/code-drift.md for this kb_target' }
    if (openKbFiles.has(kb_target)) {
      entry.hint = `"${kb_target}" is open in sync/kb-drift.md (kb→code direction). Did you mean kb_drift({ kb_confirmed: [{ kb_file: "${kb_target}" }] })?`
    }
    notFound.push(entry)
  }

  const closedTargets = new Set(closed.map(c => c.kb_target))
  const remaining = codeEntries.filter(e => !closedTargets.has(e.kbTarget))
  const resolvedShas = codeEntries
    .filter(e => closedTargets.has(e.kbTarget))
    .flatMap(e => e.codeFiles.map(f => f.latestCommit || f.sinceCommit))
  const nextHeader = await advanceQueueBaseline(header, resolvedShas)
  if (!readonly) {
    writeCodeDriftEntries(nextHeader, remaining)
    appendToDriftLog(logRecords)
  }

  const result = { resolved: closed.length, closed, not_found: notFound }
  if (closed.length > 0) {
    const kbTargetList = closed.map(c => c.kb_target).join(', ')
    result._instruction = `Queue entries closed for: ${kbTargetList}. `
      + 'Verify that each KB file above was actually updated before this call. '
      + 'If not, the drift queue is now clean but the KB is stale — '
      + 'read the KB file(s) to confirm, and use kb_write to fix any that were missed.'
  }
  if (notFound.length > 0) {
    result.error = closed.length === 0
      ? `No matching entries in sync/code-drift.md. Nothing was closed.`
      : `${notFound.length} of ${summaries.length} entries did not match sync/code-drift.md. See not_found for details.`
  }
  return result
}

// ── Phase 2b: code→kb resolved — code file reverted ──────────────────────────

async function resolveReverted(reverted, { readonly = false } = {}) {
  const codeFiles = reverted.map(r => r.code_file || r)
  const { entries, header } = readCodeDriftEntries()
  const logRecords = []
  const closed = []
  const matchedFiles = new Set()

  const resolvedShas = []
  const updated = entries.map(entry => {
    const removedFiles = entry.codeFiles.filter(f => codeFiles.includes(f.path))
    const removedHere = removedFiles.map(f => f.path)
    if (removedHere.length > 0) {
      removedHere.forEach(p => matchedFiles.add(p))
      for (const f of removedFiles) resolvedShas.push(f.latestCommit || f.sinceCommit)
      closed.push({ kb_target: entry.kbTarget, code_files: removedHere })
      logRecords.push({ direction: 'code→kb', resolution: 'code-reverted', kb_target: entry.kbTarget, code_files: removedHere })
      entry.codeFiles = entry.codeFiles.filter(f => !codeFiles.includes(f.path))
    }
    return entry
  }).filter(entry => entry.codeFiles.length > 0)

  const notFound = codeFiles
    .filter(f => !matchedFiles.has(f))
    .map(code_file => ({ code_file, reason: 'no open entry in sync/code-drift.md references this code_file' }))

  const nextHeader = await advanceQueueBaseline(header, resolvedShas)
  if (!readonly) {
    writeCodeDriftEntries(nextHeader, updated)
    appendToDriftLog(logRecords)
  }

  const result = { reverted: matchedFiles.size, closed, not_found: notFound }
  if (notFound.length > 0) {
    result.error = matchedFiles.size === 0
      ? `No matching code files in sync/code-drift.md. Nothing was closed.`
      : `${notFound.length} of ${codeFiles.length} code files did not match sync/code-drift.md. See not_found for details.`
  }
  return result
}

// ── Phase 2c: kb→code resolved ────────────────────────────────────────────────

async function resolveKbConfirmed(kb_confirmed, { readonly = false } = {}) {
  const kbFiles = kb_confirmed.map(r => r.kb_file || r)
  const rules = loadRules(KB_ROOT)
  const patterns = rules.getCodePathPatterns()

  const { header, entries } = readKbDriftEntries()
  const openKbFiles = new Set(entries.map(e => e.kbFile))
  const openCodeTargets = new Set(readCodeDriftEntries().entries.map(e => e.kbTarget))

  const closed = []
  const notFound = []
  const warnings = []
  const logRecords = []

  for (const kb_file of kbFiles) {
    if (!openKbFiles.has(kb_file)) {
      const entry = { kb_file, reason: 'no open entry in sync/kb-drift.md for this kb_file' }
      if (openCodeTargets.has(kb_file)) {
        entry.hint = `"${kb_file}" is open in sync/code-drift.md (code→kb direction). Did you mean kb_drift({ summaries: [{ kb_target: "${kb_file}", summary: "..." }] })?`
      }
      notFound.push(entry)
      continue
    }
    const codePaths = reverseMapKbTarget(kb_file, patterns)
    const unmapped = codePaths.length === 0
    if (unmapped) {
      warnings.push(`drift confirmed for "${kb_file}" but no code_path_patterns mapping exists in _rules.md. Future KB changes to this file will not trigger automatic drift detection. Recommended: add a code_path_patterns entry for this file.`)
    }
    closed.push({ kb_file, ...(unmapped && { unmapped: true }) })
    logRecords.push({ direction: 'kb→code', resolution: 'confirmed', kb_file, ...(unmapped && { unmapped: true }) })
  }

  const closedFiles = new Set(closed.map(c => c.kb_file))
  const remaining = entries.filter(e => !closedFiles.has(e.kbFile))
  const resolvedShas = entries
    .filter(e => closedFiles.has(e.kbFile))
    .map(e => e.latestCommit || e.sinceCommit)
  const nextHeader = await advanceQueueBaseline(header, resolvedShas)
  if (!readonly) {
    writeKbDriftEntries(nextHeader, remaining)
    appendToDriftLog(logRecords)
  }

  const result = { confirmed: closed.length, closed, not_found: notFound }
  if (warnings.length > 0) result.warnings = warnings
  if (notFound.length > 0) {
    result.error = closed.length === 0
      ? `No matching entries in sync/kb-drift.md. Nothing was closed.`
      : `${notFound.length} of ${kbFiles.length} entries did not match sync/kb-drift.md. See not_found for details.`
  }
  return result
}

// ── Phase 2d: dismiss structurally-broken queue entries ───────────────────────
//
// Escape hatch for ghost entries — a kb_target (or kb_file) that points at a
// file that will never exist, typically because an upstream code_path_patterns
// rule captured a versioned/timestamped basename (Flyway, Rails migrations, …)
// as `{name}`. Removes the entry and logs a DISMISSED event distinct from the
// RESOLVED stream so dismissals stay visible as a signal that upstream rules
// need attention.

const DISMISS_QUEUES = new Set(['code-drift', 'kb-drift'])

async function resolveDismissed(dismiss, { readonly = false } = {}) {
  const closed = []
  const notFound = []
  const logRecords = []

  const codeState = readCodeDriftEntries()
  const kbState = readKbDriftEntries()
  let codeDirty = false
  let kbDirty = false
  const codeResolvedShas = []
  const kbResolvedShas = []

  for (const item of dismiss) {
    const queue = item?.queue
    const queue_key = item?.queue_key
    const reason = typeof item?.reason === 'string' ? item.reason.trim() : ''

    if (!DISMISS_QUEUES.has(queue)) {
      notFound.push({ queue, queue_key, reason_missing: `queue must be one of ${[...DISMISS_QUEUES].join(', ')}` })
      continue
    }
    if (!queue_key || typeof queue_key !== 'string') {
      notFound.push({ queue, queue_key, reason_missing: 'queue_key is required and must be a non-empty string' })
      continue
    }
    if (!reason) {
      notFound.push({ queue, queue_key, reason_missing: 'reason is required and must be a non-empty string' })
      continue
    }

    if (queue === 'code-drift') {
      const idx = codeState.entries.findIndex(e => e.kbTarget === queue_key)
      if (idx === -1) {
        notFound.push({ queue, queue_key, reason_missing: 'no open entry in sync/code-drift.md with this queue_key' })
        continue
      }
      const [removed] = codeState.entries.splice(idx, 1)
      for (const f of removed.codeFiles) codeResolvedShas.push(f.latestCommit || f.sinceCommit)
      codeDirty = true
    } else {
      const idx = kbState.entries.findIndex(e => e.kbFile === queue_key)
      if (idx === -1) {
        notFound.push({ queue, queue_key, reason_missing: 'no open entry in sync/kb-drift.md with this queue_key' })
        continue
      }
      const [removed] = kbState.entries.splice(idx, 1)
      kbResolvedShas.push(removed.latestCommit || removed.sinceCommit)
      kbDirty = true
    }

    closed.push({ queue, queue_key, reason })
    logRecords.push({ event_type: 'dismissed', queue, queue_key, reason })
  }

  if (!readonly) {
    if (codeDirty) {
      const nextHeader = await advanceQueueBaseline(codeState.header, codeResolvedShas)
      writeCodeDriftEntries(nextHeader, codeState.entries)
    }
    if (kbDirty) {
      const nextHeader = await advanceQueueBaseline(kbState.header, kbResolvedShas)
      writeKbDriftEntries(nextHeader, kbState.entries)
    }
    appendToDriftLog(logRecords)
  }

  const result = { dismissed: closed.length, closed, not_found: notFound }
  if (notFound.length > 0) {
    result.error = closed.length === 0
      ? 'No entries dismissed. See not_found for details.'
      : `${notFound.length} of ${dismiss.length} dismiss inputs were invalid. See not_found for details.`
  }
  return result
}

// ── Phase 2e: acknowledge — non-resolving annotation ─────────────────────────
//
// Acknowledged entries stay in the queue but render with an `**Acknowledged**`
// badge so downstream reviewers can filter for "non-acknowledged only" without
// losing the audit trail. The mandatory `reason` mitigates ack-spam; later
// resolving verdicts (apply / dismiss / etc.) still override.

async function resolveAcknowledge(ack, { readonly = false } = {}) {
  const codeState = readCodeDriftEntries()
  const kbState = readKbDriftEntries()
  const closed = []
  const notFound = []
  const logRecords = []
  let codeDirty = false
  let kbDirty = false

  // Anchor the acknowledgement to the current author + HEAD so the marker
  // identifies who signed off and against which state.
  const git = simpleGit(process.cwd())
  let ackBy = null
  let ackCommit = null
  let ackDate = new Date().toISOString().split('T')[0]
  try {
    const email = (await git.raw(['config', 'user.email'])).trim()
    ackBy = authorHandleFromEmail(email)
  } catch { /* fall through to error per-item */ }
  try {
    const log = await git.log({ maxCount: 1 })
    if (log.latest) {
      ackCommit = log.latest.hash.slice(0, 7)
      ackDate = log.latest.date.split('T')[0]
    }
  } catch { /* fall through to error per-item */ }

  for (const item of ack) {
    const queue = item?.queue
    const queue_key = item?.queue_key || item?.kb_target || item?.kb_file
    const reason = typeof item?.reason === 'string' ? item.reason.trim() : ''

    if (!DISMISS_QUEUES.has(queue)) {
      notFound.push({ queue, queue_key, reason_missing: `queue must be one of ${[...DISMISS_QUEUES].join(', ')}` })
      continue
    }
    if (!queue_key) {
      notFound.push({ queue, queue_key, reason_missing: 'queue_key (or kb_target/kb_file) is required' })
      continue
    }
    if (!reason) {
      notFound.push({ queue, queue_key, reason_missing: 'reason is required and must be a non-empty string' })
      continue
    }
    if (!ackBy || !ackCommit) {
      notFound.push({ queue, queue_key, reason_missing: 'cannot resolve author / HEAD for acknowledgement (git config user.email + a commit on HEAD required)' })
      continue
    }

    const ackPayload = { by: ackBy, atCommit: ackCommit, atDate: ackDate, reason }

    if (queue === 'code-drift') {
      const target = codeState.entries.find(e => e.kbTarget === queue_key)
      if (!target) {
        notFound.push({ queue, queue_key, reason_missing: 'no open entry in sync/code-drift.md with this queue_key' })
        continue
      }
      target.acknowledgement = ackPayload
      codeDirty = true
    } else {
      const target = kbState.entries.find(e => e.kbFile === queue_key)
      if (!target) {
        notFound.push({ queue, queue_key, reason_missing: 'no open entry in sync/kb-drift.md with this queue_key' })
        continue
      }
      target.acknowledgement = ackPayload
      kbDirty = true
    }

    closed.push({ queue, queue_key, reason, by: ackBy, at_commit: ackCommit })
    logRecords.push({ event_type: 'acknowledged', queue, queue_key, reason, by: ackBy, at_commit: ackCommit })
  }

  if (!readonly) {
    if (codeDirty) writeCodeDriftEntries(codeState.header, codeState.entries)
    if (kbDirty) writeKbDriftEntries(kbState.header, kbState.entries)
    if (logRecords.length > 0) appendToDriftLog(logRecords)
  }

  const result = { acknowledged: closed.length, closed, not_found: notFound }
  if (notFound.length > 0) {
    result.error = closed.length === 0
      ? 'No entries acknowledged. See not_found for details.'
      : `${notFound.length} of ${ack.length} acknowledge inputs were invalid. See not_found for details.`
  }
  return result
}

// ── Admin escape hatch: force_baseline / purge ───────────────────────────────

async function resetBaselines({ force_baseline, purge, readonly = false }) {
  const git = simpleGit(process.cwd())
  let sha = null
  if (force_baseline) {
    const arg = force_baseline === 'HEAD' ? 'HEAD' : force_baseline
    try {
      sha = (await git.revparse([arg])).trim()
    } catch {
      return { error: `cannot resolve force_baseline="${force_baseline}" via git rev-parse` }
    }
  }

  const codeState = readCodeDriftEntries()
  const kbState = readKbDriftEntries()

  // Capture raw pre-purge queue bodies before any writes. These get logged
  // verbatim so a purge is reconstructable without leaning on `git show`.
  let codeBodyBefore = ''
  let kbBodyBefore = ''
  if (purge) {
    codeBodyBefore = extractQueueBody(CODE_DRIFT_PATH)
    kbBodyBefore = extractQueueBody(KB_DRIFT_PATH)
  }
  const codeCountBefore = codeState.entries.length
  const kbCountBefore = kbState.entries.length

  if (sha) {
    codeState.header = setBaseline(codeState.header, sha)
    kbState.header = setBaseline(kbState.header, sha)
  }

  const codeEntries = purge ? [] : codeState.entries
  const kbEntries = purge ? [] : kbState.entries

  if (!readonly) {
    writeCodeDriftEntries(codeState.header, codeEntries)
    writeKbDriftEntries(kbState.header, kbEntries)

    if (purge) {
      appendToDriftLog([{
        event_type: 'purged',
        baseline: sha,
        code_count: codeCountBefore,
        kb_count: kbCountBefore,
        code_body: codeBodyBefore,
        kb_body: kbBodyBefore
      }])
    }
  }

  return {
    baseline: sha,
    purged: !!purge,
    message: purge
      ? `Queue files cleared; both baselines set to ${sha ? sha.slice(0, 7) : '(unchanged)'}.`
      : `Both baselines set to ${sha ? sha.slice(0, 7) : '(unchanged)'}; queue entries preserved.`
  }
}

// ── git helpers ───────────────────────────────────────────────────────────────

/**
 * Get the submodule's commit SHA as recorded in the parent repo at a given commit.
 * Uses git ls-tree to read the submodule pointer (mode 160000) without checking out.
 * Returns null if the submodule didn't exist at that commit.
 */
async function getSubmodulePointerAt(git, commitSha, subPath) {
  try {
    const line = (await git.raw(['ls-tree', commitSha, subPath])).trim()
    const match = line.match(/^160000 commit ([a-f0-9]+)/)
    return match ? match[1] : null
  } catch { return null }
}

/**
 * Bootstrap fallback — only invoked when a queue header has no baseline line yet
 * (first deployment, or a queue manually cleared), or when a stored baseline
 * is unreachable and we re-bootstrap. Graduated fallback:
 * upstream tracking → remote branch → closest parent branch → null.
 * Returns null when no reliable baseline exists (caller skips with warning).
 * Optional `meta` out-param: caller can pass `{}` and read `meta.via` to learn
 * which resolver branch produced the ref — used by the re-bootstrap audit log.
 */
async function resolveLastSyncRef(git, remote, meta) {
  try {
    const upstream = await git.raw(['rev-parse', '--abbrev-ref', '@{upstream}'])
    if (upstream && upstream.trim()) {
      if (meta) meta.via = 'upstream'
      return upstream.trim()
    }
  } catch { /* no upstream configured */ }

  let validRemote = remote
  if (remote) {
    try {
      const remotes = (await git.raw(['remote'])).split('\n').filter(r => r.trim())
      if (!remotes.includes(remote)) {
        const cwd = git._executor?.cwd || 'unknown'
        process.stderr.write(`[kb-drift] warning: remote '${remote}' not found in ${cwd} — available remotes: ${remotes.join(', ') || 'none'}. Skipping drift detection.\n`)
        process.stderr.write(`[kb-drift]   fix: git -C ${cwd} remote rename <correct> ${remote}\n`)
        validRemote = null
      }
    } catch { validRemote = null }
  }

  if (validRemote) {
    try {
      const branch = (await git.raw(['symbolic-ref', '--short', 'HEAD'])).trim()
      const remoteBranch = `${validRemote}/${branch}`
      await git.raw(['rev-parse', remoteBranch])
      if (meta) meta.via = 'remote-branch'
      return remoteBranch
    } catch { /* remote branch doesn't exist yet */ }
  }

  if (validRemote) {
    try {
      const remoteBranches = (await git.raw(['for-each-ref', '--format=%(refname:short)', `refs/remotes/${validRemote}/`]))
        .split('\n')
        .filter(b => b.trim() && !b.includes('/HEAD'))
      let closest = null
      let minDistance = Infinity
      for (const rb of remoteBranches) {
        try {
          const mb = (await git.raw(['merge-base', 'HEAD', rb])).trim()
          if (!mb) continue
          const count = parseInt((await git.raw(['rev-list', '--count', `${mb}..HEAD`])).trim(), 10)
          if (count < minDistance) {
            minDistance = count
            closest = mb
          }
        } catch { /* skip branches with no common ancestor */ }
      }
      if (closest) {
        if (minDistance > 20) {
          process.stderr.write(`[kb-drift] hint: ${minDistance} commits since parent branch — consider pulling/rebasing to reduce drift noise\n`)
        }
        if (meta) meta.via = 'closest-parent'
        return closest
      }
    } catch { /* no remote branches available */ }
  }

  if (meta) meta.via = null
  return null
}

// parseNameStatus + baselineReachable are imported from ../lib/git-ops

/**
 * List files that changed between `ref` and `toRef`. When `includeWorkingTree`
 * is true, additionally union the **working-tree** state (committed + staged
 * + unstaged + untracked since `ref`) — used by the live readonly runner so
 * the extensions can preview drift the author hasn't published yet.
 *
 * Each returned entry carries a private `_source: 'committed' | 'working-tree'`
 * flag. Files present in both sets are upgraded to `working-tree` so the UI
 * shows the most recent state ("Latest = working tree") while preserving the
 * real `Since` commit anchor from history.
 */
async function getChangedFiles(git, ref, toRef = 'HEAD', { includeWorkingTree = false } = {}) {
  // Committed: ref..toRef
  let committed = []
  try {
    const result = await git.diff(['--name-status', '-M', ref, toRef])
    committed = parseNameStatus(result)
  } catch {
    try {
      const result = await git.diff(['--name-status', '-M', '4b825dc642cb6eb9a060e54bf899d15f7dcb6820', toRef])
      committed = parseNameStatus(result)
    } catch {
      committed = []
    }
  }
  for (const f of committed) f._source = 'committed'

  if (!includeWorkingTree) return committed

  // Working tree: diff `ref` against the working tree (no second ref). This
  // captures committed-since-ref + staged + unstaged in one shot — git
  // compares the working copy to the given ref, so anything not yet matching
  // `ref` shows up regardless of where it sits in the index hierarchy.
  let workingTreeDiff = []
  try {
    const result = await git.diff(['--name-status', '-M', ref])
    workingTreeDiff = parseNameStatus(result)
  } catch { /* leave empty */ }

  // Untracked files: not in any tree, so not produced by `git diff`.
  let untracked = []
  try {
    const out = await git.raw(['ls-files', '--others', '--exclude-standard'])
    untracked = out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(p => ({ status: 'A', path: p }))
  } catch { /* leave empty */ }

  // Index committed paths so we can upgrade entries the working tree extends.
  const committedByPath = new Map()
  for (const f of committed) {
    committedByPath.set(f.path, f)
    if (f.oldPath) committedByPath.set(f.oldPath, f)
  }

  for (const f of [...workingTreeDiff, ...untracked]) {
    const existing = committedByPath.get(f.path)
      || (f.oldPath ? committedByPath.get(f.oldPath) : undefined)
    if (existing) {
      // File has committed history AND further uncommitted edits — keep the
      // entry but flip its source so the UI renders "working tree" as Latest.
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
 * Resolve the local git user's handle for stamping author on purely-
 * uncommitted entries (no commits in `baseline..HEAD` for this file).
 * Returns null when both user.email and user.name are unset.
 */
// getLocalGitUserHandle is imported from ../lib/git-ops

// Build Map<path, [{sha, date}, ...]> in chronological order for baseline..HEAD.
// One `git log` call. A rename commit attributes to the new path (what git's
// --name-status reports on that line); pre-rename history under the old path
// is retained under the old path key — resolveCommitRange merges both.
// Returns an empty Map when the range has no commits or git fails.
async function buildCommitIndex(git, baseline, toRef = 'HEAD') {
  if (!baseline) return new Map()
  const index = new Map()
  let output
  try {
    // %ae uses .mailmap when available — gives the canonical email for the
    // author. The local-part is what's surfaced as `@author` on file lines.
    output = await git.raw(['log', '--name-status', '-M', '--reverse', '--use-mailmap',
      '--pretty=format:__C %H %cI %ae', `${baseline}..${toRef}`])
  } catch { return index }
  if (!output) return index

  let currentSha = null
  let currentDate = null
  let currentAuthor = null
  for (const line of output.split('\n')) {
    if (line.startsWith('__C ')) {
      const m = line.match(/^__C ([a-f0-9]+) (\S+) (.+)$/)
      if (m) {
        currentSha = m[1]
        currentDate = m[2].split('T')[0]
        currentAuthor = authorHandleFromEmail(m[3])
      }
      continue
    }
    if (!line.trim() || !currentSha) continue
    const parts = line.split('\t')
    const code = parts[0].trim()
    if (!code) continue
    const entry = { sha: currentSha, date: currentDate, author: currentAuthor }
    if (code.startsWith('R') || code.startsWith('C')) {
      const newPath = parts[2]
      if (newPath) appendCommit(index, newPath, entry)
    } else {
      const p = parts[1]
      if (p) appendCommit(index, p, entry)
    }
  }
  return index
}

// authorHandleFromEmail is imported from ../lib/git-ops

function appendCommit(index, key, entry) {
  const list = index.get(key)
  if (list) list.push(entry)
  else index.set(key, [entry])
}

// Merge chronologies for new+old paths, return earliest/latest commit pair.
// `oldPath` lets renamed files pick up commits from before the rename.
// Returns null if no commits found — caller should fall back to HEAD info.
function resolveCommitRange(index, newPath, oldPath) {
  const commits = []
  if (index.has(newPath)) commits.push(...index.get(newPath))
  if (oldPath && oldPath !== newPath && index.has(oldPath)) commits.push(...index.get(oldPath))
  if (commits.length === 0) return null
  commits.sort((a, b) => a.date.localeCompare(b.date))
  const first = commits[0]
  const last = commits[commits.length - 1]
  const sinceCommit = first.sha.slice(0, 7)
  const latestCommit = last.sha.slice(0, 7)
  return {
    sinceCommit,
    sinceDate: first.date,
    latestCommit: latestCommit !== sinceCommit ? latestCommit : null,
    latestDate: latestCommit !== sinceCommit ? last.date : null,
    // Author of the most recent commit in the range — what the UI surfaces as
    // a per-file `@author` badge so reviewers see at a glance whose touch this is.
    author: last.author || null
  }
}

// ── Pre-fetched diffs ────────────────────────────────────────────────────────
// Returns a structured `_diffs` payload with per-file unified diffs, stats,
// and commit subjects so consuming agents don't have to re-run git themselves
// (and skip the step). Every file carries a reproducible `cmd` — truncation
// or errors never leave the agent without a way to re-fetch.

function resolveGitTarget(filePath, submodules) {
  for (const sub of submodules) {
    const prefix = sub.path.endsWith('/') ? sub.path : sub.path + '/'
    if (filePath === sub.path || filePath.startsWith(prefix)) {
      return {
        cwd: sub.fullPath,
        relativePath: filePath.slice(prefix.length),
        submodule: sub.path,
        isShared: !!sub.isShared
      }
    }
  }
  return { cwd: process.cwd(), relativePath: filePath, submodule: null, isShared: false }
}

function buildCmd({ submodule, op, since, latest, relativePath }) {
  const prefix = submodule ? `git -C ${submodule}` : 'git'
  const to = latest || 'HEAD'
  if (op === 'show') return `${prefix} show ${since} -- ${relativePath}`
  if (op === 'log') return `${prefix} log --pretty="%h  %s" ${since}~1..${to} -- ${relativePath}`
  return `${prefix} diff ${since}~1..${to} -- ${relativePath}`
}

// v2: rename-aware log command for code-drift entries with `renamedFrom`.
// Plain `git diff <since>~1..HEAD -- <newPath>` can hide the rename's content
// when baseline predates the rename; --follow (log-only) traces across it.
function buildFollowCmd({ submodule, since, latest, relativePath }) {
  const prefix = submodule ? `git -C ${submodule}` : 'git'
  const to = latest || 'HEAD'
  return `${prefix} log --follow -p --stat ${since}~1..${to} -- ${relativePath}`
}

// v2: reproducible grep cmd for a list of files. Pathspecs are submodule-
// relative when submodule is set (same convention as buildCmd). Pattern is
// pre-built ERE with alternation and \b word boundaries.
function buildGrepCmd({ submodule, pattern, files }) {
  const prefix = submodule ? `git -C ${submodule}` : 'git'
  const esc = (s) => `'${s.replace(/'/g, `'\\''`)}'`
  const paths = files.map(esc).join(' ')
  return `${prefix} grep -nE ${esc(pattern)} -- ${paths}`
}

// v2: extract likely code identifiers from a unified diff. Pure regex over
// +/- body lines only (headers and hunk lines excluded). Returns up to
// IDENTIFIER_CAP tokens sorted by length desc — longer identifiers anchor
// grep better. No LLM, no AST.
const IDENTIFIER_STOPWORDS = new Set([
  'Required', 'Must', 'Displayed', 'Example', 'Note', 'Yes', 'No', 'None', 'True', 'False',
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Date', 'Null', 'Undefined',
  'TODO', 'FIXME', 'XXX', 'NOTE', 'TBD', 'TBA',
  'HTTP', 'HTTPS', 'URL', 'URI', 'API', 'JSON', 'XML', 'HTML', 'CSS', 'SQL',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
])

function extractChangedIdentifiers(diffText) {
  if (!diffText || typeof diffText !== 'string') return []
  const bodyLines = []
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+') || line.startsWith('-')) bodyLines.push(line.slice(1))
  }
  const text = bodyLines.join('\n').replace(/\|/g, ' ')

  const out = new Set()
  // PascalCase: TrUserRole, UserDefinition
  for (const m of text.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-zA-Z0-9]*)+\b/g)) out.add(m[0])
  // camelCase starting lowercase: linestopMail, userId, maxLength
  for (const m of text.matchAll(/\b[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g)) out.add(m[0])
  // UPPER_SNAKE_CASE: SADM_ROLE, MAX_LENGTH
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g)) out.add(m[0])
  // Quoted/code-spanned field names: "roleType", `userId`, 'email'
  for (const m of text.matchAll(/["'`]([a-zA-Z_][\w\-]{1,40})["'`]/g)) out.add(m[1])
  // Numeric thresholds with comparator or max/min/size keyword
  for (const m of text.matchAll(/(?:max|min|size|length|len|>=?|<=?)\s*[:=(\s]\s*(\d{1,6})/gi) || []) out.add(m[1])

  const filtered = [...out].filter(x => {
    if (!x) return false
    if (IDENTIFIER_STOPWORDS.has(x)) return false
    // drop pure-numeric 1-2 digit (likely noise: line numbers, small constants)
    if (/^\d+$/.test(x) && x.length < 3) return false
    return true
  })
  filtered.sort((a, b) => b.length - a.length || a.localeCompare(b))
  return filtered.slice(0, IDENTIFIER_CAP)
}

function buildIdentifierRegex(identifiers) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = identifiers.map(id => {
    const e = esc(id)
    // Word-boundary wrap when the identifier starts/ends with a word char.
    const left = /^\w/.test(id) ? '\\b' : ''
    const right = /\w$/.test(id) ? '\\b' : ''
    return `${left}${e}${right}`
  })
  return `(${parts.join('|')})`
}

function computeStat(diffText) {
  if (!diffText) return '+0 -0 (0 hunks)'
  let adds = 0, dels = 0, hunks = 0
  for (const line of diffText.split('\n')) {
    if (line.startsWith('@@')) hunks++
    else if (line.startsWith('+') && !line.startsWith('+++')) adds++
    else if (line.startsWith('-') && !line.startsWith('---')) dels++
  }
  return `+${adds} -${dels} (${hunks} hunk${hunks === 1 ? '' : 's'})`
}

function detectBinaryMarker(diffText) {
  if (!diffText) return null
  const m = diffText.match(/^Binary files .* differ$/m)
  return m ? m[0] : null
}

function truncateDiff(diffText, cap) {
  if (!diffText) return { text: '', lines: 0, truncated: false }
  const lines = diffText.split('\n')
  if (lines.length <= cap) return { text: diffText, lines: lines.length, truncated: false }
  return { text: lines.slice(0, cap).join('\n'), lines: cap, truncated: true }
}

async function fetchFileDiff({ cwd, submodule, since, latest, relativePath }) {
  const cmd = buildCmd({ submodule, op: 'diff', since, latest, relativePath })
  const to = latest || 'HEAD'
  const git = simpleGit(cwd)

  // Guard: the SHA must exist in the local history. For submodules this may
  // fail after a shallow fetch or squash-merge upstream. Preserve `cmd` so
  // the agent can retry once they've fetched.
  try {
    await git.raw(['cat-file', '-e', `${since}^{commit}`])
  } catch {
    return { cmd, diff: null, stat: null, lines: 0, truncated: false, binary: false,
      error: `commit ${since} not in local${submodule ? ' submodule' : ''} history` }
  }

  let raw
  let actualCmd = cmd
  try {
    raw = await git.diff([`${since}~1..${to}`, '--', relativePath])
  } catch {
    // First-commit fallback: <since>~1 doesn't exist, so show the
    // introducing commit instead.
    try {
      actualCmd = buildCmd({ submodule, op: 'show', since, relativePath })
      raw = await git.show([since, '--', relativePath])
    } catch (e) {
      return { cmd, diff: null, stat: null, lines: 0, truncated: false, binary: false,
        error: e.message || 'git invocation failed' }
    }
  }

  if (!raw || !raw.trim()) {
    return { cmd: actualCmd, diff: '', stat: '+0 -0 (0 hunks)', lines: 0, truncated: false, binary: false }
  }

  const binaryMarker = detectBinaryMarker(raw)
  if (binaryMarker) {
    return { cmd: actualCmd, diff: binaryMarker, stat: 'binary', lines: 0, truncated: false, binary: true }
  }

  const stat = computeStat(raw)
  const { text, lines, truncated } = truncateDiff(raw, PER_FILE_LINE_CAP)
  return { cmd: actualCmd, diff: text, stat, lines, truncated, binary: false }
}

async function fetchCommitSubjects({ cwd, submodule, since, latest, relativePath }) {
  const to = latest || 'HEAD'
  const cmd = buildCmd({ submodule, op: 'log', since, latest, relativePath })
  const git = simpleGit(cwd)
  let raw
  try {
    raw = await git.raw(['log', '--pretty=format:%h%x09%s', `${since}~1..${to}`, '--', relativePath])
  } catch {
    try {
      raw = await git.raw(['log', '--pretty=format:%h%x09%s', '-1', since, '--', relativePath])
    } catch {
      return { commits: [], total: 0, cmd, error: 'git log failed' }
    }
  }
  if (!raw || !raw.trim()) return { commits: [], total: 0, cmd }
  const all = raw.split('\n').filter(Boolean).map(line => {
    const [sha, ...rest] = line.split('\t')
    return { sha: sha.trim(), subject: rest.join('\t') }
  })
  const commits = all.slice(0, COMMIT_CAP)
  return { commits, total: all.length, cmd }
}

// v2: run `git grep -nE` over a pre-expanded file list. Returns ranked hits
// (per-file match counts descending, top HITS_PER_AREA_CAP total). `cmd` is
// always preserved for manual re-run. Per-call timeout protects against a
// pathological regex; on timeout we return empty hits + error, not throw.
async function grepFiles({ cwd, submodule, identifiers, files, pattern }) {
  const cmd = buildGrepCmd({ submodule, pattern, files })
  if (!files || files.length === 0 || !identifiers || identifiers.length === 0) {
    return { hits: [], cmd }
  }
  const git = simpleGit(cwd)

  const run = git.raw(['grep', '-n', '-E', pattern, '--', ...files])
    .then(raw => ({ ok: true, raw }))
    .catch(err => {
      // git grep exits 1 when no matches — simple-git surfaces as error.
      const msg = err && (err.message || String(err))
      if (msg && /exit\s*code\s*1\b/i.test(msg)) return { ok: true, raw: '' }
      return { ok: false, err: msg || 'git grep failed' }
    })
  const timer = new Promise(resolve => setTimeout(() => resolve({ ok: false, err: 'grep timeout' }), GREP_TIMEOUT_MS))
  const res = await Promise.race([run, timer])
  if (!res.ok) return { hits: [], cmd, error: res.err }

  const raw = res.raw || ''
  if (!raw.trim()) return { hits: [], cmd }

  const byFile = new Map()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const firstColon = line.indexOf(':')
    if (firstColon === -1) continue
    const secondColon = line.indexOf(':', firstColon + 1)
    if (secondColon === -1) continue
    const file = line.slice(0, firstColon)
    const lineNo = parseInt(line.slice(firstColon + 1, secondColon), 10)
    if (!Number.isFinite(lineNo)) continue
    let snippet = line.slice(secondColon + 1)
    if (snippet.length > SNIPPET_MAX_CHARS) snippet = snippet.slice(0, SNIPPET_MAX_CHARS) + '…'
    // Attribute hit to the first matching identifier in the snippet (best-effort).
    const hitIdent = identifiers.find(id => snippet.includes(id)) || identifiers[0]
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push({ file, line: lineNo, identifier: hitIdent, snippet: snippet.trim() })
  }

  const ranked = [...byFile.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const hits = []
  for (const [, fileHits] of ranked) {
    for (const h of fileHits.slice(0, HITS_PER_FILE_CAP)) {
      hits.push(h)
      if (hits.length >= HITS_PER_AREA_CAP) return { hits, cmd }
    }
  }
  return { hits, cmd }
}

// v2: orchestrate identifier extraction, glob expansion, and grep intersection
// for one kb-drift entry. Produces `code_areas[]` shape; idempotent; never
// throws. Caller gates via budget.grep_budget_left (decremented per hit).
async function buildCodeAreasPayload({ diffText, codeAreas, submodules, budget }) {
  const identifiers = extractChangedIdentifiers(diffText)
  if (!codeAreas || codeAreas.length === 0) {
    return { identifiers: identifiers.length > 0 ? identifiers : null, areas: null }
  }

  const areas = []
  const pattern = identifiers.length > 0 ? buildIdentifierRegex(identifiers) : null

  for (const glob of codeAreas) {
    const { files, matchedCount, truncated } = expandGlob(glob, { fileCap: FILES_PER_AREA_CAP })
    const area = {
      pattern: glob,
      matched_count: matchedCount,
      matched_sample: files.slice(0, FILES_PER_AREA_CAP),
      truncated,
      hits_top: [],
      grep_cmd: null
    }

    if (files.length === 0) {
      area.skipped_reason = 'pattern_no_match'
      areas.push(area)
      continue
    }

    const groups = groupFilesBySubmodule(files, submodules)

    if (!pattern) {
      // Expansion-only: scoped file list still helps the agent narrow search.
      area.grep_cmd = null
      area.skipped_reason = 'no_identifiers'
      areas.push(area)
      continue
    }

    if (budget.grep_budget_left <= 0) {
      area.grep_cmd = groups.map(g => buildGrepCmd({ submodule: g.submodule,
        pattern, files: g.relativeFiles })).join(' && ')
      area.skipped_reason = 'budget'
      areas.push(area)
      continue
    }

    const perFileCounts = new Map()
    const allHits = []
    const cmds = []
    let anyError = null
    for (const g of groups) {
      const { hits, cmd, error } = await grepFiles({
        cwd: g.cwd, submodule: g.submodule, identifiers,
        files: g.relativeFiles, pattern
      })
      cmds.push(cmd)
      if (error) anyError = error
      for (const h of hits) {
        const parentPath = g.submodule ? `${g.submodule}/${h.file}` : h.file
        perFileCounts.set(parentPath, (perFileCounts.get(parentPath) || 0) + 1)
        allHits.push({ ...h, file: parentPath })
      }
    }
    allHits.sort((a, b) => {
      const cDiff = (perFileCounts.get(b.file) || 0) - (perFileCounts.get(a.file) || 0)
      if (cDiff !== 0) return cDiff
      if (a.file !== b.file) return a.file.localeCompare(b.file)
      return a.line - b.line
    })
    area.hits_top = allHits.slice(0, HITS_PER_AREA_CAP)
    area.grep_cmd = cmds.join(' && ')
    if (anyError) area.skipped_reason = 'grep_failed'
    budget.grep_budget_left -= area.hits_top.length
    areas.push(area)
  }

  return { identifiers: identifiers.length > 0 ? identifiers : [], areas }
}

function groupFilesBySubmodule(files, submodules) {
  const byKey = new Map()
  for (const f of files) {
    const tgt = resolveGitTarget(f, submodules)
    const key = tgt.submodule || ''
    if (!byKey.has(key)) {
      byKey.set(key, { submodule: tgt.submodule, cwd: tgt.cwd, relativeFiles: [] })
    }
    byKey.get(key).relativeFiles.push(tgt.relativePath)
  }
  return [...byKey.values()]
}

function dedupCommits(lists) {
  const seen = new Set()
  const out = []
  let total = 0
  for (const list of lists) {
    total += list.total
    for (const c of list.commits) {
      if (seen.has(c.sha)) continue
      seen.add(c.sha)
      out.push(c)
      if (out.length >= COMMIT_CAP) return { commits: out, total }
    }
  }
  return { commits: out, total }
}

async function buildCodeDiffEntry(entry, submodules, budget) {
  const fileList = []
  const commitLists = []
  for (const f of entry.codeFiles) {
    const tgt = resolveGitTarget(f.path, submodules)
    const since = f.sinceCommit
    const latest = f.latestCommit || null

    const entryBudgetLeft = PER_ENTRY_LINE_CAP - (budget.entryUsed || 0)
    const totalBudgetLeft = TOTAL_LINE_CAP - budget.used_lines
    const canFetchDiff = entryBudgetLeft > 0 && totalBudgetLeft > 0

    const fileObj = {
      path: f.path,
      submodule: tgt.submodule,
      isShared: tgt.isShared,
      since,
      ...(latest && { latest }),
      ...(f.renamedFrom && { renamed: true, renamedFrom: f.renamedFrom })
    }

    if (canFetchDiff) {
      const res = await fetchFileDiff({ cwd: tgt.cwd, submodule: tgt.submodule,
        since, latest, relativePath: tgt.relativePath })
      fileObj.stat = res.stat
      fileObj.diff = res.diff
      fileObj.diff_lines = res.lines
      fileObj.truncated = res.truncated
      fileObj.binary = res.binary
      fileObj.cmd = res.cmd
      if (res.error) fileObj.error = res.error
      if (!res.binary && res.lines > 0) {
        budget.used_lines += res.lines
        budget.entryUsed = (budget.entryUsed || 0) + res.lines
      }
    } else {
      fileObj.stat = null
      fileObj.diff = null
      fileObj.diff_lines = 0
      fileObj.truncated = true
      fileObj.binary = false
      fileObj.cmd = f.renamedFrom
        ? buildFollowCmd({ submodule: tgt.submodule, since, latest, relativePath: tgt.relativePath })
        : buildCmd({ submodule: tgt.submodule, op: 'diff', since, latest, relativePath: tgt.relativePath })
      budget.skipped.push({ kind: 'code', key: `${entry.kbTarget} :: ${f.path}`, reason: 'budget', cmd: fileObj.cmd })
    }
    // v2: renamed files get --follow-aware cmd so re-fetch traces the rename.
    if (f.renamedFrom && canFetchDiff) {
      fileObj.cmd = buildFollowCmd({ submodule: tgt.submodule, since, latest, relativePath: tgt.relativePath })
    }

    const subj = await fetchCommitSubjects({ cwd: tgt.cwd, submodule: tgt.submodule,
      since, latest, relativePath: tgt.relativePath })
    commitLists.push(subj)

    fileList.push(fileObj)
  }
  const { commits, total } = dedupCommits(commitLists)
  return { kb_target: entry.kbTarget, commits, total_commits: total, files: fileList }
}

async function buildKbDiffEntry(entry, budget, submodules) {
  const relativePath = path.posix.join(KB_ROOT, entry.kbFile)
  const since = entry.sinceCommit
  const latest = entry.latestCommit || null
  const obj = {
    kb_file: entry.kbFile,
    since,
    ...(latest && { latest }),
    ...(entry.renamedFrom && { renamed: true, renamedFrom: entry.renamedFrom })
  }

  const totalBudgetLeft = TOTAL_LINE_CAP - budget.used_lines
  if (totalBudgetLeft > 0 && since) {
    const res = await fetchFileDiff({ cwd: process.cwd(), submodule: null,
      since, latest, relativePath })
    obj.stat = res.stat
    obj.diff = res.diff
    obj.diff_lines = res.lines
    obj.truncated = res.truncated
    obj.binary = res.binary
    obj.cmd = res.cmd
    if (res.error) obj.error = res.error
    if (!res.binary && res.lines > 0) budget.used_lines += res.lines
  } else {
    obj.stat = null
    obj.diff = null
    obj.diff_lines = 0
    obj.truncated = true
    obj.binary = false
    obj.cmd = since ? buildCmd({ submodule: null, op: 'diff', since, latest, relativePath }) : null
    if (since) budget.skipped.push({ kind: 'kb', key: entry.kbFile, reason: 'budget', cmd: obj.cmd })
  }

  if (since) {
    const subj = await fetchCommitSubjects({ cwd: process.cwd(), submodule: null,
      since, latest, relativePath })
    obj.commits = subj.commits
    obj.total_commits = subj.total
  } else {
    obj.commits = []
    obj.total_commits = 0
  }

  // v2: identifier extraction + glob expansion + grep intersection.
  // Skip when the KB diff is empty, binary, or missing — no signal to extract.
  if (obj.diff && !obj.binary && entry.codeAreas && entry.codeAreas.length > 0) {
    const { identifiers, areas } = await buildCodeAreasPayload({
      diffText: obj.diff,
      codeAreas: entry.codeAreas,
      submodules: submodules || [],
      budget
    })
    if (identifiers !== null) obj.changed_identifiers = identifiers
    if (areas !== null) obj.code_areas = areas
  }
  return obj
}

async function buildDiffsPayload({ codeState, kbState, submodules }) {
  const budget = { used_lines: 0, cap_lines: TOTAL_LINE_CAP, skipped: [],
    grep_budget_left: GREP_BUDGET_TOTAL }
  const code = []
  for (const entry of codeState.entries) {
    budget.entryUsed = 0
    code.push(await buildCodeDiffEntry(entry, submodules, budget))
  }
  const kb = []
  for (const entry of kbState.entries) {
    const hadRoom = TOTAL_LINE_CAP - budget.used_lines > 0
    if (!hadRoom) {
      // No budget left: emit command-only record.
      const relativePath = path.posix.join(KB_ROOT, entry.kbFile)
      const cmd = entry.sinceCommit ? buildCmd({ submodule: null, op: 'diff',
        since: entry.sinceCommit, latest: entry.latestCommit || null, relativePath }) : null
      kb.push({ kb_file: entry.kbFile, since: entry.sinceCommit || null,
        ...(entry.latestCommit && { latest: entry.latestCommit }),
        stat: null, diff: null, diff_lines: 0, truncated: true, binary: false,
        cmd, commits: [], total_commits: 0 })
      if (cmd) budget.skipped.push({ kind: 'kb', key: entry.kbFile, reason: 'budget', cmd })
      continue
    }
    kb.push(await buildKbDiffEntry(entry, budget, submodules))
  }
  delete budget.entryUsed
  delete budget.grep_budget_left
  return { code, kb, budget }
}

// Submodule detection lives in lib/submodule-sweep.js so conform.js can reuse
// the same parser. Keep a thin local alias to preserve drift.js's call sites.
async function detectSubmodules() {
  return detectSubmodulesHelper(process.cwd())
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_drift',
    description: 'Bidirectional drift detection. Phase 1: writes entries to sync/code-drift.md (keyed by KB target, tracks all code files + since-commit) and sync/kb-drift.md (keyed by KB file). Multiple commits accumulate automatically. The response includes `_diffs` with pre-fetched unified diffs, stats, and commit subjects for every open entry — read those directly before resolving. Phase 2: summaries=KB updated (closes code-drift.md), reverted=code file reverted (closes code-drift.md), kb_confirmed=kb→code reviewed (closes kb-drift.md), dismiss=close a structurally-broken ghost entry whose kb_target/kb_file will never exist (logged separately as DISMISSED in the audit trail — use this when an upstream code_path_patterns rule produced a garbage name rather than hand-editing the queue file). Phase 2 responses include `closed` (what was actually removed) and `not_found` (inputs that matched no open entry, with a `hint` when the input matches the *other* queue — i.e. you called the wrong phase). When anything lands in `not_found`, an `error` field is set; trust `closed`, not the top-level count, to know what was written.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Commit SHA or "last-sync"', default: 'last-sync' },
        summaries: { type: 'array', description: 'Phase 2a: code correct — write KB notes and close code-drift.md entries', items: { type: 'object', properties: { kb_target: { type: 'string' }, summary: { type: 'string' } }, required: ['kb_target', 'summary'] } },
        reverted: { type: 'array', description: 'Phase 2b: code reverted — close code-drift.md entries without writing KB notes', items: { type: 'object', properties: { code_file: { type: 'string' } }, required: ['code_file'] } },
        kb_confirmed: { type: 'array', description: 'Phase 2c: kb→code reviewed — close kb-drift.md entries', items: { type: 'object', properties: { kb_file: { type: 'string' } }, required: ['kb_file'] } },
        dismiss: { type: 'array', description: 'Phase 2d: close a structurally-broken ghost entry (kb_target/kb_file that points at a file that will never exist, typically because an upstream code_path_patterns rule captured a versioned/timestamped basename). Use the exact entry heading as `queue_key` and a human-readable `reason`. Logged as DISMISSED separately from RESOLVED so dismissals remain visible as a signal that upstream rules need attention.', items: { type: 'object', properties: { queue: { type: 'string', enum: ['code-drift', 'kb-drift'], description: 'Which queue the entry lives in.' }, queue_key: { type: 'string', description: 'Exact entry heading as it appears in the queue file (kb_target for code-drift, kb_file for kb-drift).' }, reason: { type: 'string', description: 'Why this entry cannot be resolved the normal way.' } }, required: ['queue', 'queue_key', 'reason'] } },
        acknowledge: { type: 'array', description: 'Phase 2e: stamp an entry as author-vetted ("real change, doesn\'t affect KB") without removing it. Renders as an `**Acknowledged**: @author at SHA — "reason"` badge on the entry block. The entry stays in the queue; a later resolving verdict (summaries / reverted / kb_confirmed / dismiss) overrides.', items: { type: 'object', properties: { queue: { type: 'string', enum: ['code-drift', 'kb-drift'] }, queue_key: { type: 'string' }, reason: { type: 'string' } }, required: ['queue', 'queue_key', 'reason'] } },
        force_baseline: { type: 'string', description: 'Admin escape hatch: reset both queue baselines to this SHA (or "HEAD"). Use when the queue has gone stale and needs a manual reset.' },
        purge: { type: 'boolean', description: 'With force_baseline: also clear all queue entries. Default: false.' },
        include_diffs: { type: 'boolean', description: 'Include `_diffs` with pre-fetched git diffs, stats, and commit subjects for every open entry. Default: true. Set false for quick status scans.', default: true },
        readonly: { type: 'boolean', description: 'Compute results in memory but skip every fs write (queue files, drift-log, baseline advance). Returned `_state` carries the would-have-written entries. Used by the live watcher in the extension and the soft-mode CI check.', default: false }
      }
    }
  }
}
