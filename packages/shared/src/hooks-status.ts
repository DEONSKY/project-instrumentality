import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  HooksStatus,
  HookFileStatus,
  HooksHealth,
} from "./types.js";

const execFileP = promisify(execFile);

const MANAGED_HOOKS = ["pre-commit", "pre-push", "post-merge", "post-checkout"];
const MARKER = "# kb-mcp managed";

// The git hooks dir defaults to `.git/hooks` but can be relocated via
// `git config core.hooksPath`. Resolve once so a team-wide override
// (e.g. husky) doesn't make us falsely report the hooks as missing.
async function resolveHooksDir(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["rev-parse", "--git-path", "hooks"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const rel = stdout.trim();
    if (!rel) return null;
    return path.isAbsolute(rel) ? rel : path.resolve(repoRoot, rel);
  } catch {
    return null;
  }
}

export async function getHooksStatus(
  repoRoot: string
): Promise<HooksStatus | null> {
  const hooksDir = await resolveHooksDir(repoRoot);
  if (!hooksDir) return null;

  const hooks: HookFileStatus[] = MANAGED_HOOKS.map((name) => {
    const file = path.join(hooksDir, name);
    let present = false;
    let managed = false;
    try {
      const content = fs.readFileSync(file, "utf8");
      present = true;
      managed = content.includes(MARKER);
    } catch {
      present = false;
    }
    return { name, present, managed };
  });

  const allManaged = hooks.every((h) => h.managed);
  const anyManaged = hooks.some((h) => h.managed);
  const health: HooksHealth = allManaged ? "managed" : anyManaged ? "partial" : "missing";

  return { health, hooks };
}
