import * as vscode from "vscode";
import * as path from "node:path";
import {
  findKbRoot,
  getStatus,
  getActionPrompt,
  resolveStandardPath,
  findRuleLineRange,
  stableEntryId,
  type StatusSummary,
  type ConformPending,
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
import {
  DetailsViewProvider,
  type DetailsAction,
  type ResolvedRow,
  type ShowFileDiffPayload,
} from "./details-view";
import { descriptorFor } from "./details-view";
import { showFileDiff } from "./diff";

let provider: KbSyncTreeProvider;
let treeView: vscode.TreeView<TreeNode>;
let detailsProvider: DetailsViewProvider;
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
let treeGroupBy: "section" | "file" | "standard" | "lifecycle" = "section";

const DEBOUNCE_MS = 300;
const PARSE_RETRY_MS = 500;
const SORT_KEY = "instrumentality.sortMode";
const FILTER_KEY = "instrumentality.filter";
const GROUP_BY_KEY = "instrumentality.groupBy";

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
  groupBy: "section",
};

export function activate(context: vscode.ExtensionContext): void {
  loadStateFromWorkspace(context);

  diagnostics = new KbDiagnostics();
  context.subscriptions.push({ dispose: () => diagnostics.dispose() });

  provider = new KbSyncTreeProvider(
    () => sortMode,
    () => filter,
    (entry) => resolveStandardForEntryNode(entry),
    () => treeGroupBy
  );
  treeView = vscode.window.createTreeView("instrumentality.tree", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  detailsProvider = new DetailsViewProvider({
    onAction: (a) => handleDetailsAction(a),
    onShowFileDiff: (payload) => handleShowFileDiff(payload),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("instrumentality.details", detailsProvider)
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
    vscode.commands.registerCommand("instrumentality.editStandardRule", (node?: TreeNode) =>
      void editStandardRuleCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.refineStandard", (node?: TreeNode) =>
      void refineStandardCommand(node)
    ),
    vscode.commands.registerCommand("instrumentality.sortBy", () => void sortByCommand(context)),
    vscode.commands.registerCommand("instrumentality.groupBy", () => void groupByCommand(context)),
    vscode.commands.registerCommand("instrumentality.filter", () => void filterCommand(context)),
    vscode.commands.registerCommand("instrumentality.clearFilter", () => void clearFilterCommand(context))
  );

  // Tree → dashboard reveal sync + Details panel update.
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const sel = e.selection[0];
      if (!sel || sel.type !== "entry") {
        detailsProvider.show(null);
        return;
      }
      highlightEntryInDashboard({ section: sel.parentKind, id: sel.entryId });
      pushSelectionToDetails(sel);
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
  const savedGroup = context.workspaceState.get<"section" | "file" | "standard" | "lifecycle">(GROUP_BY_KEY);
  if (savedGroup) treeGroupBy = savedGroup;
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
    groupBy?: "section" | "file" | "standard" | "lifecycle";
  }>(DASHBOARD_FILTER_KEY);
  if (savedDashFilter) {
    dashboardFilter = {
      search: savedDashFilter.search ?? "",
      severities: new Set(savedDashFilter.severities ?? []),
      hiddenSections: new Set(savedDashFilter.hiddenSections ?? []),
      groupBy: savedDashFilter.groupBy ?? "section",
    };
  }
}

function saveDashboardFilter(context: vscode.ExtensionContext, f: DashboardFilter): void {
  void context.workspaceState.update(DASHBOARD_FILTER_KEY, {
    search: f.search,
    severities: [...f.severities],
    hiddenSections: [...f.hiddenSections],
    groupBy: f.groupBy,
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

function entryStandardAndRule(entry: EntryNode): { standardId: string; ruleId: string | null } | null {
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

async function editStandardRuleCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry || !kbRoot) return;
  const ids = entryStandardAndRule(entry);
  if (!ids) {
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
}

async function refineStandardCommand(node?: TreeNode): Promise<void> {
  const entry = expectEntry(node);
  if (!entry) return;
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

async function groupByCommand(context: vscode.ExtensionContext): Promise<void> {
  type Mode = "section" | "file" | "standard" | "lifecycle";
  const choices: { label: string; value: Mode; description: string }[] = [
    { label: "Section", value: "section", description: "Group by entry kind (default)" },
    { label: "File", value: "file", description: "Group all entries that touch the same file" },
    { label: "Standard", value: "standard", description: "Group all entries tied to the same standard" },
    { label: "Lifecycle", value: "lifecycle", description: "Drift → Conform → Promotion → Lint" },
  ];
  const pick = await vscode.window.showQuickPick(
    choices.map((c) => ({ label: c.label, description: c.description, value: c.value })),
    { title: "Instrumentality: Group By", placeHolder: `Current: ${treeGroupBy}` }
  );
  if (!pick) return;
  treeGroupBy = pick.value;
  await context.workspaceState.update(GROUP_BY_KEY, treeGroupBy);
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
  action:
    | { type: "send" | "copy" | "open" | "openStandard" | "editRule" | "refineStandard"; ref: EntryRef }
    | { type: "showFileDiff"; absPath: string; sinceCommit: string; latestCommit?: string }
    | { type: "refresh" }
): Promise<void> {
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
      const node = provider.findEntryByRef(action.ref.section, action.ref.id);
      if (node) await editStandardRuleCommand(node);
      return;
    }
    case "refineStandard": {
      const node = provider.findEntryByRef(action.ref.section, action.ref.id);
      if (node) await refineStandardCommand(node);
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

function rowFromEntryNode(entry: EntryNode): ResolvedRow | null {
  const inp = entry.promptInput;
  switch (inp.kind) {
    case "code-drift":
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        payload: { kind: "code-drift", entry: inp.entry },
      };
    case "kb-drift":
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        payload: { kind: "kb-drift", entry: inp.entry },
      };
    case "standards-drift":
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        standardId: inp.entry.standardId,
        ruleId: inp.entry.ruleId,
        payload: { kind: "standards-drift", entry: inp.entry },
      };
    case "promotion":
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        standardId: inp.entry.standardId,
        ruleId: inp.entry.ruleId,
        payload: { kind: "promotion", entry: inp.entry },
      };
    case "conform": {
      // Tree-node entries map back to the first request that produced this id.
      // We rebuild the descriptor against that single request to keep the
      // detail panel coherent with the row the user selected.
      const p = inp.entry;
      const req = p.requested.find((r) =>
        stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, p.requested.indexOf(r)) === entry.entryId
      ) ?? p.requested[0];
      if (!req) return null;
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        standardId: req.standard_id,
        ruleId: req.rule_ids[0] ?? null,
        payload: { kind: "conform-pending", pending: p, request: req },
      };
    }
    case "lint":
      return {
        promptInput: inp,
        sourceFile: entry.sourceFile,
        payload: { kind: "lint", entry: inp.entry },
      };
    case "standard-author":
      // Tree never produces this directly.
      return null;
  }
}

function pushSelectionToDetails(entry: EntryNode): void {
  const row = rowFromEntryNode(entry);
  if (!row) {
    detailsProvider.show(null);
    return;
  }
  const desc = descriptorFor(
    lastStatus!,
    { section: entry.parentKind, id: entry.entryId },
    () => row,
    kbRoot
  );
  detailsProvider.show(desc);
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

async function handleDetailsAction(action: DetailsAction): Promise<void> {
  // The Details view operates on the currently selected tree entry. Map
  // back to that node so we can reuse the existing command handlers.
  const node = provider.findEntryByRef(action.ref.section, action.ref.id);
  if (!node) {
    void vscode.window.showWarningMessage("Instrumentality: entry not found (try refreshing).");
    return;
  }
  switch (action.type) {
    case "send":
      await sendPromptCommand(node);
      return;
    case "copy":
      await copyPromptCommand(node);
      return;
    case "open":
      await openSourceCommand(node);
      return;
    case "openStandard":
      await openStandardCommand(node);
      return;
    case "editRule":
      await editStandardRuleCommand(node);
      return;
    case "refineStandard":
      await refineStandardCommand(node);
      return;
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
