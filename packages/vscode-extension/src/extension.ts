import * as vscode from "vscode";
import * as path from "node:path";
import {
  findKbRoot,
  getStatus,
  getActionPrompt,
  resolveStandardPath,
  type StatusSummary,
} from "@instrumentality/shared";
import {
  KbSyncTreeProvider,
  type TreeNode,
  type EntryNode,
  type SortMode,
  type SectionKind,
  type FilterState,
  DEFAULT_FILTER,
} from "./tree-provider";
import {
  openDashboard,
  refreshDashboardIfOpen,
  highlightEntryInDashboard,
  lookupEntry,
  type DashboardFilter,
  type EntryRef,
} from "./dashboard";
import { KbDiagnostics } from "./diagnostics";
import { sendPrompt, maybeSuggestAgentBackend } from "./agent-backend";
import { registerWelcome } from "./welcome";

let provider: KbSyncTreeProvider;
let treeView: vscode.TreeView<TreeNode>;
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
let sortMode: SortMode = "default";
let filter: FilterState = { ...DEFAULT_FILTER, hiddenSections: new Set() };

const DEBOUNCE_MS = 300;
const PARSE_RETRY_MS = 500;
const SORT_KEY = "instrumentality.sortMode";
const FILTER_KEY = "instrumentality.filter";

const SECTION_LABELS: Record<SectionKind, string> = {
  "code-drift": "Code Drifts",
  "kb-drift": "KB Drifts",
  "standards-drift": "Standards Drifts",
  "conform-pending": "Conform Pending",
  promotions: "Pending Promotions",
  lint: "Lint Issues",
};

const DASHBOARD_FILTER_KEY = "instrumentality.dashboardFilter";
let dashboardFilter: DashboardFilter = {
  search: "",
  severities: new Set(),
  hiddenSections: new Set(),
};

export function activate(context: vscode.ExtensionContext): void {
  loadStateFromWorkspace(context);

  diagnostics = new KbDiagnostics();
  context.subscriptions.push({ dispose: () => diagnostics.dispose() });

  provider = new KbSyncTreeProvider(
    () => sortMode,
    () => filter,
    (entry) => resolveStandardForEntryNode(entry)
  );
  treeView = vscode.window.createTreeView("instrumentality.tree", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = "instrumentality.openDashboard";
  context.subscriptions.push(statusBar);

  registerWelcome(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("instrumentality.refresh", () => void refresh()),
    vscode.commands.registerCommand("instrumentality.openDashboard", () =>
      openDashboard({
        getStatus: () => lastStatus,
        getFilter: () => dashboardFilter,
        setFilter: (f) => {
          dashboardFilter = f;
          saveDashboardFilter(context, f);
        },
        onAction: (action) => handleDashboardAction(action),
        onReveal: (ref) => revealTreeEntry(ref),
      })
    ),
    vscode.commands.registerCommand("instrumentality.copyPrompt", (node?: TreeNode) =>
      void copyPromptCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.sendPrompt", (node?: TreeNode) =>
      void sendPromptCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.openSource", (node?: TreeNode) =>
      void openSourceCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.openStandard", (node?: TreeNode) =>
      void openStandardCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.sortBy", () => void sortByCommand(context)),
    vscode.commands.registerCommand("instrumentality.filter", () => void filterCommand(context)),
    vscode.commands.registerCommand("instrumentality.clearFilter", () => void clearFilterCommand(context))
  );

  // Tree → dashboard reveal sync.
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const sel = e.selection[0];
      if (!sel || sel.type !== "entry") return;
      highlightEntryInDashboard({ section: sel.parentKind, id: sel.entryId });
    })
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

  setContextFilterActive();
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
  const savedSort = context.workspaceState.get<SortMode>(SORT_KEY);
  if (savedSort) sortMode = savedSort;
  const savedFilter = context.workspaceState.get<{
    hiddenSections: SectionKind[];
    hideInfoLint: boolean;
    textPattern: string;
  }>(FILTER_KEY);
  if (savedFilter) {
    filter = {
      hiddenSections: new Set(savedFilter.hiddenSections),
      hideInfoLint: savedFilter.hideInfoLint,
      textPattern: savedFilter.textPattern,
    };
  }
  const savedDashFilter = context.workspaceState.get<{
    search: string;
    severities: ("error" | "warn" | "info")[];
    hiddenSections: SectionKind[];
  }>(DASHBOARD_FILTER_KEY);
  if (savedDashFilter) {
    dashboardFilter = {
      search: savedDashFilter.search ?? "",
      severities: new Set(savedDashFilter.severities ?? []),
      hiddenSections: new Set(savedDashFilter.hiddenSections ?? []),
    };
  }
}

