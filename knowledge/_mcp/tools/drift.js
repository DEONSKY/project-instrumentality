const fs = require('fs')
const path = require('path')
const simpleGit = require('simple-git')
const { loadRules } = require('../lib/rules')
const { loadGraph, saveGraph } = require('../lib/graph')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: reindex } = require('./reindex')

const KB_ROOT = 'knowledge'

/**
 * kb_drift — Two-phase drift detection. Supports plain repos and git submodule monorepos.
 *
 * Phase 1 (no summaries): Classify changed code files against code_path_patterns.
 *   Detects changes in the main repo AND in any git submodules (.gitmodules).
 *   Returns { manifests, prompts } — the calling agent processes the prompts
 *   and generates summaries, then calls kb_drift({ summaries }) to write notes.
 *
 * Phase 2 (with summaries): Write notes to _index.yaml.
 *   summaries: [{ kb_target, summary }]
 */
async function runTool({ since = 'last-sync', summaries } = {}) {
  // ── Phase 2: write notes from agent-generated summaries ───────────────────
  if (summaries && Array.isArray(summaries)) {
    return applyDriftSummaries(summaries)
  }

  // ── Phase 1: classify changed files, return prompts for agent ──────────────
  const mainGit = simpleGit(process.cwd())
  const rules = loadRules(KB_ROOT)
  const ref = since === 'last-sync' ? 'HEAD~1' : since

  // Collect changed files from main repo + all submodules
  let changedEntries = [] // [{ file, git, localFile }]

  try {
    const mainFiles = await getChangedFiles(mainGit, ref)
    changedEntries.push(...mainFiles.map(f => ({ file: f, git: mainGit, localFile: f })))
  } catch (e) {
    return { notes_written: 0, manifests: [], error: e.message }
  }

  const submodules = await detectSubmodules()
  for (const sub of submodules) {
    try {
      const subGit = simpleGit(sub.fullPath)
      const subFiles = await getChangedFiles(subGit, ref)
      changedEntries.push(...subFiles.map(f => ({
        file: `${sub.path}/${f}`,  // prefix with submodule path for pattern matching
        git: subGit,
        localFile: f               // local path within the submodule for diffs
      })))
    } catch {
      // submodule may not have enough history — skip silently
    }
  }

  const patterns = rules.getCodePathPatterns()
  const manifests = []

  for (const entry of changedEntries) {
    if (entry.file.startsWith('knowledge/')) continue
    const match = matchPattern(entry.file, patterns)
    if (!match) continue
    const kbTarget = resolveKbTarget(match, entry.file)
    manifests.push({ code_file: entry.file, kb_target: kbTarget, intent: match.intent, _entry: entry })
  }

  if (manifests.length === 0) {
    const submoduleInfo = submodules.length > 0 ? ` (checked ${submodules.length} submodule(s): ${submodules.map(s => s.path).join(', ')})` : ''
    return { notes_written: 0, manifests: [], message: `No code changes matched KB targets.${submoduleInfo}` }
  }

  // One prompt per unique kb_target
  const uniqueTargets = [...new Map(manifests.map(m => [m.kb_target, m])).values()]
  const prompts = []

  for (const manifest of uniqueTargets) {
    const kbFilePath = path.join(KB_ROOT, manifest.kb_target)
    if (!fs.existsSync(kbFilePath)) continue

    const kbContent = fs.readFileSync(kbFilePath, 'utf8')

    let codeDiff = ''
    try {
      // Use the git instance that owns this file (main repo or submodule)
      const { git, localFile } = manifest._entry
      codeDiff = await git.diff([ref, 'HEAD', '--', localFile])
    } catch (e) {
      codeDiff = `(diff unavailable: ${e.message})`
    }

    const prompt = resolvePrompt('drift-summary', {
      kb_file: manifest.kb_target,
      kb_content: kbContent.slice(0, 1500),
      code_file: manifest.code_file,
      code_diff: codeDiff.slice(0, 2000),
      intent: manifest.intent
    })

    if (prompt) {
      prompts.push({ kb_target: manifest.kb_target, code_file: manifest.code_file, prompt })
    }
  }

  // Strip internal _entry before returning
  const cleanManifests = manifests.map(({ _entry, ...rest }) => rest)

  return {
    manifests: cleanManifests,
    prompts,
    submodules_checked: submodules.map(s => s.path),
    _instruction: [
      'For each entry in prompts[], read the prompt and generate a 1-sentence drift summary.',
      'Then call kb_drift({ summaries: [{ kb_target, summary }] }) to write the notes.'
    ].join(' ')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getChangedFiles(git, ref) {
  const result = await git.diff(['--name-only', ref, 'HEAD'])
  return result.split('\n').filter(f => f.trim())
}

/**
 * Parse .gitmodules and return submodule descriptors.
 * Returns [] if no .gitmodules exists or it has no valid entries.
 */
async function detectSubmodules() {
  const gitmodulesPath = path.join(process.cwd(), '.gitmodules')
  if (!fs.existsSync(gitmodulesPath)) return []

  const content = fs.readFileSync(gitmodulesPath, 'utf8')
  const submodules = []

  for (const match of content.matchAll(/\[submodule\s+"([^"]+)"\][^\[]*path\s*=\s*(.+)/g)) {
    const subPath = match[2].trim()
    const fullPath = path.join(process.cwd(), subPath)
    if (fs.existsSync(fullPath)) {
      submodules.push({ name: match[1].trim(), path: subPath, fullPath })
    }
  }

  return submodules
}

async function applyDriftSummaries(summaries) {
  const git = simpleGit(process.cwd())
  const graph = loadGraph(KB_ROOT)

  let log
  try {
    log = await git.log({ maxCount: 1 })
  } catch {
    log = { latest: null }
  }

  const latestCommit = (log && log.latest) ? log.latest : null
  const commitRef = latestCommit
    ? `${latestCommit.hash.slice(0, 7)} ${latestCommit.date.split('T')[0]} @${latestCommit.author_name}`
    : 'unknown'

  let notesWritten = 0

  for (const { kb_target, summary } of summaries) {
    if (!summary || !kb_target) continue

    const fileEntry = (graph.files || {})[kb_target]
    const codeCommit = fileEntry ? (fileEntry.last_synced_commit || 'unknown') : 'unknown'

    const note = {
      id: `${latestCommit ? latestCommit.hash.slice(0, 7) : 'unknown'}-${Date.now()}-${notesWritten}`,
      direction: 'code→kb',
      kb_commit: commitRef,
      code_commit: codeCommit,
      summary: summary.trim().slice(0, 200)
    }

    if (!graph.files[kb_target]) {
      graph.files[kb_target] = { id: kb_target, sync_state: 'code-ahead', notes: [] }
    }
    if (!graph.files[kb_target].notes) {
      graph.files[kb_target].notes = []
    }
    graph.files[kb_target].notes.push(note)
    graph.files[kb_target].sync_state = 'code-ahead'
    notesWritten++
  }

  if (notesWritten > 0) {
    saveGraph(graph, KB_ROOT)
    await reindex({ silent: true })
  }

  return { notes_written: notesWritten }
}

function matchPattern(codeFile, patterns) {
  for (const pattern of patterns) {
    const paths = pattern.paths || []
    for (const p of paths) {
      if (globMatch(codeFile, p)) return pattern
    }
  }
  return null
}

function resolveKbTarget(pattern, codeFile) {
  let target = pattern.kb_target
  if (target.includes('{name}')) {
    const name = extractName(codeFile, pattern.name_extraction || {})
    target = target.replace('{name}', name)
  }
  return target
}

function extractName(filePath, nameExtraction) {
  let name = path.basename(filePath, path.extname(filePath))
  const suffixes = nameExtraction.strip_suffix || []
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) { name = name.slice(0, -suffix.length); break }
  }
  if (nameExtraction.case === 'kebab') {
    name = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/-+/g, '-')
  }
  return name
}

function globMatch(filePath, pattern) {
  const regexStr = pattern
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '[^/]')
  try {
    return new RegExp(`^${regexStr}$`).test(filePath)
  } catch {
    return filePath.includes(pattern.replace(/\*/g, ''))
  }
}

module.exports = { runTool }
