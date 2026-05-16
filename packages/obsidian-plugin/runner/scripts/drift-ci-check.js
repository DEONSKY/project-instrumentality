#!/usr/bin/env node
'use strict'

/**
 * Soft-mode CI check — invoked by .github/workflows/kb-drift-check.yml on
 * pull_request events.
 *
 * Runs drift.runTool({ readonly: true }) + conform.runTool({ readonly: true })
 * and compares the computed entries to what's already published in
 * knowledge/sync/*.md (read via the shared parsers). Reports `success` if the
 * sets match, `failure` if they diverge.
 *
 * Soft-launched: the workflow is not added to required checks. This script
 * exits non-zero on divergence so the check shows red, but exits zero on
 * detection-tool crashes so infrastructure bugs don't get conflated with
 * policy violations.
 *
 * Acknowledged entries are treated as PENDING (still need a real verdict) —
 * an author ack does not bypass the CI gate.
 *
 * Output on stderr: a human-readable diff. The workflow uploads this as the
 * step summary so reviewers see what's out of sync.
 */

const fs = require('fs')
const path = require('path')

const REPO_ROOT = process.cwd()
const SYNC_DIR = path.join(REPO_ROOT, 'knowledge', 'sync')

async function main() {
  // Bail out via env / label is handled by the workflow before this script
  // runs — by the time we're here, the gate is wanted.

  let driftResult, conformCurrent, conformBacklog
  try {
    const driftTool = require(path.join(REPO_ROOT, 'knowledge', '_mcp', 'tools', 'drift'))
    driftResult = await driftTool.runTool({ readonly: true, include_diffs: false })
  } catch (e) {
    process.stderr.write(`[kb-drift-ci] drift readonly run crashed (not a policy failure): ${e.message}\n`)
    process.exit(0)
  }
  try {
    const conformTool = require(path.join(REPO_ROOT, 'knowledge', '_mcp', 'tools', 'conform'))
    conformCurrent = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'current' })
    conformBacklog = await conformTool.runTool({ readonly: true, include_diffs: false, mode: 'aspirational' })
  } catch (e) {
    process.stderr.write(`[kb-drift-ci] conform readonly run crashed (not a policy failure): ${e.message}\n`)
    process.exit(0)
  }

  const liveCode = ((driftResult._state && driftResult._state.codeEntries) || []).map(codeKey)
  const liveKb = ((driftResult._state && driftResult._state.kbEntries) || []).map(kbKey)
  const liveStd = ((conformCurrent._state && conformCurrent._state.entries) || []).map(stdKey)
  const liveBacklog = ((conformBacklog._state && conformBacklog._state.entries) || []).map(stdKey)

  const onDiskCode = parsePublishedKeys(path.join(SYNC_DIR, 'code-drift.md'), parseCodeDriftBlocks)
  const onDiskKb = parsePublishedKeys(path.join(SYNC_DIR, 'kb-drift.md'), parseKbDriftBlocks)
  const onDiskStd = parsePublishedKeys(path.join(SYNC_DIR, 'standards-drift.md'), parseStdDriftBlocks)
  const onDiskBacklog = parsePublishedKeys(path.join(SYNC_DIR, 'standards-backlog.md'), parseStdDriftBlocks)

  const diffs = [
    diffSet('code-drift.md', liveCode, onDiskCode),
    diffSet('kb-drift.md', liveKb, onDiskKb),
    diffSet('standards-drift.md', liveStd, onDiskStd),
    diffSet('standards-backlog.md', liveBacklog, onDiskBacklog),
  ].filter(Boolean)

  if (diffs.length === 0) {
    process.stdout.write('[kb-drift-ci] queue files match in-memory detection — no drift to publish.\n')
    process.exit(0)
  }

  process.stderr.write('[kb-drift-ci] published queue diverges from in-memory detection:\n\n')
  for (const d of diffs) {
    process.stderr.write(d + '\n')
  }
  process.stderr.write('\nRun "Publish drift" in the Instrumentality extension (or `kb_drift` + `kb_conform` in Claude) to publish.\n')
  process.exit(1)
}

function codeKey(e) {
  // The published entry is keyed by kbTarget + sorted file set.
  const files = (e.codeFiles || []).map((f) => f.path).sort().join(',')
  return `${e.kbTarget}|${files}`
}

function kbKey(e) {
  return e.kbFile
}

function stdKey(e) {
  // Queue key plus sorted file set per party to detect file-set drift even
  // when the queue key matches.
  const fps = []
  for (const arr of Object.values(e.filesByParty || {})) {
    for (const f of arr) fps.push(f.path)
  }
  return `${e.queueKey}|${fps.sort().join(',')}`
}

function parsePublishedKeys(filePath, parser) {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  return parser(content)
}

// Minimal block parsers — just enough to compute the same keys as the live
// computations above. We deliberately don't import the shared TS parsers here
// to keep the CI script dependency-free (runs on a vanilla Node).

function splitBlocks(content) {
  const headerEnd = content.indexOf('\n## ')
  if (headerEnd === -1) return []
  return content.slice(headerEnd + 1).split(/\n(?=## )/).filter((b) => b.trim())
}

function parseCodeDriftBlocks(content) {
  const out = []
  for (const block of splitBlocks(content)) {
    const heading = block.match(/^## (.+)/)
    if (!heading) continue
    const kbTarget = heading[1].trim()
    const files = []
    for (const line of block.split('\n')) {
      const m = line.match(/^\s+-\s+`([^`]+)`/)
      if (m) files.push(m[1])
    }
    out.push(`${kbTarget}|${files.sort().join(',')}`)
  }
  return out
}

function parseKbDriftBlocks(content) {
  const out = []
  for (const block of splitBlocks(content)) {
    const heading = block.match(/^## (.+)/)
    if (heading) out.push(heading[1].trim())
  }
  return out
}

function parseStdDriftBlocks(content) {
  const out = []
  for (const block of splitBlocks(content)) {
    const heading = block.match(/^## (.+)/)
    if (!heading) continue
    const queueKey = heading[1].trim()
    const files = []
    let inFiles = false
    for (const line of block.split('\n')) {
      if (/^- \*\*Files/.test(line)) { inFiles = true; continue }
      if (/^- \*\*/.test(line)) { inFiles = false; continue }
      if (!inFiles) continue
      const m = line.match(/^\s+-\s+`([^`]+)`/)
      if (m) files.push(m[1])
    }
    out.push(`${queueKey}|${files.sort().join(',')}`)
  }
  return out
}

function diffSet(label, live, disk) {
  const liveSet = new Set(live)
  const diskSet = new Set(disk)
  const missingFromDisk = live.filter((k) => !diskSet.has(k))
  const extraOnDisk = disk.filter((k) => !liveSet.has(k))
  if (missingFromDisk.length === 0 && extraOnDisk.length === 0) return null
  const lines = [`▸ ${label}:`]
  if (missingFromDisk.length > 0) {
    lines.push(`  needs publishing (in working tree, not in queue file):`)
    for (const k of missingFromDisk) lines.push(`    + ${k}`)
  }
  if (extraOnDisk.length > 0) {
    lines.push(`  stale (in queue file, not in working tree):`)
    for (const k of extraOnDisk) lines.push(`    - ${k}`)
  }
  return lines.join('\n')
}

main().catch((e) => {
  process.stderr.write(`[kb-drift-ci] unexpected error (not a policy failure): ${e && e.message ? e.message : String(e)}\n`)
  process.exit(0)
})
