import * as vscode from "vscode";
import * as path from "node:path";
import {
  findKbRoot,
  getStatus,
  getActionPrompt,
  type StatusSummary,
} from "@instrumentality/shared";
import { KbSyncTreeProvider, type TreeNode } from "./tree-provider";
import { openDashboard } from "./dashboard-stub";

let provider: KbSyncTreeProvider;
let statusBar: vscode.StatusBarItem;
let kbRoot: string | null = null;
let lastStatus: StatusSummary | null = null;
let refreshInflight: Promise<void> | null = null;
let refreshScheduled: NodeJS.Timeout | null = null;
let watchers: vscode.FileSystemWatcher[] = [];

const DEBOUNCE_MS = 300;
const PARSE_RETRY_MS = 500;

export function activate(context: vscode.ExtensionContext): void {
  provider = new KbSyncTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("kbSync.tree", provider)
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = "kbSync.openDashboard";
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("kbSync.refresh", () => {
      void refresh();
    }),
    vscode.commands.registerCommand("kbSync.openDashboard", () => {
      openDashboard(() => lastStatus);
    }),
    vscode.commands.registerCommand("kbSync.copyPrompt", async (node: TreeNode) => {
      if (!node || node.type !== "entry") {
        vscode.window.showWarningMessage("KB Sync: select a drift entry first.");
        return;
      }
      const prompt = getActionPrompt(node.promptInput);
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage("KB Sync: prompt copied to clipboard.");
    }),
    vscode.commands.registerCommand("kbSync.openSource", async (node: TreeNode) => {
      if (!node || node.type !== "entry" || !node.sourceFile || !kbRoot) {
        vscode.window.showWarningMessage("KB Sync: no source file for this entry.");
        return;
      }
      const abs = path.isAbsolute(node.sourceFile)
        ? node.sourceFile
        : path.join(kbRoot, node.sourceFile);
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(`KB Sync: cannot open ${abs}: ${err?.message ?? err}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => detectAndWatch(context))
  );

  detectAndWatch(context);
}

export function deactivate(): void {
  for (const w of watchers) w.dispose();
  watchers = [];
}

function detectAndWatch(context: vscode.ExtensionContext): void {
  for (const w of watchers) w.dispose();
  watchers = [];

  const folders = vscode.workspace.workspaceFolders ?? [];
  kbRoot = findKbRoot(folders.map((f) => f.uri.fsPath));

  if (!kbRoot) {
    provider.setEmpty();
    statusBar.hide();
    return;
  }

  statusBar.show();

  const syncGlob = new vscode.RelativePattern(
    vscode.Uri.file(path.join(kbRoot, "knowledge", "sync")),
    "**/*"
  );
  const watcher = vscode.workspace.createFileSystemWatcher(syncGlob);
  const onChange = () => scheduleRefresh();
  watcher.onDidChange(onChange);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onChange);
  watchers.push(watcher);
  context.subscriptions.push(watcher);

  void refresh();
}

function scheduleRefresh(): void {
  if (refreshScheduled) clearTimeout(refreshScheduled);
  refreshScheduled = setTimeout(() => {
    refreshScheduled = null;
    void refresh();
  }, DEBOUNCE_MS);
}

async function refresh(): Promise<void> {
  if (!kbRoot) return;
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const status = await getStatus(kbRoot!);
      lastStatus = status;
      provider.setStatus(status, kbRoot!);
      updateStatusBar(status);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // Treat parse errors as transient — try once more after a beat.
      setTimeout(() => {
        if (!kbRoot) return;
        getStatus(kbRoot)
          .then((status) => {
            lastStatus = status;
            provider.setStatus(status, kbRoot!);
            updateStatusBar(status);
          })
          .catch(() => {
            provider.setError(`KB Sync: failed to read status (${msg})`);
          });
      }, PARSE_RETRY_MS);
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

function updateStatusBar(status: StatusSummary): void {
  const total = status.totals.grand;
  statusBar.text = `$(sync) KB: ${total}`;
  const parts = [
    `Drifts: ${status.totals.drifts}`,
    `Conform pending: ${status.totals.conformPending}`,
    `Promotions: ${status.totals.promotions}`,
    `Lint errors/warnings: ${status.totals.lintErrors}/${status.totals.lintWarnings}`,
  ];
  statusBar.tooltip = parts.join(" · ");
}
