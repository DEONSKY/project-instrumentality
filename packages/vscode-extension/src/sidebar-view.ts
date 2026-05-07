import * as vscode from "vscode";
import { type StatusSummary } from "@instrumentality/shared";
import {
  renderHtml,
  buildEntryIndex,
  type DashboardFilter,
  type DashboardAction,
  type EntryRef,
  type IndexedEntry,
} from "./webview-render";

export interface SidebarCallbacks {
  getStatus: () => StatusSummary | null;
  getKbRoot: () => string | null;
  getFilter: () => DashboardFilter;
  setFilter: (f: DashboardFilter) => void;
  onAction: (action: DashboardAction) => Promise<void>;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private entryIndex: Map<string, IndexedEntry> = new Map();

  constructor(private readonly cb: SidebarCallbacks) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg) => void this.handleMessage(msg));
    view.onDidDispose(() => {
      this.view = null;
      this.entryIndex = new Map();
    });
    this.rerender();
  }

  refresh(): void {
    if (!this.view) return;
    this.rerender();
  }

  highlight(ref: EntryRef): void {
    if (!this.view) return;
    void this.view.webview.postMessage({ command: "highlight", ref });
  }

  lookupEntry(ref: EntryRef): IndexedEntry | undefined {
    return this.entryIndex.get(`${ref.section}:${ref.id}`);
  }

  private rerender(): void {
    if (!this.view) return;
    const status = this.cb.getStatus();
    const filter = this.cb.getFilter();
    const kbRoot = this.cb.getKbRoot();
    this.entryIndex = buildEntryIndex(status);
    this.view.webview.html = renderHtml(status, filter, this.entryIndex, kbRoot, "sidebar");
  }

  private async handleMessage(msg: any): Promise<void> {
    if (!msg) return;
    switch (msg.command) {
      case "refresh":
        await this.cb.onAction({ type: "refresh" });
        return;
      case "send":
        await this.cb.onAction({ type: "send", ref: msg.ref });
        return;
      case "copy":
        await this.cb.onAction({ type: "copy", ref: msg.ref });
        return;
      case "open":
        await this.cb.onAction({ type: "open", ref: msg.ref });
        return;
      case "openStandard":
        await this.cb.onAction({ type: "openStandard", ref: msg.ref });
        return;
      case "editRule":
        await this.cb.onAction({ type: "editRule", ref: msg.ref });
        return;
      case "refineStandard":
        await this.cb.onAction({ type: "refineStandard", ref: msg.ref });
        return;
      case "showFileDiff":
        await this.cb.onAction({
          type: "showFileDiff",
          absPath: String(msg.absPath ?? ""),
          sinceCommit: String(msg.sinceCommit ?? ""),
          latestCommit: msg.latestCommit ? String(msg.latestCommit) : undefined,
        });
        return;
      case "reveal":
        // Sidebar selection — no separate target to reveal to. The host can
        // still mirror the highlight to the dashboard via highlightEntry().
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
        this.cb.setFilter(next);
        return;
      }
      case "setGroupBy": {
        const current = this.cb.getFilter();
        this.cb.setFilter({ ...current, groupBy: msg.groupBy });
        this.rerender();
        return;
      }
    }
  }
}
