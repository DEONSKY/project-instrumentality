import * as vscode from "vscode";
import * as path from "node:path";
import {
  findKbRoot,
  getStatus,
  getActionPrompt,
  resolveStandardPath,
  findRuleLineRange,
  type StatusSummary,
} from "@instrumentality/shared";
import {
  openDashboard,
  refreshDashboardIfOpen,
  highlightEntryInDashboard,
  lookupEntry as lookupDashboardEntry,
  type DashboardFilter,
  type DashboardAction,
  type EntryRef,
  type IndexedEntry,
  type SectionKind,
} from "./dashboard";
import { buildEntryIndex } from "./webview-render";
import { SidebarViewProvider } from "./sidebar-view";
import { KbDiagnostics } from "./diagnostics";
import { sendPrompt, maybeSuggestAgentBackend } from "./agent-backend";
import { registerWelcome } from "./welcome";
import { showFileDiff } from "./diff";

let sidebarProvider: SidebarViewProvider;
let statusBar: vscode.StatusBarItem;
let diagnostics: KbDiagnostics;
let kbRoot: string | null = null;
let lastStatus: StatusSummary | null = null;
let prevTotals: StatusSummary["totals"] | null = null;
let prevHeadShort: string | null | undefined;
let refreshInflight: Promise<void> | null = null;
let refreshScheduled: NodeJS.Timeout | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let watchers: vscode.FileSystemWatcher[] = [];

const DEBOUNCE_MS = 300;
const PARSE_RETRY_MS = 500;
const FILTER_KEY = "instrumentality.dashboardFilter";

let currentFilter: DashboardFilter = {
  search: "",
  severities: new Set(),
  hiddenSections: new Set(),
  groupBy: "section",
};

