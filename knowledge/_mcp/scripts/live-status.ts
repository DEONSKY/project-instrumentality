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

import * as path from 'path'

// Extract a message from an unknown caught value without a bare `any`.
function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function main(): Promise<void> {
  let driftResult: Record<string, unknown>, conformResult: Record<string, unknown>, backlogResult: Record<string, unknown>
  // require (not static import) with __dirname-relative paths so the compiled
  // dist/scripts/live-status.js resolves the sibling compiled dist/tools/*.
  try {
    const driftTool = require(path.join(__dirname, '..', 'tools', 'drift')) as typeof import('../tools/drift')
    driftResult = await driftTool.runTool({ readonly: true, include_diffs: false })
  } catch (e) {
    return emit({ error: `drift readonly failed: ${errMessage(e)}` })
  }
  try {
    const conformTool = require(path.join(__dirname, '..', 'tools', 'conform')) as typeof import('../tools/conform')
    conformResult = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'current' })
    backlogResult = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'aspirational' })
  } catch (e) {
    return emit({ error: `conform readonly failed: ${errMessage(e)}` })
  }

  const driftState = driftResult._state as { codeEntries?: unknown[]; kbEntries?: unknown[]; headSha?: string | null } | undefined
  const conformState = conformResult._state as { entries?: unknown[] } | undefined
  const backlogState = backlogResult._state as { entries?: unknown[] } | undefined
  const codeEntries = (driftState && driftState.codeEntries) || []
  const kbEntries = (driftState && driftState.kbEntries) || []
  const standardsEntries = (conformState && conformState.entries) || []
  const backlogEntries = (backlogState && backlogState.entries) || []
  const headSha = (driftState && driftState.headSha) || null
  const patternAudit = driftResult.pattern_audit || null

  // Surface the code-path globs from `knowledge/_rules.md` so the extension
  // can scope its source-file watcher to the patterns the drift detector
  // actually cares about — fewer false wakeups, no second subprocess.
  let codePatterns: string[] | null = null
  try {
    const { loadRules } = require(path.join(__dirname, '..', 'lib', 'rules')) as typeof import('../lib/rules')
    const patterns = loadRules().getCodePathPatterns()
    codePatterns = []
    if (Array.isArray(patterns)) {
      for (const entry of patterns) {
        const paths = (entry as { paths?: unknown }).paths
        if (entry && Array.isArray(paths)) {
          for (const p of paths) {
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
    codePatterns,
    patternAudit
  })
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(payload))
}

main().catch((e) => emit({ error: errMessage(e) }))
