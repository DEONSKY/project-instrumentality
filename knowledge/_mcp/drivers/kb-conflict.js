#!/usr/bin/env node
// kb-conflict git merge driver
// Called by git when KB content files (features/, flows/, _rules.md) have merge conflicts.
// Writes conflict markers clearly and exits 1 — the user sees the conflict and must resolve it.
// Also appends an entry to sync/review-queue.md for team tracking.
//
// Git calls: driver %O %A %B %L %P

const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const [,, ancestor, ours, theirs, markerSize, filePath] = process.argv

function main() {
  try {
    const oursContent = fs.readFileSync(ours, 'utf8')
    const theirsContent = fs.readFileSync(theirs, 'utf8')
    const ancestorContent = fs.existsSync(ancestor) ? fs.readFileSync(ancestor, 'utf8') : ''

    const marker = markerSize ? parseInt(markerSize) : 7
    const sep = '='.repeat(marker)
    const ourMarker = '<'.repeat(marker) + ' ours'
    const theirMarker = '>'.repeat(marker) + ' theirs'
    const ancMarker = '|'.repeat(marker) + ' ancestor'

    // Write conflict markers to the ours slot (git will use this as the result)
    const conflictContent = [
      ourMarker,
      oursContent.trim(),
      ancMarker,
      ancestorContent.trim(),
      sep,
      theirsContent.trim(),
      theirMarker
    ].join('\n')

    fs.writeFileSync(ours, conflictContent, 'utf8')

    // Append to review-queue.md
    appendToReviewQueue(filePath, oursContent, theirsContent)

    process.exit(1)
  } catch (err) {
    console.error('[kb-conflict] Error:', err.message)
    process.exit(1)
  }
}

function appendToReviewQueue(filePath, oursContent, theirsContent) {
  try {
    const kbRoot = findKbRoot()
    const reviewQueuePath = path.join(kbRoot, 'sync/review-queue.md')
    const id = uuidv4()
    const timestamp = new Date().toISOString()

    const entry = [
      '',
      `### conflict:${id}`,
      `file: ${filePath}`,
      `timestamp: ${timestamp}`,
      `type: merge-conflict`,
      `status: unresolved`,
      ''
    ].join('\n')

    const header = fs.existsSync(reviewQueuePath)
      ? ''
      : `# Review Queue\n\nUnresolved conflicts and drift items requiring attention.\n`

    fs.appendFileSync(reviewQueuePath, header + entry)
  } catch (err) {
    // Non-fatal — conflict markers are already written
    console.error('[kb-conflict] Could not write to review-queue:', err.message)
  }
}

function findKbRoot() {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'knowledge')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.join(process.cwd(), 'knowledge')
}

main()
