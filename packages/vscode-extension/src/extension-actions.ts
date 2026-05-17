// Stateful command handlers extracted from extension.ts.
//
// Each handler takes a context with getters for the module-level state
// (kbRoot, lastStatus) and setters for side-effecting helpers (setSpinner,
// refresh). Getters — not values — because kbRoot and lastStatus are
// reassigned over the extension's lifetime; capturing by value would freeze
// them at activate-time.

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildPushPlan,
  syncSubmoduleBranch,
  runPushPlan,
  hasUpstream,
  listRemotes,
  detectPushRemote,
  type StatusSummary,
} from "@instrumentality/shared";
import type { DashboardAction } from "./dashboard";

const execFileP = promisify(execFile);

export interface ActionContext {
  getKbRoot: () => string | null;
  getLastStatus: () => StatusSummary | null;
  setSpinner: (spinning: boolean) => void;
  refresh: () => Promise<void> | void;
}

// ── Submodule sync ──────────────────────────────────────────────────────────

export async function handleSubmoduleSync(
  action: Extract<DashboardAction, { type: "submoduleSync" }>,
  ctx: ActionContext
): Promise<void> {
  const kbRoot = ctx.getKbRoot();
  if (!kbRoot) {
    void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `Check out '${action.parentBranch}' inside submodule '${action.subPath}'?`,
    { modal: true, detail: "This runs `git -C " + action.subPath + " checkout " + action.parentBranch + "`. Uncommitted changes in the submodule will block the checkout." },
    "Sync"
  );
  if (choice !== "Sync") return;
  const result = await syncSubmoduleBranch(kbRoot, action.subPath, action.parentBranch);
  if (result.success) {
    void vscode.window.showInformationMessage(
      `Instrumentality: synced ${action.subPath} → ${action.parentBranch}.`
    );
    void ctx.refresh();
  } else {
    void vscode.window.showErrorMessage(
      `Instrumentality: sync failed: ${result.output || "unknown error"}`
    );
  }
}

// ── Submodule push ──────────────────────────────────────────────────────────

export async function handleSubmodulePush(ctx: ActionContext): Promise<void> {
  const kbRoot = ctx.getKbRoot();
  if (!kbRoot) {
    void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
    return;
  }
  const sub = ctx.getLastStatus()?.submodules;
  if (!sub) {
    void vscode.window.showWarningMessage("Instrumentality: no submodule data — refresh first.");
    return;
  }

  // Preflight: re-implements the pre-push hook's blocking rule. If we'd
  // block, surface the same remediation the hook prints instead of
  // running any pushes.
  if (sub.wouldBlock) {
    const detail = [
      `Pre-push hook will reject this push.`,
      ``,
      `Submodules on a different branch than the parent (${sub.parentBranch ?? "?"}):`,
      ...sub.blockingPaths.map((p) => `  • ${p}`),
      ``,
      `Fix: sync each submodule to '${sub.parentBranch ?? "<parent>"}' (use the Sync button on each row),`,
      `or unstage the submodule pointer change if it isn't part of this feature.`,
    ].join("\n");
    await vscode.window.showErrorMessage(
      "Instrumentality: push blocked by submodule branch mismatch.",
      { modal: true, detail },
      "Dismiss"
    );
    return;
  }

  const plan = buildPushPlan(kbRoot, sub);
  if (plan.length === 1 && plan[0].type === "parent") {
    // Nothing to do beyond a plain parent push — fall through to the
    // standard plan anyway so the user sees the same confirm flow.
  }

  // If the parent branch has no upstream, ask the user which remote to set
  // before showing the confirm dialog — so the displayed plan reflects the
  // actual command we'll run.
  let parentRemote: string | undefined;
  const parentStep = plan.find((s) => s.type === "parent");
  if (parentStep?.branch && !(await hasUpstream(parentStep.fullPath))) {
    const remotes = await listRemotes(parentStep.fullPath);
    if (remotes.length === 0) {
      void vscode.window.showErrorMessage(
        "Instrumentality: parent repo has no git remote configured."
      );
      return;
    }
    const defaultRemote = await detectPushRemote(
      parentStep.fullPath,
      parentStep.branch,
      remotes
    );
    if (remotes.length === 1) {
      parentRemote = remotes[0];
    } else {
      const ordered = [
        defaultRemote,
        ...remotes.filter((r) => r !== defaultRemote),
      ];
      const pick = await vscode.window.showQuickPick(
        ordered.map((r) => ({
          label: r,
          description: r === defaultRemote ? "default" : undefined,
        })),
        {
          title: `Set upstream for '${parentStep.branch}' — pick a remote`,
          placeHolder: `Default: ${defaultRemote}`,
        }
      );
      if (!pick) return;
      parentRemote = pick.label;
    }
  }

  const planText = plan
    .map((s) => {
      if (s.type === "parent" && parentRemote && s.branch) {
        return `${s.order}. parent — git push -u ${parentRemote} ${s.branch}`;
      }
      return `${s.order}. ${s.type === "parent" ? "parent" : s.path} — git ${s.action}`;
    })
    .join("\n");
  const sharedWarn =
    sub.sharedPointerChanged.length > 0
      ? `\n\n⚠ Shared submodule pointer changed:\n${sub.sharedPointerChanged
          .map((p) => `  • ${p}`)
          .join("\n")}\nThese affect all projects consuming the module.`
      : "";

  const choice = await vscode.window.showInformationMessage(
    "Push submodules and parent in order?",
    {
      modal: true,
      detail: planText + sharedWarn,
    },
    "Push"
  );
  if (choice !== "Push") return;

  const result = await runPushPlan(plan, { parentRemote });
  void ctx.refresh();
  if (result.allSuccess) {
    void vscode.window.showInformationMessage(
      `Instrumentality: pushed ${result.steps.length} step(s) successfully.`
    );
    return;
  }
  const failed = result.steps.find((s) => !s.success);
  void vscode.window.showErrorMessage(
    `Instrumentality: push failed at ${failed?.step.path}: ${failed?.output?.slice(0, 200) ?? "unknown error"}`
  );
}

