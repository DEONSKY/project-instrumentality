import * as fs from 'fs'
import * as path from 'path'
import simpleGit, { type SimpleGit } from 'simple-git'

interface Submodule {
  name: string
  path: string
  fullPath: string
  isShared: boolean
}

/**
 * Detect submodules from the parent's .gitmodules. Returns
 * `[{ name, path, fullPath, isShared }, ...]`. Shared submodules carry
 * `kb-shared = true` in their .gitmodules block — the drift/conform
 * detectors treat shared modules with a softer-touch policy.
 */
function detectSubmodules(cwd = process.cwd()): Submodule[] {
  const gitmodulesPath = path.join(cwd, '.gitmodules')
  if (!fs.existsSync(gitmodulesPath)) return []
  const content = fs.readFileSync(gitmodulesPath, 'utf8')
  const submodules: Submodule[] = []
  const blocks = content.split(/(?=\[submodule\s+"[^"]+"\])/).filter(b => b.trim())
  for (const block of blocks) {
    const nameMatch = block.match(/\[submodule\s+"([^"]+)"\]/)
    const pathMatch = block.match(/path\s*=\s*(.+)/)
    if (!nameMatch || !pathMatch) continue
    const name = nameMatch[1].trim()
    const subPath = pathMatch[1].trim()
    const fullPath = path.join(cwd, subPath)
    const isShared = /kb-shared\s*=\s*true/.test(block)
    if (fs.existsSync(fullPath)) submodules.push({ name, path: subPath, fullPath, isShared })
  }
  return submodules
}

/**
 * Resolve the gitlink-anchored ref pair for a single submodule, with
 * re-bootstrap and fallback handling. The caller decides whether to skip
 * the submodule (e.g. when `subHeadRef === subRef` and the caller doesn't
 * want a working-tree pass).
 *
 * Returns:
 *   - `subGit`: simpleGit handle scoped to the submodule
 *   - `subRef`: SHA the parent recorded at `baseline`. Null when both the
 *     stored pointer and the bootstrap fallback fail — caller should warn
 *     and skip the committed pass (working-tree pass against working HEAD
 *     remains possible).
 *   - `subHeadRef`: SHA the parent records at HEAD. Falls back to the
 *     submodule's own HEAD if the parent points at an unfetched commit.
 *     Null only when the submodule has no commits at all.
 *   - `headInfo`: `{ commit, date }` short SHA + ISO date for display.
 *   - `rebootstrapEvent`: when re-bootstrap fired, a structured event the
 *     caller can append to the drift-log (only in write mode).
 *   - `pointerMoved`: convenience flag (`subHeadRef !== subRef`).
 *
 * The `helpers` argument lets the caller pass its own utility functions
 * (kept in drift.js for now to avoid duplicating them across the tree).
 * Expected keys: `baselineReachable`, `resolveLastSyncRef`,
 * `getSubmodulePointerAt`.
 */
interface ResolveSubmoduleRefsHelpers {
  baselineReachable: (git: SimpleGit, sha: string | null) => Promise<boolean>
  resolveLastSyncRef: (git: SimpleGit, remote: string, meta?: { via?: string }) => Promise<string | null>
  getSubmodulePointerAt: (git: SimpleGit, ref: string, subPath: string) => Promise<string | null>
}

interface ResolveSubmoduleRefsArgs {
  mainGit: SimpleGit
  sub: Submodule
  baseline: string | null
  headSha: string | null
  remote: string
  toolName: string
  helpers: ResolveSubmoduleRefsHelpers
}

interface RebootstrapEvent {
  repo: string
  old_sha: string
  new_sha: string | null
  resolver_used: string | undefined
}

interface ResolveSubmoduleRefsResult {
  subGit: SimpleGit
  subRef: string | null
  subHeadRef: string | null
  headInfo: { commit: string; date: string }
  rebootstrapEvent: RebootstrapEvent | null
  pointerMoved: boolean
}

async function resolveSubmoduleRefs({
  mainGit,
  sub,
  baseline,
  headSha,
  remote,
  toolName,
  helpers
}: ResolveSubmoduleRefsArgs): Promise<ResolveSubmoduleRefsResult> {
  const { baselineReachable, resolveLastSyncRef, getSubmodulePointerAt } = helpers
  const subGit = simpleGit(sub.fullPath)

  // ── subRef: parent's recorded gitlink at the queue baseline ─────────
  let subRef: string | null = null
  let rebootstrapEvent: RebootstrapEvent | null = null
  if (baseline) subRef = await getSubmodulePointerAt(mainGit, baseline, sub.path)

  if (subRef && !(await baselineReachable(subGit, subRef))) {
    const old = subRef
    const meta: { via?: string } = {}
    try { subRef = await resolveLastSyncRef(subGit, remote, meta) } catch { subRef = null }
    process.stderr.write(
      `[${toolName}] warning: submodule ${sub.path} baseline ${old} unreachable (likely squash-merged or never fetched); ` +
      `re-bootstrapping. New baseline: ${subRef || '(none — skipping)'}\n`
    )
    rebootstrapEvent = {
      repo: `submodule:${sub.path}`,
      old_sha: old,
      new_sha: subRef,
      resolver_used: meta.via
    }
  }
  if (subRef === null) {
    try { subRef = await resolveLastSyncRef(subGit, remote) } catch { subRef = null }
  }

  // ── subHeadRef: parent's recorded gitlink at HEAD, with fallback ────
  let subHeadRef: string | null = null
  if (headSha) subHeadRef = await getSubmodulePointerAt(mainGit, headSha, sub.path)
  if (subHeadRef && !(await baselineReachable(subGit, subHeadRef))) {
    process.stderr.write(
      `[${toolName}] warning: submodule ${sub.path} parent gitlink ${subHeadRef.slice(0, 7)} ` +
      `unreachable in local clone — falling back to working HEAD\n`
    )
    subHeadRef = null
  }
  if (!subHeadRef) {
    try {
      const log = await subGit.log({ maxCount: 1 })
      if (log.latest) subHeadRef = log.latest.hash
    } catch { /* leave null — caller will skip */ }
  }

  // ── Head info for display (short SHA + date) ────────────────────────
  let headInfo = { commit: 'unknown', date: new Date().toISOString().split('T')[0] }
  if (subHeadRef) {
    try {
      const info = (await subGit.raw(['show', '-s', '--format=%H%n%cI', subHeadRef])).trim()
      const [hash, date] = info.split('\n')
      if (hash) headInfo.commit = hash.slice(0, 7)
      if (date) headInfo.date = date.split('T')[0]
    } catch { /* non-fatal */ }
  }

  return {
    subGit,
    subRef,
    subHeadRef,
    headInfo,
    rebootstrapEvent,
    pointerMoved: subHeadRef !== null && subRef !== null && subHeadRef !== subRef
  }
}

export {
  detectSubmodules,
  resolveSubmoduleRefs
}
