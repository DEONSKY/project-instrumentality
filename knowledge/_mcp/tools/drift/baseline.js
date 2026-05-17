// Baseline-SHA parsing, advancement, and ancestor math for the drift queues.
//
// Baseline SHA lives inside the queue header as an HTML comment. Queue files
// are merged with `merge=union` (.gitattributes), so after a branch merge the
// header can carry multiple baseline lines. parseBaseline returns the *last*
// one as a conservative default (unioned files append the incoming side after
// ours, so the later line is usually the descendant) and setBaseline strips
// all existing lines before inserting one. The post-merge hook runs
// dedupBaselines (lives in queue.js) to pick the true descendant when both
// survive.

const simpleGit = require('simple-git')

const BASELINE_RE = /<!--\s*baseline:\s*([a-f0-9]+)\s*-->/gi

function parseBaseline(header) {
  const matches = [...header.matchAll(BASELINE_RE)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}

function setBaseline(header, sha) {
  const stripped = header.replace(BASELINE_RE, '').replace(/\n{3,}/g, '\n\n')
  if (/<!-- AUTO-GENERATED[^\n]*-->\n/.test(stripped)) {
    return stripped.replace(/(<!-- AUTO-GENERATED[^\n]*-->\n)/, `$1<!-- baseline: ${sha} -->\n`)
  }
  return `<!-- baseline: ${sha} -->\n` + stripped
}

async function isAncestor(git, ancestor, descendant) {
  try {
    const aFull = (await git.raw(['rev-parse', '--verify', `${ancestor}^{commit}`])).trim()
    const mb = (await git.raw(['merge-base', ancestor, descendant])).trim()
    return mb === aFull
  } catch { return false }
}

// Given a list of SHAs, return the one that is a descendant of all others
// (pairwise). Returns null if the set is empty or if any pair has diverged
// history. Unlike dedupBaselines, this helper refuses to pick on divergence —
// callers that must commit to a choice use their own loop; callers where
// "don't advance" is a valid outcome (resolve flows) use this.
async function pickDescendantSha(git, shas) {
  const unique = [...new Set(shas.filter(Boolean))]
  if (unique.length === 0) return null
  if (unique.length === 1) return unique[0]
  let winner = unique[0]
  for (let i = 1; i < unique.length; i++) {
    const candidate = unique[i]
    if (candidate === winner) continue
    if (await isAncestor(git, winner, candidate)) winner = candidate
    else if (!(await isAncestor(git, candidate, winner))) return null
  }
  return winner
}

// Decide the new baseline SHA after a resolve. Filters the candidate set
// (`currentBaseline` + the `Latest` SHA of each resolved entry) to SHAs
// reachable from parent-repo HEAD — this naturally drops submodule SHAs that
// can appear as entry Latest values — and then picks the descendant of the
// survivors. Returns the current baseline unchanged when there is nothing to
// advance to (no reachable candidates, divergence, or the current baseline is
// already the descendant). Never rolls the baseline back.
async function computeAdvancedBaseline(git, currentBaseline, entryShas) {
  const candidates = [currentBaseline, ...entryShas].filter(Boolean)
  if (candidates.length === 0) return currentBaseline || null
  const reachable = []
  for (const sha of [...new Set(candidates)]) {
    if (await isAncestor(git, sha, 'HEAD')) reachable.push(sha)
  }
  if (reachable.length === 0) return currentBaseline || null
  const descendant = await pickDescendantSha(git, reachable)
  return descendant || currentBaseline || null
}

// Convenience wrapper used by resolve flows: takes a queue header and the
// resolved entries' Latest SHAs, returns the header with baseline advanced if
// `computeAdvancedBaseline` can confidently move it forward. No-op if the
// resulting SHA equals the existing baseline.
async function advanceQueueBaseline(header, entryShas) {
  const git = simpleGit(process.cwd())
  const currentBaseline = parseBaseline(header)
  const next = await computeAdvancedBaseline(git, currentBaseline, entryShas)
  if (!next || next === currentBaseline) return header
  // Queue entries store 7-char short SHAs; scans stamp the 40-char HEAD SHA.
  // Expand here so baseline lines stay a consistent width regardless of
  // whether they were written by a scan or a resolve.
  let full = next
  try { full = (await git.revparse([next])).trim() } catch { /* keep as-is */ }
  return setBaseline(header, full)
}

module.exports = {
  BASELINE_RE,
  parseBaseline,
  setBaseline,
  isAncestor,
  pickDescendantSha,
  computeAdvancedBaseline,
  advanceQueueBaseline
}
