// Shared git helpers used by drift.js and conform.js.
//
// Only functions that are byte-or-behavior identical between the two callers
// live here. `getChangedFiles` deliberately stays in each tool because the
// signatures (drift: 3-arg ref/toRef; conform: 2-arg ref-to-HEAD) and bodies
// (conform expands submodules via local helper) diverge meaningfully.

import type { SimpleGit } from 'simple-git'

/**
 * Parse `git diff --name-status -M` output into entries.
 *
 * R<n> and C<n> codes mean rename/copy with similarity %n; we record the
 * similarity when requested (drift uses it; conform ignores).
 *
 * Returns: Array<{ status, path, oldPath?, similarity? }>
 */
interface NameStatusEntry {
  status: string
  path: string
  oldPath?: string
  similarity?: number
}

function parseNameStatus(output: string, { includeSimilarity = false } = {}): NameStatusEntry[] {
  return output.split('\n').filter(l => l.trim()).map(line => {
    const parts = line.split('\t')
    const statusCode = parts[0].trim()
    if (statusCode.startsWith('R') || statusCode.startsWith('C')) {
      const entry: NameStatusEntry = { status: statusCode.charAt(0), oldPath: parts[1], path: parts[2] }
      if (includeSimilarity) {
        entry.similarity = parseInt(statusCode.slice(1), 10) || 0
      }
      return entry
    }
    return { status: statusCode.charAt(0), path: parts[1] }
  })
}

/**
 * Extract the @handle that surfaces in published .md from a commit email.
 *
 * Strips the `@domain` and any noreply suffix:
 *   `mert.yilmaz@tme.eu` → `mert.yilmaz`
 *   `12345+mert@users.noreply.github.com` → `mert`
 */
function authorHandleFromEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null
  const local = email.trim().split('@')[0]
  if (!local) return null
  const plus = local.indexOf('+')
  return plus !== -1 ? local.slice(plus + 1) : local
}

/**
 * Check whether a SHA/ref resolves to a real commit in this repo. Used to
 * guard against stored baselines that have been GC'd after a squash-merge or
 * never fetched locally — those cases otherwise fall through to a
 * getChangedFiles empty-tree fallback that surfaces every file as changed.
 */
async function baselineReachable(git: SimpleGit, sha: string | null | undefined): Promise<boolean> {
  if (!sha) return false
  try {
    await git.raw(['cat-file', '-e', `${sha}^{commit}`])
    return true
  } catch { return false }
}

/**
 * Resolve the local git user's handle (mailmap-aware via
 * authorHandleFromEmail's stripping) so purely-uncommitted entries can be
 * credited to the author rather than showing as anonymous. Returns null when
 * both user.email and user.name are unset.
 */
async function getLocalGitUserHandle(git: SimpleGit): Promise<string | null> {
  try {
    const email = (await git.raw(['config', '--get', 'user.email'])).trim()
    if (email) {
      const handle = authorHandleFromEmail(email)
      if (handle) return handle
    }
  } catch { /* not configured */ }
  try {
    const name = (await git.raw(['config', '--get', 'user.name'])).trim()
    return name || null
  } catch { return null }
}

export {
  parseNameStatus,
  authorHandleFromEmail,
  baselineReachable,
  getLocalGitUserHandle
}
export type { NameStatusEntry }
