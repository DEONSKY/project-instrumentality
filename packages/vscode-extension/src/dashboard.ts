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
} from "./webview-render";

export type { SectionKind, DashboardFilter, DashboardAction, EntryRef, IndexedEntry };

export interface DashboardCallbacks {
  getStatus: () => StatusSummary | null;
  getKbRoot: () => string | null;
  getFilter: () => DashboardFilter;
  setFilter: (f: DashboardFilter) => void;
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
  entryIndex = buildEntryIndex(status);
  panel.webview.html = renderHtml(status, filter, entryIndex, kbRoot, "dashboard");
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
      const next: DashboardFilter = {
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
  }
}

export function lookupEntry(ref: EntryRef): IndexedEntry | undefined {
  return entryIndex.get(`${ref.section}:${ref.id}`);
}