function saveDashboardFilter(context: vscode.ExtensionContext, f: DashboardFilter): void {
  void context.workspaceState.update(DASHBOARD_FILTER_KEY, {
    search: f.search,
    severities: [...f.severities],
    hiddenSections: [...f.hiddenSections],
  });
}

function saveFilterState(context: vscode.ExtensionContext): void {
  void context.workspaceState.update(FILTER_KEY, {
    hiddenSections: [...filter.hiddenSections],
    hideInfoLint: filter.hideInfoLint,
    textPattern: filter.textPattern,
  });
  setContextFilterActive();
}

function setContextFilterActive(): void {
  const active =
    filter.hiddenSections.size > 0 || filter.hideInfoLint || filter.textPattern.length > 0;
  void vscode.commands.executeCommand("setContext", "instrumentality.filterActive", active);
}

// ── Detection + watching ────────────────────────────────────────────────────

function detectAndWatch(context: vscode.ExtensionContext): void {
  for (const w of watchers) w.dispose();
  watchers = [];

  const folders = vscode.workspace.workspaceFolders ?? [];
  kbRoot = findKbRoot(folders.map((f) => f.uri.fsPath));

  if (!kbRoot) {
    provider.setEmpty();
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
      // Transient parse errors during multi-write — try again after a beat.
      setTimeout(() => {
        if (!kbRoot) {
          setSpinner(false);
          return;
        }
        fetchStatus()
          .then(applyStatus)
          .catch(() => provider.setError(`Instrumentality: failed to read status (${msg})`))
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
  provider.setStatus(status, kbRoot!);
  diagnostics.update(kbRoot!, status.lint.violations);
  updateStatusBar(status);
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

// ── Commands ────────────────────────────────────────────────────────────────

async function copyPromptCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry) return;
  const prompt = getActionPrompt(entry.promptInput);
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage("Instrumentality: prompt copied to clipboard.");
}

async function sendPromptCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry) return;
  const prompt = getActionPrompt(entry.promptInput);
  const result = await sendPrompt(prompt);
  void vscode.window.showInformationMessage(`Instrumentality: ${result.message}`);
}

async function openSourceCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry || !entry.sourceFile || !kbRoot) {
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
}

async function openStandardCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry || !entry.standardFile) {
    void vscode.window.showWarningMessage("Instrumentality: no standard definition file for this entry.");
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.standardFile));
    await vscode.window.showTextDocument(doc);
  } catch (err: any) {
    void vscode.window.showErrorMessage(
      `Instrumentality: cannot open ${entry.standardFile}: ${err?.message ?? err}`
    );
  }
}

function expectEntry(node?: TreeNode): EntryNode | null {
  if (!node || node.type !== "entry") {
    void vscode.window.showWarningMessage("Instrumentality: select a drift entry first.");
    return null;
  }
  return node;
}

