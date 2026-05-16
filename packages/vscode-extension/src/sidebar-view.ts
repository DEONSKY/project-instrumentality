import * as vscode from "vscode";
import { type StatusSummary, type SectionKind } from "@instrumentality/shared";
import {
  renderHtml,
  buildEntryIndex,
  type DashboardFilter,
  type DashboardAction,
  type EntryRef,
  type IndexedEntry,
  type VerdictKey,
  type VerdictDraft,
} from "./webview-render";

const SECTION_KINDS_LOCAL: ReadonlySet<SectionKind> = new Set<SectionKind>([
  "code-drift",
  "kb-drift",
  "standards-drift",
  "conform-pending",
  "promotions",
  "lint",
]);

function isSectionKindLocal(v: unknown): v is SectionKind {
  return typeof v === "string" && SECTION_KINDS_LOCAL.has(v as SectionKind);
}

const VERDICT_KEYS_LOCAL: ReadonlySet<VerdictKey> = new Set<VerdictKey>([
  "applied",
  "exempted",
  "promoted",
  "dismissed",
  "closed_promotion",
]);

function isVerdictKeyLocal(v: unknown): v is VerdictKey {
  return typeof v === "string" && VERDICT_KEYS_LOCAL.has(v as VerdictKey);
}

function sanitizeVerdictDraftLocal(raw: unknown): VerdictDraft {
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

export interface SidebarCallbacks {
  getStatus: () => StatusSummary | null;
  getKbRoot: () => string | null;
  getFilter: () => DashboardFilter;
  setFilter: (f: DashboardFilter) => void;
  getDismissedBanners: () => ReadonlySet<SectionKind>;
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
    const dismissed = this.cb.getDismissedBanners();
    this.entryIndex = buildEntryIndex(status);
    this.view.webview.html = renderHtml(
      status,
      filter,
      this.entryIndex,
      kbRoot,
      "sidebar",
      dismissed
    );
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
      case "rerunPhase1": {
        const mode = msg.mode === "aspirational" ? "aspirational" : "current";
        await this.cb.onAction({ type: "rerunPhase1", mode });
        return;
      }
      case "openLedger":
        await this.cb.onAction({ type: "openLedger" });
        return;
      case "dismissBanner": {
        const kind = msg.kind;
        if (!isSectionKindLocal(kind)) return;
        await this.cb.onAction({ type: "dismissBanner", kind });
        return;
      }
      case "verdictSubmit": {
        const verdict = msg.verdict;
        if (!isVerdictKeyLocal(verdict)) return;
        const draft = sanitizeVerdictDraftLocal(msg.draft);
        await this.cb.onAction({ type: "verdictSubmit", ref: msg.ref, verdict, draft });
        return;
      }
      case "submoduleSync": {
        const subPath = typeof msg.subPath === "string" ? msg.subPath : "";
        const parentBranch = typeof msg.parentBranch === "string" ? msg.parentBranch : "";
        if (!subPath || !parentBranch) return;
        await this.cb.onAction({ type: "submoduleSync", subPath, parentBranch });
        return;
      }
      case "submodulePush":
        await this.cb.onAction({ type: "submodulePush" });
        return;
      case "publishDrift":
        await this.cb.onAction({ type: "publishDrift" });
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
        const current = this.cb.getFilter();
        const next: DashboardFilter = {
          ...current,
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
      case "setViewMode": {
        const current = this.cb.getFilter();
        const viewMode = msg.viewMode === "activity" ? "activity" : "pending";
        this.cb.setFilter({ ...current, viewMode });
        this.rerender();
        return;
      }
      case "setActivityGroupBy": {
        const current = this.cb.getFilter();
        const v = msg.activityGroupBy;
        const activityGroupBy =
          v === "queueKey" || v === "eventType" ? v : "date";
        this.cb.setFilter({ ...current, activityGroupBy });
        this.rerender();
        return;
      }
      case "setShowSystemEvents": {
        const current = this.cb.getFilter();
        this.cb.setFilter({ ...current, showSystemEvents: !!msg.showSystemEvents });
        this.rerender();
        return;
      }
      case "setOpenSection": {
        const section = typeof msg.section === "string" ? msg.section : "";
        if (!section) return;
        const current = this.cb.getFilter();
        // Skip the rerender — the webview already flipped data-open
        // optimistically and a rerender would steal the user's scroll.
        // The persisted state is picked up on the next genuine refresh.
        this.cb.setFilter({ ...current, openSection: section });
        await this.cb.onAction({ type: "setOpenSection", section });
        return;
      }
      case "toggleSubmodules": {
        const collapsed = !!msg.collapsed;
        const current = this.cb.getFilter();
        // Same optimistic pattern as setOpenSection: webview already
        // flipped its DOM, host just persists.
        this.cb.setFilter({ ...current, submodulesCollapsed: collapsed });
        await this.cb.onAction({ type: "toggleSubmodules", collapsed });
        return;
      }
    }
  }
}
