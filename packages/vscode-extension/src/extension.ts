import * as vscode from "vscode";
import * as path from "node:path";
import {
  findKbRoot,
  getStatus,
  getActionPrompt,
  resolveStandardPath,
  findRuleLineRange,
  rerunPhase1Prompt,
  appliedPrompt,
  exemptedPrompt,
  promotedPrompt,
  dismissedPrompt,
  closedPromotionPrompt,
  buildPushPlan,
  type StatusSummary,
} from "@instrumentality/shared";
import { syncSubmoduleBranch, runPushPlan } from "./submodule-actions";
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
let extContext: vscode.ExtensionContext | null = null;
let kbRoot: string | null = null;
let lastStatus: StatusSummary | null = null;
let prevTotals: StatusSummary["totals"] | null = null;
let prevHeadShort: string | null | undefined;
let refreshInflight: Promise<void> | null = null;
let refreshScheduled: NodeJS.Timeout | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let watchers: vscode.FileSystemWatcher[] = [];
// Submodule HEAD watchers are reconciled per-refresh (the set of
// submodules can change at runtime — add/remove via .gitmodules — so we
// keep them in a separate map keyed by the watched path).
let submoduleWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

const DEBOUNCE_MS = 300;
const PARSE_RETRY_MS = 500;
const FILTER_KEY = "instrumentality.dashboardFilter";
// Education banners are per-section and survive across workspaces — once
// you understand what "Code Drift" means, you don't need re-onboarding in
// the next project. Stored in globalState rather than workspaceState.
const DISMISSED_BANNERS_KEY = "instrumentality.dismissedBanners";

let currentFilter: DashboardFilter = {
  search: "",
  severities: new Set(),
  hiddenSections: new Set(),
  groupBy: "section",
  viewMode: "pending",
  activityGroupBy: "date",
  showSystemEvents: true,
};
let dismissedBanners: Set<SectionKind> = new Set();

export function activate(context: vscode.ExtensionContext): void {
  extContext = context;
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
    getDismissedBanners: () => dismissedBanners,
    onAction: (a) => handleAction(context, a),
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
        getDismissedBanners: () => dismissedBanners,
        onAction: (action) => handleAction(context, action),
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
  for (const w of submoduleWatchers.values()) w.dispose();
  submoduleWatchers.clear();
  if (pollInterval) clearInterval(pollInterval);
}

// ── State persistence ──────────────────────────────────────────────────────

function loadStateFromWorkspace(context: vscode.ExtensionContext): void {
  const saved = context.workspaceState.get<{
    search: string;
    severities: ("error" | "warn" | "info")[];
    hiddenSections: SectionKind[];
    groupBy?: "section" | "file" | "standard" | "lifecycle";
    viewMode?: "pending" | "activity";
    activityGroupBy?: "date" | "queueKey" | "eventType";
    showSystemEvents?: boolean;
    openSection?: string;
    submodulesCollapsed?: boolean;
  }>(FILTER_KEY);
  if (saved) {
    currentFilter = {
      search: saved.search ?? "",
      severities: new Set(saved.severities ?? []),
      hiddenSections: new Set(saved.hiddenSections ?? []),
      groupBy: saved.groupBy ?? "section",
      viewMode: saved.viewMode === "activity" ? "activity" : "pending",
      activityGroupBy:
        saved.activityGroupBy === "queueKey" || saved.activityGroupBy === "eventType"
          ? saved.activityGroupBy
          : "date",
      showSystemEvents: saved.showSystemEvents !== false,
      openSection: typeof saved.openSection === "string" ? saved.openSection : undefined,
      submodulesCollapsed: saved.submodulesCollapsed === true,
    };
  }
  const dismissedSaved = context.globalState.get<SectionKind[]>(DISMISSED_BANNERS_KEY);
  if (Array.isArray(dismissedSaved)) {
    dismissedBanners = new Set(dismissedSaved);
  }
}

