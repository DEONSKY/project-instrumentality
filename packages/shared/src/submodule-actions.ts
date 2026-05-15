import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PushPlanStep } from "./submodule-status.js";

const execFileP = promisify(execFile);

export interface PushStepResult {
  step: PushPlanStep;
  success: boolean;
  /** Combined stdout+stderr — surfaced to the user on failure. */
  output: string;
}

export interface PushResult {
  steps: PushStepResult[];
  allSuccess: boolean;
}

/**
 * Check out `branch` inside the submodule at `subPath`. Used to recover
 * from the "submodule on a different branch than the parent" state that
 * the pre-push hook blocks on.
 */
export async function syncSubmoduleBranch(
  repoRoot: string,
  subPath: string,
  branch: string
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileP(
      "git",
      ["-C", subPath, "checkout", branch],
      { cwd: repoRoot, encoding: "utf8" }
    );
    return { success: true, output: (stdout + stderr).trim() };
  } catch (err: any) {
    const out =
      (err?.stdout ?? "") + (err?.stderr ?? "") || err?.message || String(err);
    return { success: false, output: String(out).trim() };
  }
}

export async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await execFileP(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      { cwd, encoding: "utf8" }
    );
    return true;
  } catch {
    return false;
  }
}

export async function listRemotes(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP("git", ["remote"], {
      cwd,
      encoding: "utf8",
    });
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Mirror git's own remote-selection order so the default lines up with what
// git would have suggested in its "no upstream" error: per-branch pushRemote,
// then remote.pushDefault, then the sole remote, then "origin".
export async function detectPushRemote(
  cwd: string,
  branch: string,
  remotes?: string[]
): Promise<string> {
  for (const key of [`branch.${branch}.pushRemote`, "remote.pushDefault"]) {
    try {
      const { stdout } = await execFileP("git", ["config", "--get", key], {
        cwd,
        encoding: "utf8",
      });
      const value = stdout.trim();
      if (value) return value;
    } catch {
      // config key unset — fall through
    }
  }
  const known = remotes ?? (await listRemotes(cwd));
  if (known.length === 1) return known[0];
  if (known.includes("origin")) return "origin";
  if (known.length > 0) return known[0];
  return "origin";
}

export interface RunPushPlanOptions {
  /**
   * Remote to set as upstream when the parent branch has none. If omitted,
   * runPushPlan auto-detects via {@link detectPushRemote}.
   */
  parentRemote?: string;
}

/**
 * Execute a push plan sequentially. Stops at the first failure so the
 * parent push never runs after a submodule push failed (which would
 * leave the parent pointing at unreachable submodule SHAs on origin).
 */
export async function runPushPlan(
  plan: PushPlanStep[],
  opts: RunPushPlanOptions = {}
): Promise<PushResult> {
  const steps: PushStepResult[] = [];
  let allSuccess = true;
  for (const step of plan) {
    if (!allSuccess) {
      steps.push({
        step,
        success: false,
        output: "Skipped — earlier step failed",
      });
      continue;
    }
    let args: string[];
    if (step.type === "parent") {
      if (step.branch && !(await hasUpstream(step.fullPath))) {
        const remote =
          opts.parentRemote ??
          (await detectPushRemote(step.fullPath, step.branch));
        args = ["push", "-u", remote, step.branch];
      } else {
        args = ["push"];
      }
    } else if (step.branch) {
      args = ["push", "-u", "origin", step.branch];
    } else {
      args = ["push"];
    }
    try {
      const { stdout, stderr } = await execFileP("git", args, {
        cwd: step.fullPath,
        encoding: "utf8",
      });
      steps.push({ step, success: true, output: (stdout + stderr).trim() });
    } catch (err: any) {
      const out =
        (err?.stdout ?? "") +
          (err?.stderr ?? "") || err?.message || String(err);
      steps.push({ step, success: false, output: String(out).trim() });
      allSuccess = false;
    }
  }
  return { steps, allSuccess };
}
