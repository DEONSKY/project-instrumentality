const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const KB_ROOT = 'knowledge'
const DRIFT_LOG_DIR = path.join(KB_ROOT, 'sync/drift-log')
const DEFAULT_LIMIT = 20
const EXCERPT_MAX = 300

// ── git side ───────────────────────────────────────────────────────────────

function runGit(args) {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
  }
}

// Use a unit-separator char between log fields so commit subjects with pipes/colons don't confuse the parser.
// The record separator is placed at the START of each commit so numstat lines (which follow the header)
// can't be mistaken for phantom records when splitting.
const FIELD_SEP = '\x1f'
const RECORD_START = '\x1e'
const LOG_FORMAT = RECORD_START + ['%H', '%h', '%ad', '%an', '%s'].join(FIELD_SEP)

function collectCommits(file, { limit, since, includeDiff }) {
  const args = [
    'log',
    '--follow',
    '--numstat',
    `--pretty=format:${LOG_FORMAT}`,
    '--date=short',
    `-n`, String(limit)
  ]
  if (since) args.push(`--since=${since}`)
  if (includeDiff) args.push('-p')
  args.push('--', file)

  const raw = runGit(args)
  if (!raw.trim()) return []

  return parseLog(raw, includeDiff)
}

function parseLog(raw, includeDiff) {
  // First chunk is empty (before the first RECORD_START); drop it.
  const records = raw.split(RECORD_START).slice(1)
  const commits = []

  for (const record of records) {
    const [header, ...rest] = record.split('\n')
    const [sha, shortSha, date, author, subject] = header.split(FIELD_SEP)
    if (!sha) continue

    const body = rest.join('\n')
    const { fileChanges, patch } = splitNumstatFromPatch(body, includeDiff)

    const commit = { sha: shortSha, full_sha: sha, date, author, subject, file_changes: fileChanges }
    if (includeDiff && patch) commit.patch = patch
    commits.push(commit)
  }

  return commits
}

// numstat lines look like: "12\t3\tpath/to/file" — one line per file touched in the commit.
// When -p is on, the diff blocks follow after the numstat block (separated by a blank line).
function splitNumstatFromPatch(body, includeDiff) {
  const lines = body.split('\n')
  const numstatLines = []
  let i = 0
  while (i < lines.length && /^\d+\t\d+\t/.test(lines[i])) {
    numstatLines.push(lines[i])
    i++
  }
  const added = numstatLines.reduce((a, l) => a + Number(l.split('\t')[0] || 0), 0)
  const removed = numstatLines.reduce((a, l) => a + Number(l.split('\t')[1] || 0), 0)
  const fileChanges = numstatLines.length ? `+${added} -${removed}` : null

  if (!includeDiff) return { fileChanges }
  const patch = lines.slice(i).join('\n').trim()
  return { fileChanges, patch: patch || null }
}

// ── drift-log side ─────────────────────────────────────────────────────────

function collectDriftMentions(file) {
  if (!fs.existsSync(DRIFT_LOG_DIR)) return []

  const logFiles = fs.readdirSync(DRIFT_LOG_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(DRIFT_LOG_DIR, f))

  const needles = buildSearchNeedles(file)
  const mentions = []

  for (const logFile of logFiles) {
    const content = fs.readFileSync(logFile, 'utf8')
    const sections = splitSections(content)
    for (const section of sections) {
      if (needles.some(n => section.body.toLowerCase().includes(n))) {
        mentions.push({
          path: logFile,
          section: section.heading,
          excerpt: truncate(section.body.trim(), EXCERPT_MAX)
        })
      }
    }
  }

  return mentions
}

function buildSearchNeedles(file) {
  const needles = new Set()
  const lower = file.toLowerCase()
  needles.add(lower)
  needles.add(lower.replace(/^knowledge\//, ''))
  const base = path.basename(file, path.extname(file)).toLowerCase()
  if (base) needles.add(base)
  return [...needles].filter(Boolean)
}

function splitSections(markdown) {
  const lines = markdown.split('\n')
  const sections = []
  let current = { heading: null, body: '' }
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (current.heading !== null || current.body.trim()) sections.push(current)
      current = { heading: line.replace(/^#+\s+/, '').trim(), body: '' }
    } else {
      current.body += line + '\n'
    }
  }
  if (current.heading !== null || current.body.trim()) sections.push(current)
  return sections
}

function truncate(text, max) {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

// ── entry ──────────────────────────────────────────────────────────────────

function resolveFile(file) {
  if (!file) return { error: 'file is required' }
  if (fs.existsSync(file)) return { file }
  const withPrefix = file.startsWith(KB_ROOT + '/') ? file : path.join(KB_ROOT, file)
  if (fs.existsSync(withPrefix)) return { file: withPrefix }
  // File may have been renamed; --follow can still trace it. Only hard-fail if neither path exists AND git has no history for it.
  return { file, warning: `file not found on disk: ${file} — git --follow may still return history if it was renamed` }
}

async function runTool({ file, limit, since, include_diff } = {}) {
  const resolved = resolveFile(file)
  if (resolved.error) return { error: resolved.error }

  const effectiveLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 200))
  const includeDiff = Boolean(include_diff)

  let commits
  try {
    commits = collectCommits(resolved.file, { limit: effectiveLimit, since, includeDiff })
  } catch (err) {
    return { error: err.message }
  }

  const driftMentions = collectDriftMentions(resolved.file)

  const result = {
    file: resolved.file,
    commits,
    drift_log_mentions: driftMentions
  }
  if (resolved.warning && commits.length === 0) result.warning = resolved.warning
  return result
}

module.exports = {
  runTool,
  // exported for tests
  parseLog,
  splitSections,
  buildSearchNeedles,
  definition: {
    name: 'kb_history',
    description: 'Get the change history of a KB file: git commits that touched it + any drift-log entries that reference it. Call this when a decision depends on why or when something changed — not for routine reads.',
    inputSchema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', description: 'KB file path (e.g. knowledge/decisions/auth.md or decisions/auth.md)' },
        limit: { type: 'number', description: `Max number of commits (default: ${DEFAULT_LIMIT}, max 200)` },
        since: { type: 'string', description: 'ISO date filter, e.g. "2026-01-01"' },
        include_diff: { type: 'boolean', description: 'Include patch bodies. Off by default to save tokens.' }
      }
    }
  }
}