function saveFilter(context: vscode.ExtensionContext, f: DashboardFilter): void {
  void context.workspaceState.update(FILTER_KEY, {
    search: f.search,
    severities: [...f.severities],
    hiddenSections: [...f.hiddenSections],
    groupBy: f.groupBy,
    viewMode: f.viewMode,
    activityGroupBy: f.activityGroupBy,
    showSystemEvents: f.showSystemEvents,
    openSection: f.openSection,
    submodulesCollapsed: f.submodulesCollapsed,
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

  // Submodule add/remove — .gitmodules change forces a re-resolution of
  // the watch set on the next refresh.
  const gitmodulesWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(kbRoot), ".gitmodules")
  );
  gitmodulesWatcher.onDidChange(onChange);
  gitmodulesWatcher.onDidCreate(onChange);
  gitmodulesWatcher.onDidDelete(onChange);
  watchers.push(gitmodulesWatcher);
  context.subscriptions.push(gitmodulesWatcher);

  restartPoll();
  void refresh();
}

/**
 * Reconcile the set of submodule HEAD-file watchers against the current
 * status. New submodules get a watcher; submodules removed from
 * .gitmodules (or no longer checked out) have theirs disposed. Watching
 * each gitdir's HEAD picks up `git -C <sub> checkout <branch>` inside
 * the submodule without polling — the user's preferred refresh source.
 */
function reconcileSubmoduleWatchers(
  context: vscode.ExtensionContext,
  status: StatusSummary | null
): void {
  const want = new Set<string>();
  if (status?.submodules) {
    if (status.submodules.parentGitdirHeadPath) {
      want.add(status.submodules.parentGitdirHeadPath);
    }
    for (const e of status.submodules.entries) {
      if (e.gitdirHeadPath) want.add(e.gitdirHeadPath);
    }
  }

  // Dispose watchers we no longer want.
  for (const [p, w] of submoduleWatchers) {
    if (!want.has(p)) {
      w.dispose();
      submoduleWatchers.delete(p);
    }
  }
  // Create watchers we don't yet have. Single-file watch via
  // RelativePattern(dir, basename) — works for paths outside the
  // workspace folder (which submodule gitdirs typically are, since
  // they live under <parent>/.git/modules/<name>).
  for (const p of want) {
    if (submoduleWatchers.has(p)) continue;
    const dir = path.dirname(p);
    const base = path.basename(p);
    const w = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(dir), base)
    );
    const onChange = () => scheduleRefresh();
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    w.onDidDelete(onChange);
    submoduleWatchers.set(p, w);
    context.subscriptions.push(w);
  }
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
  if (extContext) reconcileSubmoduleWatchers(extContext, status);
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

async function handleAction(
  context: vscode.ExtensionContext,
  action: DashboardAction
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
  if (action.type === "dismissBanner") {
    if (!dismissedBanners.has(action.kind)) {
      dismissedBanners.add(action.kind);
      void context.globalState.update(DISMISSED_BANNERS_KEY, [...dismissedBanners]);
    }
    return;
  }
  if (action.type === "rerunPhase1") {
    // Generate a Phase-1 detect prompt and ship via sendPrompt — same path
    // every other "send" uses. The agent is the one that actually invokes
    // kb_conform; the extension never calls MCP directly.
    const prompt = rerunPhase1Prompt(action.mode);
    const result = await sendPrompt(prompt);
    void vscode.window.showInformationMessage(`Instrumentality: ${result.message}`);
    return;
  }
  if (action.type === "verdictSubmit") {
    await handleVerdictSubmit(action);
    return;
  }
  if (action.type === "submoduleSync") {
    await handleSubmoduleSync(action);
    return;
  }
  if (action.type === "submodulePush") {
    await handleSubmodulePush();
    return;
  }
  if (action.type === "setOpenSection") {
    // State already updated via setFilter in the webview-side handler;
    // this branch exists so the action union is exhaustive and so a
    // future watcher could hook here. Nothing more to do.
    return;
  }
  if (action.type === "toggleSubmodules") {
    return; // Same pattern as setOpenSection — state already persisted.
  }
  if (action.type === "openLedger") {
    if (!kbRoot) {
      void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
      return;
    }
    const ledgerPath = path.join(kbRoot, "knowledge", "sync", "standards-promotions.md");
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ledgerPath));
      await vscode.window.showTextDocument(doc);
    } catch (err: any) {
      void vscode.window.showWarningMessage(
        `Instrumentality: ledger file not found at ${ledgerPath}` +
          (err?.message ? ` (${err.message})` : "")
      );
    }
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