// ── Publish drift ───────────────────────────────────────────────────────────
//
// Runs drift.runTool() and conform.runTool() in write mode, then stages and
// commits any changes to knowledge/sync/*.md as a single `chore(kb): publish
// drift queue` commit. Commit only — the user controls when to push.

const PUBLISH_QUEUE_FILES = [
  "knowledge/sync/code-drift.md",
  "knowledge/sync/kb-drift.md",
  "knowledge/sync/standards-drift.md",
  "knowledge/sync/standards-backlog.md",
];

export async function handlePublishDrift(ctx: ActionContext): Promise<void> {
  const kbRoot = ctx.getKbRoot();
  if (!kbRoot) {
    void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
    return;
  }
  const scriptDrift = path.join(kbRoot, "knowledge", "_mcp", "tools", "drift.js");
  const scriptConform = path.join(kbRoot, "knowledge", "_mcp", "tools", "conform.js");
  if (!fs.existsSync(scriptDrift)) {
    void vscode.window.showWarningMessage(
      "Instrumentality: publish requires knowledge/_mcp/tools/drift.js (missing in this workspace)."
    );
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    "Publish drift queue?",
    {
      modal: true,
      detail:
        "Runs drift + conform detection in write mode, then commits any changes to knowledge/sync/*.md as `chore(kb): publish drift queue`. Does not push.",
    },
    "Publish"
  );
  if (choice !== "Publish") return;

  ctx.setSpinner(true);
  try {
    // Drift first so any new entries are on disk before conform's standards
    // sweep runs (kept sequential — conform doesn't depend on drift state,
    // but a single commit is cleaner).
    await runNodeTool(scriptDrift, kbRoot);
    if (fs.existsSync(scriptConform)) {
      await runNodeTool(scriptConform, kbRoot);
    }
  } catch (err: any) {
    ctx.setSpinner(false);
    void vscode.window.showErrorMessage(
      `Instrumentality: drift detection failed: ${err?.message ?? err}`
    );
    return;
  }

  // Stage queue files (ignore unknown paths — `git add` errors out on missing
  // files, so check each first).
  const present = PUBLISH_QUEUE_FILES.filter((f) =>
    fs.existsSync(path.join(kbRoot, f))
  );
  if (present.length === 0) {
    ctx.setSpinner(false);
    void vscode.window.showInformationMessage(
      "Instrumentality: nothing to publish — no queue files present."
    );
    return;
  }
  try {
    await execFileP("git", ["add", "--", ...present], { cwd: kbRoot });
  } catch (err: any) {
    ctx.setSpinner(false);
    void vscode.window.showErrorMessage(
      `Instrumentality: git add failed: ${err?.message ?? err}`
    );
    return;
  }

  // If nothing was actually staged after `git add` (queue files unchanged),
  // surface that instead of producing an empty commit.
  let stagedDiff = "";
  try {
    const { stdout } = await execFileP(
      "git",
      ["diff", "--cached", "--name-only", "--", ...present],
      { cwd: kbRoot }
    );
    stagedDiff = stdout.trim();
  } catch {
    /* fall through — try to commit anyway */
  }
  if (!stagedDiff) {
    ctx.setSpinner(false);
    void vscode.window.showInformationMessage(
      "Instrumentality: nothing to publish — drift queue is already up to date."
    );
    void ctx.refresh();
    return;
  }

  try {
    await execFileP(
      "git",
      ["commit", "-m", "chore(kb): publish drift queue"],
      { cwd: kbRoot }
    );
  } catch (err: any) {
    ctx.setSpinner(false);
    void vscode.window.showErrorMessage(
      `Instrumentality: git commit failed: ${err?.message ?? err}`
    );
    return;
  }

  ctx.setSpinner(false);
  void vscode.window.showInformationMessage(
    `Instrumentality: published drift queue (${stagedDiff.split("\n").length} file(s)). Push when ready.`
  );
  void ctx.refresh();
}

function runNodeTool(scriptPath: string, cwd: string): Promise<void> {
  // Invoke the tool via a one-liner that calls runTool() with default args.
  // Equivalent to what the protected-branch pre-push hook does, but synchronous
  // (we await before staging).
  return execFileP(
    process.execPath,
    [
      "-e",
      `require(${JSON.stringify(scriptPath)}).runTool({}).then(() => {}).catch((e) => { process.stderr.write(String(e && e.message || e)); process.exit(1); })`,
    ],
    { cwd, maxBuffer: 16 * 1024 * 1024 }
  ).then(() => undefined);
}
