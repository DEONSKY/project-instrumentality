#!/usr/bin/env node
'use strict'

/**
 * Live-status runner for the extension's watcher and the soft-mode CI check.
 *
 * Calls drift.runTool({ readonly: true }) and conform.runTool({ readonly: true })
 * and prints the computed entry sets as JSON to stdout. Skips include_diffs to
 * keep the payload bounded — the live UI just needs entry counts + per-file
 * since/latest/author, not the unified-diff content.
 *
 * Invoked from packages/shared/src/status.ts when getStatus({ live: true })
 * fires. CWD must be the parent repo (the runner reads knowledge/sync/* via
 * the existing tool modules, which assume process.cwd() === parent root).
 *
 * Exits 0 on success with JSON on stdout. On internal failure prints a JSON
 * envelope `{ error: "..." }` and still exits 0 so the watcher can show the
 * disk-read fallback rather than crashing.
 */

const path = require('path')

async function main() {
  let driftResult, conformResult, backlogResult
  try {
    const driftTool = require(path.join(__dirname, '..', 'tools', 'drift'))
    driftResult = await driftTool.runTool({ readonly: true, include_diffs: false })
  } catch (e) {
    return emit({ error: `drift readonly failed: ${e.message}` })
  }
  try {
    const conformTool = require(path.join(__dirname, '..', 'tools', 'conform'))
    conformResult = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'current' })
    backlogResult = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'aspirational' })
  } catch (e) {
    return emit({ error: `conform readonly failed: ${e.message}` })
  }

  const codeEntries = (driftResult && driftResult._state && driftResult._state.codeEntries) || []
  const kbEntries = (driftResult && driftResult._state && driftResult._state.kbEntries) || []
  const standardsEntries = (conformResult && conformResult._state && conformResult._state.entries) || []
  const backlogEntries = (backlogResult && backlogResult._state && backlogResult._state.entries) || []
  const headSha = (driftResult && driftResult._state && driftResult._state.headSha) || null

  // Surface the code-path globs from `knowledge/_rules.md` so the extension
  // can scope its source-file watcher to the patterns the drift detector
  // actually cares about — fewer false wakeups, no second subprocess.
  let codePatterns = null
  try {
    const { loadRules } = require(path.join(__dirname, '..', 'lib', 'rules'))
    const patterns = loadRules().getCodePathPatterns()
    codePatterns = []
    if (Array.isArray(patterns)) {
      for (const entry of patterns) {
        if (entry && Array.isArray(entry.paths)) {
          for (const p of entry.paths) {
            if (typeof p === 'string' && p && !codePatterns.includes(p)) codePatterns.push(p)
          }
        }
      }
    }
  } catch { /* leave null — extension falls back to a workspace-wide watcher */ }

  emit({
    headSha,
    codeEntries,
    kbEntries,
    standardsEntries,
    backlogEntries,
    codePatterns
  })
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload))
}

main().catch((e) => emit({ error: e && e.message ? e.message : String(e) }))
