import * as vscode from "vscode";
import { type StatusSummary } from "@instrumentality/shared";
import {
  renderHtml,
  buildEntryIndex,
  type DashboardFilter,
  type DashboardAction,
  type EntryRef,
  type IndexedEntry,
  type SectionKind,
  type VerdictKey,
  type VerdictDraft,
} from "./webview-render";

export type { SectionKind, DashboardFilter, DashboardAction, EntryRef, IndexedEntry };

export interface DashboardCallbacks {
  getStatus: () => StatusSummary | null;
  getKbRoot: () => string | null;
  getFilter: () => DashboardFilter;
  setFilter: (f: DashboardFilter) => void;
  getDismissedBanners: () => ReadonlySet<SectionKind>;
  onAction: (action: DashboardAction) => Promise<void>;
  onReveal: (entryRef: EntryRef) => Promise<void>;
}

let panel: vscode.WebviewPanel | null = null;
let cb: DashboardCallbacks | null = null;
let entryIndex: Map<string, IndexedEntry> = new Map();

export function openDashboard(callbacks: DashboardCallbacks): void {
  cb = callbacks;
  if (panel) {
    panel.reveal();
    rerender();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "instrumentality.dashboard",
    "Instrumentality Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.onDidReceiveMessage(handleMessage);
  panel.onDidDispose(() => {
    panel = null;
    entryIndex = new Map();
  });

  rerender();
}

export function refreshDashboardIfOpen(_status: StatusSummary | null): void {
  if (!panel) return;
  rerender();
}

export function highlightEntryInDashboard(ref: EntryRef): void {
  if (!panel) return;
  void panel.webview.postMessage({ command: "highlight", ref });
}

function rerender(): void {
  if (!panel || !cb) return;
  const status = cb.getStatus();
  const filter = cb.getFilter();
  const kbRoot = cb.getKbRoot();
  const dismissed = cb.getDismissedBanners();
  entryIndex = buildEntryIndex(status);
  panel.webview.html = renderHtml(status, filter, entryIndex, kbRoot, "dashboard", dismissed);
}

async function handleMessage(msg: any): Promise<void> {
  if (!cb || !msg) return;
  switch (msg.command) {
    case "refresh":
      await cb.onAction({ type: "refresh" });
      return;
    case "send":
      await cb.onAction({ type: "send", ref: msg.ref });
      return;
    case "copy":
      await cb.onAction({ type: "copy", ref: msg.ref });
      return;
    case "open":
      await cb.onAction({ type: "open", ref: msg.ref });
      return;
    case "openStandard":
      await cb.onAction({ type: "openStandard", ref: msg.ref });
      return;
    case "editRule":
      await cb.onAction({ type: "editRule", ref: msg.ref });
      return;
    case "refineStandard":
      await cb.onAction({ type: "refineStandard", ref: msg.ref });
      return;
    case "showFileDiff":
      await cb.onAction({
        type: "showFileDiff",
        absPath: String(msg.absPath ?? ""),
        sinceCommit: String(msg.sinceCommit ?? ""),
        latestCommit: msg.latestCommit ? String(msg.latestCommit) : undefined,
      });
      return;
    case "rerunPhase1": {
      const mode = msg.mode === "aspirational" ? "aspirational" : "current";
      await cb.onAction({ type: "rerunPhase1", mode });
      return;
    }
    case "openLedger":
      await cb.onAction({ type: "openLedger" });
      return;
    case "dismissBanner": {
      const kind = msg.kind;
      if (!isSectionKind(kind)) return;
      await cb.onAction({ type: "dismissBanner", kind });
      return;
    }
    case "verdictSubmit": {
      const verdict = msg.verdict;
      if (!isVerdictKey(verdict)) return;
      const draft = sanitizeVerdictDraft(msg.draft);
      await cb.onAction({ type: "verdictSubmit", ref: msg.ref, verdict, draft });
      return;
    }
    case "submoduleSync": {
      const subPath = typeof msg.subPath === "string" ? msg.subPath : "";
      const parentBranch = typeof msg.parentBranch === "string" ? msg.parentBranch : "";
      if (!subPath || !parentBranch) return;
      await cb.onAction({ type: "submoduleSync", subPath, parentBranch });
      return;
    }
    case "submodulePush":
      await cb.onAction({ type: "submodulePush" });
      return;
    case "publishDrift":
      await cb.onAction({ type: "publishDrift" });
      return;
    case "reveal":
      await cb.onReveal(msg.ref);
      return;
    case "updateFilter": {
      const groupBy =
        msg.groupBy === "section" ||
        msg.groupBy === "file" ||
        msg.groupBy === "standard" ||
        msg.groupBy === "lifecycle"
          ? msg.groupBy
          : "section";
      const current = cb.getFilter();
      const next: DashboardFilter = {
        ...current,
        search: typeof msg.search === "string" ? msg.search : "",
        severities: new Set(Array.isArray(msg.severities) ? msg.severities : []),
        hiddenSections: new Set(Array.isArray(msg.hiddenSections) ? msg.hiddenSections : []),
        groupBy,
      };
      cb.setFilter(next);
      return;
    }
    case "setGroupBy": {
      const current = cb.getFilter();
      cb.setFilter({ ...current, groupBy: msg.groupBy });
      rerender();
      return;
    }
    case "setViewMode": {
      const current = cb.getFilter();
      const viewMode = msg.viewMode === "activity" ? "activity" : "pending";
      cb.setFilter({ ...current, viewMode });
      rerender();
      return;
    }
    case "setActivityGroupBy": {
      const current = cb.getFilter();
      const v = msg.activityGroupBy;
      const activityGroupBy =
        v === "queueKey" || v === "eventType" ? v : "date";
      cb.setFilter({ ...current, activityGroupBy });
      rerender();
      return;
    }
    case "setShowSystemEvents": {
      const current = cb.getFilter();
      cb.setFilter({ ...current, showSystemEvents: !!msg.showSystemEvents });
      rerender();
      return;
    }
    case "setOpenSection": {
      const section = typeof msg.section === "string" ? msg.section : "";
      if (!section) return;
      const current = cb.getFilter();
      cb.setFilter({ ...current, openSection: section });
      await cb.onAction({ type: "setOpenSection", section });
      return;
    }
    case "toggleSubmodules": {
      const collapsed = !!msg.collapsed;
      const current = cb.getFilter();
      cb.setFilter({ ...current, submodulesCollapsed: collapsed });
      await cb.onAction({ type: "toggleSubmodules", collapsed });
      return;
    }
  }
}

export function lookupEntry(ref: EntryRef): IndexedEntry | undefined {
  return entryIndex.get(`${ref.section}:${ref.id}`);
}

const SECTION_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>([
  "code-drift",
  "kb-drift",
  "standards-drift",
  "conform-pending",
  "promotions",
  "lint",
]);

function isSectionKind(v: unknown): v is SectionKind {
  return typeof v === "string" && SECTION_KINDS.has(v as SectionKind);
}

const VERDICT_KEYS: ReadonlySet<VerdictKey> = new Set<VerdictKey>([
  "applied",
  "exempted",
  "promoted",
  "dismissed",
  "closed_promotion",
]);

function isVerdictKey(v: unknown): v is VerdictKey {
  return typeof v === "string" && VERDICT_KEYS.has(v as VerdictKey);
}

function sanitizeVerdictDraft(raw: unknown): VerdictDraft {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: VerdictDraft = {};
  if (Array.isArray(r.filePaths)) {
    out.filePaths = r.filePaths.filter((x): x is string => typeof x === "string");
  }
  if (typeof r.reason === "string") out.reason = r.reason;
  if (typeof r.note === "string") out.note = r.note;
  return out;
}