export function activate(context: vscode.ExtensionContext): void {
  loadStateFromWorkspace(context);

  diagnostics = new KbDiagnostics();
  context.subscriptions.push({ dispose: () => diagnostics.dispose() });

  sidebarProvider = new SidebarViewProvider({
    getStatus: () => lastStatus,
    getKbRoot: () => kbRoot,
    getFilter: () => currentFilter,
    setFilter: (f) => {
      currentFilter = f;
      saveFilter(context, f);
    },
    onAction: (a) => handleAction(a),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("instrumentality.tree", sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = "instrumentality.openDashboard";
  context.subscriptions.push(statusBar);

  registerWelcome(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("instrumentality.refresh", () => void refresh()),
    vscode.commands.registerCommand("instrumentality.openDashboard", () =>
      openDashboard({
        getStatus: () => lastStatus,
        getKbRoot: () => kbRoot,
        getFilter: () => currentFilter,
        setFilter: (f) => {
          currentFilter = f;
          saveFilter(context, f);
          sidebarProvider.refresh();
        },
        onAction: (action) => handleAction(action),
        onReveal: (ref) => {
          sidebarProvider.highlight(ref);
          return Promise.resolve();
        },
      })
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => detectAndWatch(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("instrumentality.refreshIntervalSeconds")) restartPoll();
      if (
        e.affectsConfiguration("instrumentality.lint.command") ||
        e.affectsConfiguration("instrumentality.notifications.enabled")
      ) {
        void refresh();
      }
    })
  );

  detectAndWatch(context);
  void maybeSuggestAgentBackend(context);
}

export function deactivate(): void {
  for (const w of watchers) w.dispose();
  watchers = [];
  if (pollInterval) clearInterval(pollInterval);
}

// ── State persistence ──────────────────────────────────────────────────────

function loadStateFromWorkspace(context: vscode.ExtensionContext): void {
  const saved = context.workspaceState.get<{
    search: string;
    severities: ("error" | "warn" | "info")[];
    hiddenSections: SectionKind[];
    groupBy?: "section" | "file" | "standard" | "lifecycle";
  }>(FILTER_KEY);
  if (saved) {
    currentFilter = {
      search: saved.search ?? "",
      severities: new Set(saved.severities ?? []),
      hiddenSections: new Set(saved.hiddenSections ?? []),
      groupBy: saved.groupBy ?? "section",
    };
  }
}

function saveFilter(context: vscode.ExtensionContext, f: DashboardFilter): void {
  void context.workspaceState.update(FILTER_KEY, {
    search: f.search,
    severities: [...f.severities],
    hiddenSections: [...f.hiddenSections],
    groupBy: f.groupBy,
  });
}

// ── Detection + watching ────────────────────────────────────────────────────

function detectAndWatch(context: vscode.ExtensionContext): void {
  for (const w of watchers) w.dispose();
  watchers = [];

  const folders = vscode.workspace.workspaceFolders ?? [];
  kbRoot = findKbRoot(folders.map((f) => f.uri.fsPath));

  if (!kbRoot) {
    lastStatus = null;
    sidebarProvider.refresh();
    statusBar.hide();
    diagnostics.clear();
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

  restartPoll();
  void refresh();
}

function restartPoll(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  const cfg = vscode.workspace.getConfiguration("instrumentality");
  const seconds = cfg.get<number>("refreshIntervalSeconds", 0);
  if (seconds > 0 && kbRoot) {
    pollInterval = setInterval(() => void refresh(), seconds * 1000);
  }
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
  setSpinner(true);
  refreshInflight = (async () => {
    try {
      const status = await fetchStatus();
      applyStatus(status);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setTimeout(() => {
        if (!kbRoot) {
          setSpinner(false);
          return;
        }
        fetchStatus()
          .then(applyStatus)
          .catch(() =>
            void vscode.window.showWarningMessage(
              `Instrumentality: failed to read status (${msg})`
            )
          )
          .finally(() => setSpinner(false));
      }, PARSE_RETRY_MS);
      return;
    } finally {
      refreshInflight = null;
    }
    setSpinner(false);
  })();
  return refreshInflight;
}

async function fetchStatus(): Promise<StatusSummary> {
  const cfg = vscode.workspace.getConfiguration("instrumentality");
  const lintCommand = cfg.get<string>("lint.command", "").trim() || undefined;
  return getStatus(kbRoot!, { lintCommand });
}

function applyStatus(status: StatusSummary): void {
  lastStatus = status;
  diagnostics.update(kbRoot!, status.lint.violations);
  updateStatusBar(status);
  sidebarProvider.refresh();
  refreshDashboardIfOpen(status);
  maybeNotify(status);
}

function setSpinner(spinning: boolean): void {
  if (!lastStatus) {
    statusBar.text = spinning ? "$(sync~spin) KB" : "$(sync) KB";
    return;
  }
  const total = lastStatus.totals.grand;
  statusBar.text = `${spinning ? "$(sync~spin)" : "$(sync)"} KB: ${total}`;
}

function updateStatusBar(status: StatusSummary): void {
  statusBar.text = `$(sync) KB: ${status.totals.grand}`;
  const parts = [
    `Drifts: ${status.totals.drifts}`,
    `Conform pending: ${status.totals.conformPending}`,
    `Promotions: ${status.totals.promotions}`,
    `Lint errors/warnings: ${status.totals.lintErrors}/${status.totals.lintWarnings}`,
  ];
  statusBar.tooltip = parts.join(" · ");
}

// ── Notifications ───────────────────────────────────────────────────────────

let lastNotifyAt = 0;
const NOTIFY_COALESCE_MS = 10_000;

function maybeNotify(status: StatusSummary): void {
  const cfg = vscode.workspace.getConfiguration("instrumentality");
  if (!cfg.get<boolean>("notifications.enabled", false)) {
    prevTotals = status.totals;
    prevHeadShort = status.currentHeadShort;
    return;
  }

  const now = Date.now();
  let reason: string | null = null;
  if (prevTotals) {
    if (status.totals.grand - prevTotals.grand >= 5) {
      reason = `Instrumentality: ${status.totals.grand - prevTotals.grand} new entries (total ${status.totals.grand}).`;
    } else if (status.totals.lintErrors > prevTotals.lintErrors && prevTotals.lintErrors === 0) {
      reason = `Instrumentality: first lint error appeared (${status.totals.lintErrors}).`;
    } else if (
      prevHeadShort !== undefined &&
      status.currentHeadShort &&
      prevHeadShort !== status.currentHeadShort
    ) {
      reason = `Instrumentality: HEAD changed (${prevHeadShort} → ${status.currentHeadShort}).`;
    }
  }
  prevTotals = status.totals;
  prevHeadShort = status.currentHeadShort;

  if (reason && now - lastNotifyAt > NOTIFY_COALESCE_MS) {
    lastNotifyAt = now;
    void vscode.window.showInformationMessage(reason, "View").then((choice) => {
      if (choice === "View") {
        void vscode.commands.executeCommand("instrumentality.tree.focus");
      }
    });
  }
}

// ── Action dispatch ────────────────────────────────────────────────────────

function resolveEntry(ref: EntryRef): IndexedEntry | undefined {
  // Try the dashboard's index first (cheapest), then the sidebar's, then
  // build a fresh one against `lastStatus`. Both surfaces stay in sync via
  // `lastStatus`, so any of these three will find the entry.
  const fromDashboard = lookupDashboardEntry(ref);
  if (fromDashboard) return fromDashboard;
  const fromSidebar = sidebarProvider.lookupEntry(ref);
  if (fromSidebar) return fromSidebar;
  const fresh = buildEntryIndex(lastStatus);
  return fresh.get(`${ref.section}:${ref.id}`);
}

async function handleAction(action: DashboardAction): Promise<void> {
  if (action.type === "refresh") {
    await refresh();
    return;
  }
  if (action.type === "showFileDiff") {
    await handleShowFileDiff({
      absPath: action.absPath,
      sinceCommit: action.sinceCommit,
      latestCommit: action.latestCommit,
    });
    return;
  }
  const entry = resolveEntry(action.ref);
  if (!entry) {
    void vscode.window.showWarningMessage("Instrumentality: entry not found (try refreshing).");
    return;
  }

  // Mirror the highlight to the other surface so both stay in sync when the
  // user clicks/expands a card on one side.
  highlightEntryInDashboard(action.ref);
  sidebarProvider.highlight(action.ref);

  switch (action.type) {
    case "send": {
      const result = await sendPrompt(entry.prompt);
      void vscode.window.showInformationMessage(`Instrumentality: ${result.message}`);
      return;
    }
    case "copy": {
      await vscode.env.clipboard.writeText(entry.prompt);
      void vscode.window.showInformationMessage("Instrumentality: prompt copied to clipboard.");
      return;
    }
    case "open": {
      if (!entry.sourceFile || !kbRoot) {
        void vscode.window.showWarningMessage("Instrumentality: no source file for this entry.");
        return;
      }
      const abs = path.isAbsolute(entry.sourceFile)
        ? entry.sourceFile
        : path.join(kbRoot, entry.sourceFile);
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        void vscode.window.showErrorMessage(
          `Instrumentality: cannot open ${abs}: ${err?.message ?? err}`
        );
      }
      return;
    }
    case "openStandard": {
      if (!entry.standardId || !kbRoot) {
        void vscode.window.showWarningMessage("Instrumentality: no standard id for this entry.");
        return;
      }
      const filePath = resolveStandardPath(kbRoot, entry.standardId);
      if (!filePath) {
        void vscode.window.showWarningMessage(
          `Instrumentality: standard '${entry.standardId}' not found in knowledge/standards/.`
        );
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        void vscode.window.showErrorMessage(
          `Instrumentality: cannot open ${filePath}: ${err?.message ?? err}`
        );
      }
      return;
    }
    case "editRule": {
      const ids = entryStandardAndRule(entry);
      if (!ids || !kbRoot) {
        void vscode.window.showWarningMessage("Instrumentality: no standard rule for this entry.");
        return;
      }
      const filePath = resolveStandardPath(kbRoot, ids.standardId);
      if (!filePath) {
        void vscode.window.showWarningMessage(
          `Instrumentality: standard '${ids.standardId}' not found in knowledge/standards/.`
        );
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        let selection: vscode.Selection | undefined;
        if (ids.ruleId) {
          const range = findRuleLineRange(filePath, ids.ruleId);
          if (range) {
            const pos = new vscode.Position(range.start, 0);
            selection = new vscode.Selection(pos, pos);
          }
        }
        await vscode.window.showTextDocument(doc, { selection });
      } catch (err: any) {
        void vscode.window.showErrorMessage(
          `Instrumentality: cannot open ${filePath}: ${err?.message ?? err}`
        );
      }
      return;
    }
    case "refineStandard": {
      if (entry.promptInput.kind !== "standards-drift") {
        void vscode.window.showWarningMessage(
          "Instrumentality: Refine is only available on standards-drift entries."
        );
        return;
      }
      const prompt = getActionPrompt({
        kind: "standard-author",
        entry: entry.promptInput.entry,
        mode: "refine",
      });
      const result = await sendPrompt(prompt);
      void vscode.window.showInformationMessage(`Instrumentality: ${result.message}`);
      return;
    }
  }
}

function entryStandardAndRule(entry: IndexedEntry): { standardId: string; ruleId: string | null } | null {
  const inp = entry.promptInput;
  if (inp.kind === "standards-drift") {
    if (!inp.entry.standardId) return null;
    return { standardId: inp.entry.standardId, ruleId: inp.entry.ruleId };
  }
  if (inp.kind === "promotion") {
    if (!inp.entry.standardId) return null;
    return { standardId: inp.entry.standardId, ruleId: inp.entry.ruleId };
  }
  if (inp.kind === "conform") {
    const r = inp.entry.requested[0];
    if (!r) return null;
    return { standardId: r.standard_id, ruleId: r.rule_ids[0] ?? null };
  }
  return null;
}

interface ShowFileDiffPayload {
  absPath: string;
  sinceCommit: string;
  latestCommit?: string;
}

async function handleShowFileDiff(payload: ShowFileDiffPayload): Promise<void> {
  if (!kbRoot) {
    void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
    return;
  }
  if (!payload.absPath || !payload.sinceCommit) {
    void vscode.window.showWarningMessage("Instrumentality: missing diff metadata for this file.");
    return;
  }
  await showFileDiff(kbRoot, payload.absPath, payload.sinceCommit, payload.latestCommit || undefined);
}