async function sortByCommand(context: vscode.ExtensionContext): Promise<void> {
  const choices: { label: string; value: SortMode; description: string }[] = [
    { label: "Default", value: "default", description: "Underlying queue order" },
    { label: "Severity", value: "severity", description: "Errors first, then warnings, then info" },
    { label: "Recency", value: "recency", description: "Most recently changed first" },
    { label: "File path", value: "path", description: "Alphabetical by source file" },
  ];
  const pick = await vscode.window.showQuickPick(
    choices.map((c) => ({ label: c.label, description: c.description, value: c.value })),
    { title: "Instrumentality: Sort By", placeHolder: `Current: ${sortMode}` }
  );
  if (!pick) return;
  sortMode = pick.value;
  await context.workspaceState.update(SORT_KEY, sortMode);
  provider.refreshTree();
}

async function filterCommand(context: vscode.ExtensionContext): Promise<void> {
  const sectionPicks: SectionKind[] = [
    "code-drift",
    "kb-drift",
    "standards-drift",
    "conform-pending",
    "promotions",
    "lint",
  ];
  const items: (vscode.QuickPickItem & { id: string })[] = [
    ...sectionPicks.map((k) => ({
      label: `Section: ${SECTION_LABELS[k]}`,
      description: filter.hiddenSections.has(k) ? "currently hidden" : "shown",
      id: `section:${k}`,
      picked: !filter.hiddenSections.has(k),
    })),
    {
      label: "Hide info-level lint",
      description: filter.hideInfoLint ? "on" : "off",
      id: "hide-info-lint",
      picked: filter.hideInfoLint,
    },
  ];
  const result = await vscode.window.showQuickPick(items, {
    title: "Instrumentality: Filter (toggle visibility)",
    canPickMany: true,
    placeHolder: "Checked = visible. Uncheck to hide.",
  });
  if (!result) return;

  const newHidden = new Set<SectionKind>();
  let hideInfo = false;
  const checkedIds = new Set(result.map((r) => r.id));
  for (const k of sectionPicks) {
    if (!checkedIds.has(`section:${k}`)) newHidden.add(k);
  }
  if (checkedIds.has("hide-info-lint")) hideInfo = true;

  const pattern = await vscode.window.showInputBox({
    title: "Instrumentality: Filter — text pattern (substring, case-insensitive)",
    value: filter.textPattern,
    placeHolder: "Leave empty to show all entries",
    prompt: "Filter entries whose label or description contains this text",
  });
  if (pattern === undefined) return; // user cancelled the second step

  filter = { hiddenSections: newHidden, hideInfoLint: hideInfo, textPattern: pattern };
  saveFilterState(context);
  provider.refreshTree();
}

async function clearFilterCommand(context: vscode.ExtensionContext): Promise<void> {
  filter = { hiddenSections: new Set(), hideInfoLint: false, textPattern: "" };
  saveFilterState(context);
  provider.refreshTree();
}

// ── Dashboard actions ──────────────────────────────────────────────────────

async function handleDashboardAction(
  action: { type: "send" | "copy" | "open" | "openStandard"; ref: EntryRef } | { type: "refresh" }
): Promise<void> {
  if (action.type === "refresh") {
    await refresh();
    return;
  }
  const entry = lookupEntry(action.ref);
  if (!entry) {
    void vscode.window.showWarningMessage("Instrumentality: entry not found (try refreshing).");
    return;
  }
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
      const filePath = await import("@instrumentality/shared").then((m) =>
        m.resolveStandardPath(kbRoot!, entry.standardId!)
      );
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
  }
}

async function revealTreeEntry(ref: EntryRef): Promise<void> {
  const node = provider.findEntryByRef(ref.section, ref.id);
  if (!node) return;
  try {
    await treeView.reveal(node, { select: true, focus: false });
  } catch {
    // reveal can throw if the section isn't materialized yet — acceptable
  }
}

function resolveStandardForEntryNode(entry: EntryNode): string | null {
  if (!kbRoot) return null;
  if (entry.promptInput.kind !== "conform" && entry.promptInput.kind !== "standards-drift") {
    return null;
  }
  const standardId =
    entry.promptInput.kind === "conform"
      ? entry.promptInput.entry.requested[0]?.standard_id
      : entry.promptInput.entry.standardId;
  if (!standardId) return null;
  return resolveStandardPath(kbRoot, standardId);
}
