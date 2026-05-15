import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PushPlanStep } from "@instrumentality/shared";

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

/**
 * Execute a push plan sequentially. Stops at the first failure so the
 * parent push never runs after a submodule push failed (which would
 * leave the parent pointing at unreachable submodule SHAs on origin).
 */
export async function runPushPlan(plan: PushPlanStep[]): Promise<PushResult> {
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
    const args =
      step.type === "parent"
        ? ["push"]
        : step.branch
        ? ["push", "-u", "origin", step.branch]
        : ["push"];
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