async function handleVerdictSubmit(
  action: Extract<DashboardAction, { type: "verdictSubmit" }>
): Promise<void> {
  const entry = resolveEntry(action.ref);
  if (!entry) {
    void vscode.window.showWarningMessage("Instrumentality: entry not found (try refreshing).");
    return;
  }
  // Verdict pickers live on standards-drift and promotions only. The
  // webview's button rendering enforces that, but the host re-checks
  // because messages are untrusted input.
  const inp = entry.promptInput;
  const queueKey =
    inp.kind === "standards-drift" || inp.kind === "promotion"
      ? inp.entry.queueKey
      : null;
  if (!queueKey) {
    void vscode.window.showWarningMessage(
      "Instrumentality: verdict picker is only available on standards-drift and promotion entries."
    );
    return;
  }

  // Validate per verdict and build the call object. Webview already
  // validates client-side; this is the safety belt.
  let prompt: string;
  try {
    switch (action.verdict) {
      case "applied":
        prompt = appliedPrompt({ verdict: "applied", queueKey });
        break;
      case "exempted":
        if (!action.draft.filePaths || action.draft.filePaths.length === 0) {
          throw new Error("Exempt verdict requires at least one file.");
        }
        if (!action.draft.reason || !action.draft.reason.trim()) {
          throw new Error("Exempt verdict requires a reason.");
        }
        prompt = exemptedPrompt({
          verdict: "exempted",
          queueKey,
          filePaths: action.draft.filePaths,
          reason: action.draft.reason.trim(),
        });
        break;
      case "promoted":
        if (!action.draft.filePaths || action.draft.filePaths.length === 0) {
          throw new Error("Promote verdict requires at least one originating file.");
        }
        prompt = promotedPrompt({
          verdict: "promoted",
          queueKey,
          originatingFiles: action.draft.filePaths,
          note: action.draft.note?.trim() || undefined,
        });
        break;
      case "dismissed":
        if (!action.draft.reason || !action.draft.reason.trim()) {
          throw new Error("Dismiss verdict requires a reason.");
        }
        prompt = dismissedPrompt({
          verdict: "dismissed",
          queueKey,
          reason: action.draft.reason.trim(),
        });
        break;
      case "closed_promotion":
        if (!action.draft.filePaths || action.draft.filePaths.length === 0) {
          throw new Error("Close-promotion verdict requires at least one file.");
        }
        if (!action.draft.reason || !action.draft.reason.trim()) {
          throw new Error("Close-promotion verdict requires a reason.");
        }
        prompt = closedPromotionPrompt({
          verdict: "closed_promotion",
          queueKey,
          filePaths: action.draft.filePaths,
          reason: action.draft.reason.trim(),
        });
        break;
    }
  } catch (err: any) {
    void vscode.window.showWarningMessage(`Instrumentality: ${err?.message ?? err}`);
    return;
  }
  const result = await sendPrompt(prompt);
  void vscode.window.showInformationMessage(`Instrumentality: ${result.message}`);
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

// ── Submodule actions ──────────────────────────────────────────────────────

async function handleSubmoduleSync(
  action: Extract<DashboardAction, { type: "submoduleSync" }>
): Promise<void> {
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
    void refresh();
  } else {
    void vscode.window.showErrorMessage(
      `Instrumentality: sync failed: ${result.output || "unknown error"}`
    );
  }
}

async function handleSubmodulePush(): Promise<void> {
  if (!kbRoot) {
    void vscode.window.showWarningMessage("Instrumentality: knowledge base not detected.");
    return;
  }
  const sub = lastStatus?.submodules;
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

  const planText = plan
    .map((s) => `${s.order}. ${s.type === "parent" ? "parent" : s.path} — git ${s.action}`)
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

  const result = await runPushPlan(plan);
  void refresh();
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
