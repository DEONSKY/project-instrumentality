import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  SubmoduleEntry,
  SubmoduleStatus,
  SubmoduleType,
} from "./types.js";

const execFileP = promisify(execFile);

// Best-effort git wrapper. Returns null when git fails — every caller
// already has a sensible fallback (detached HEAD, missing upstream, etc.).
async function gitOut(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", args, { cwd, encoding: "utf8" });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Resolve the gitdir for a submodule path. Submodule `.git` is usually a
// FILE containing `gitdir: <relative path>` (worktree-style), but it can
// also be a directory in older setups. Returns the absolute path of the
// HEAD file, or null if it can't be resolved.
function resolveGitdirHead(absSubPath: string): string | null {
  const dotGit = path.join(absSubPath, ".git");
  let st: fs.Stats;
  try {
    st = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (st.isDirectory()) {
    const head = path.join(dotGit, "HEAD");
    return fs.existsSync(head) ? head : null;
  }
  if (st.isFile()) {
    try {
      const content = fs.readFileSync(dotGit, "utf8");
      const m = content.match(/^gitdir:\s*(.+)\s*$/m);
      if (!m) return null;
      const gitdir = path.isAbsolute(m[1])
        ? m[1]
        : path.resolve(absSubPath, m[1]);
      const head = path.join(gitdir, "HEAD");
      return fs.existsSync(head) ? head : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Minimal .gitmodules parser: we only care about path + the kb-shared
// flag. `git config --file .gitmodules` would be more correct, but it
// adds an extra subprocess per call; the format is regular enough that
// parsing it inline is fine for this purpose.
interface ParsedSubmodule {
  name: string;
  path: string;
  isShared: boolean;
}

function parseGitmodules(text: string): ParsedSubmodule[] {
  const out: ParsedSubmodule[] = [];
  const blocks = text.split(/(?=\[submodule\s+"[^"]+"\])/).filter((b) => b.trim());
  for (const block of blocks) {
    const nameMatch = block.match(/\[submodule\s+"([^"]+)"\]/);
    const pathMatch = block.match(/^\s*path\s*=\s*(.+)\s*$/m);
    if (!nameMatch || !pathMatch) continue;
    out.push({
      name: nameMatch[1].trim(),
      path: pathMatch[1].trim(),
      isShared: /^\s*kb-shared\s*=\s*true\s*$/m.test(block),
    });
  }
  return out;
}

// Parent HEAD ls-tree SHA at `subPath` vs upstream's. When there's no
// upstream tracking branch we compare to origin/main or origin/master —
// same fallback the pre-push hook uses. Returns true when the pointer
// differs.
async function pointerChanged(repoRoot: string, subPath: string): Promise<boolean> {
  const localTree = await gitOut(repoRoot, ["ls-tree", "HEAD", subPath]);
  const localSha = localTree?.split(/\s+/)[2] ?? "";

  let upstream = await gitOut(repoRoot, ["rev-parse", "@{upstream}"]);
  if (!upstream) {
    upstream =
      (await gitOut(repoRoot, ["rev-parse", "origin/main"])) ||
      (await gitOut(repoRoot, ["rev-parse", "origin/master"]));
  }
  if (!upstream) {
    // No upstream and no origin/main|master — there is nothing to
    // compare against, so we conservatively report "no change". The UI
    // will still show the row; preflight just won't flag it.
    return false;
  }
  const remoteTree = await gitOut(repoRoot, ["ls-tree", upstream, subPath]);
  const remoteSha = remoteTree?.split(/\s+/)[2] ?? "";
  return localSha !== remoteSha;
}

export interface GetSubmoduleStatusOptions {
  /**
   * Parent repo root. Defaults to `kbRoot`, but pass an explicit path
   * when the kb root is nested inside a larger repo.
   */
  repoRoot?: string;
}

export async function getSubmoduleStatus(
  kbRoot: string,
  opts: GetSubmoduleStatusOptions = {}
): Promise<SubmoduleStatus | null> {
  const repoRoot = opts.repoRoot ?? kbRoot;
  const gitmodulesPath = path.join(repoRoot, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) return null;

  let text: string;
  try {
    text = fs.readFileSync(gitmodulesPath, "utf8");
  } catch {
    return null;
  }
  const parsed = parseGitmodules(text);

  const parentBranch = await gitOut(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  const parentGitdirHeadPath = resolveGitdirHead(repoRoot);

  const entries: SubmoduleEntry[] = [];
  for (const p of parsed) {
    const fullPath = path.resolve(repoRoot, p.path);
    if (!fs.existsSync(fullPath)) continue; // submodule not checked out

    const type: SubmoduleType = p.isShared ? "shared" : "owned";
    const branch = await gitOut(fullPath, ["symbolic-ref", "--short", "HEAD"]);
    const ptr = await pointerChanged(repoRoot, p.path);
    const branchMismatch =
      type === "owned" &&
      ptr &&
      branch !== null &&
      parentBranch !== null &&
      branch !== parentBranch;
    entries.push({
      name: p.name,
      path: p.path,
      fullPath,
      type,
      branch,
      pointerChanged: ptr,
      branchMismatch,
      gitdirHeadPath: resolveGitdirHead(fullPath),
    });
  }

  const blockingPaths = entries.filter((e) => e.branchMismatch).map((e) => e.path);
  const sharedPointerChanged = entries
    .filter((e) => e.type === "shared" && e.pointerChanged)
    .map((e) => e.path);

  return {
    parentBranch,
    parentGitdirHeadPath,
    entries,
    wouldBlock: blockingPaths.length > 0,
    blockingPaths,
    sharedPointerChanged,
  };
}

/**
 * Build the push plan for the parent + submodules. Mirrors `kb_sub push
 * --dry_run`: owned submodules first (ordered by path), then shared
 * submodules whose pointer changed, then the parent. Skips any submodule
 * whose pointer hasn't moved against upstream.
 */
export interface PushPlanStep {
  order: number;
  /** "parent" for the parent repo. */
  type: SubmoduleType | "parent";
  path: string;
  fullPath: string;
  branch: string | null;
  action: string;
}

export function buildPushPlan(
  repoRoot: string,
  status: SubmoduleStatus
): PushPlanStep[] {
  const plan: PushPlanStep[] = [];
  const owned = status.entries.filter((e) => e.type === "owned" && e.pointerChanged);
  const shared = status.entries.filter((e) => e.type === "shared" && e.pointerChanged);
  let order = 1;
  for (const e of [...owned, ...shared]) {
    const branch =
      e.type === "shared" ? e.branch ?? status.parentBranch : status.parentBranch;
    plan.push({
      order: order++,
      type: e.type,
      path: e.path,
      fullPath: e.fullPath,
      branch,
      action: branch ? `push -u origin ${branch}` : "push",
    });
  }
  plan.push({
    order: order,
    type: "parent",
    path: ".",
    fullPath: repoRoot,
    branch: status.parentBranch,
    action: "push",
  });
  return plan;
}
