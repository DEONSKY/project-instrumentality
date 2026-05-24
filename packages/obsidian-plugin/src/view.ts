import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import {
  buildEntryIndex,
  cssEscape,
  classifyBranch,
  buildAuditFixPrompt,
  type RenderedEntry,
} from "./view-helpers";
import { confirmModal, selectModal } from "./view-modals";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import {
  getStatus,
  getActionPrompt,
  stableEntryId,
  resolveStandardPath,
  findRuleLineRange,
  primaryActionLabel,
  copyActionLabel,
  formatKbTarget,
  pipelineSegments,
  buildEntryHandles,
  groupEntries,
  SECTION_GUIDE,
  splitBySource,
  UNCOMMITTED_LABEL,
  PUBLISHED_LABEL,
  appliedPrompt,
  exemptedPrompt,
  promotedPrompt,
  dismissedPrompt,
  closedPromotionPrompt,
  acknowledgedPrompt,
  rerunPhase1Prompt,
  buildPushPlan,
  syncSubmoduleBranch,
  runPushPlan,
  hasUpstream,
  listRemotes,
  detectPushRemote,
  type StatusSummary,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type ConformRequest,
  type LintViolation,
  type StandardRule,
  type DriftLogEvent,
  type DriftKind,
  type GroupBy,
  type EntryHandle,
  type SectionKind,
  type SubmoduleEntry,
} from "@instrumentality/shared";
import { SyncWatcher } from "./watcher";
import { renderInfoBody } from "./view-info";

export interface InstrumentalityViewCallbacks {
  getKbRoot: () => string | null;
  /** Absolute path to the plugin's install directory (for runner lookup). */
  getPluginDir: () => string | null;
  getDismissedBanners: () => ReadonlySet<SectionKind>;
  dismissBanner: (kind: SectionKind) => void;
  getOpenSection: () => string | undefined;
  setOpenSection: (key: string) => void;
  getSubmodulesCollapsed: () => boolean;
  setSubmodulesCollapsed: (flag: boolean) => void;
}

type VerdictKey =
  | "applied"
  | "exempted"
  | "promoted"
  | "dismissed"
  | "closed_promotion"
  | "acknowledged";

interface VerdictDef {
  verdict: VerdictKey;
  label: string;
  /** When false, click submits directly (e.g. `applied` — no form). */
  needsForm: boolean;
  fields: {
    filePaths?: { required: boolean; label: string };
    reason?: { required: boolean };
    note?: { required: false };
  };
}

function activityEventLabel(t: string): string {
  switch (t) {
    case "conformed-applied":
      return "Conformed · applied";
    case "conformed-exempted":
      return "Conformed · exempted";
    case "conformed-promoted":
      return "Conformed · promoted";
    case "dismissed-conform":
      return "Dismissed (conform)";
    case "closed-promotion":
      return "Closed promotion";
    case "auto-dismissed-standard-removed":
      return "Auto-dismissed (standard removed)";
    case "auto-closed-promotion-rule-changed":
      return "Auto-closed (rule changed)";
    case "auto-closed-promotion-standard-removed":
      return "Auto-closed (standard removed)";
    case "drift-resolved":
      return "Drift resolved";
    case "drift-dismissed":
      return "Drift dismissed";
    case "drift-acknowledged":
      return "Acknowledged";
    case "re-bootstrap":
      return "Re-bootstrap";
    default:
      return "Unknown";
  }
}

function activityBadgeClass(t: string, isSystem: boolean): string {
  if (isSystem) return "event-auto";
  if (t === "conformed-applied" || t === "drift-resolved") return "event-applied";
  if (t === "conformed-exempted" || t === "dismissed-conform" || t === "drift-dismissed")
    return "event-exempted";
  if (t === "conformed-promoted" || t === "closed-promotion") return "event-promoted";
  if (t === "drift-acknowledged") return "event-acknowledged";
  return "event-other";
}

// Acknowledge — soft, non-resolving annotation valid on all three drift
// kinds. Mirrors the extension's ACKNOWLEDGED_VERDICT.
const ACKNOWLEDGED_VERDICT: VerdictDef = {
  verdict: "acknowledged",
  label: "Acknowledge…",
  needsForm: true,
  fields: { reason: { required: true } },
};

const VERDICTS_BY_SECTION: Partial<Record<SectionKind, VerdictDef[]>> = {
  "code-drift": [ACKNOWLEDGED_VERDICT],
  "kb-drift": [ACKNOWLEDGED_VERDICT],
  "standards-drift": [
    { verdict: "applied", label: "Apply", needsForm: false, fields: {} },
    {
      verdict: "exempted",
      label: "Exempt…",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Files to exempt" },
        reason: { required: true },
      },
    },
    {
      verdict: "promoted",
      label: "Promote…",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Originating files" },
        note: { required: false },
      },
    },
    {
      verdict: "dismissed",
      label: "Dismiss…",
      needsForm: true,
      fields: {
        reason: { required: true },
      },
    },
    ACKNOWLEDGED_VERDICT,
  ],
  promotions: [
    {
      verdict: "closed_promotion",
      label: "Close promotion",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Files in the exception" },
        reason: { required: true },
      },
    },
  ],
};

export const VIEW_TYPE_INSTRUMENTALITY = "instrumentality-view";
export const ICON_ID = "instrumentality-icon";

export class InstrumentalityView extends ItemView {
  private status: StatusSummary | null = null;
  private kbRoot: string | null = null;
  private watcher: SyncWatcher | null = null;
  private entryIndex: Map<string, RenderedEntry> = new Map();
  private filterSearch = "";
  private hiddenSections: Set<SectionKind> = new Set();
  private severityFilter: Set<"error" | "warn" | "info"> = new Set();
  private groupBy: GroupBy = "section";
  // Phase-4-equivalent state. View-mode + activity controls are kept
  // in-memory only — they reset on view reopen, which matches the rest
  // of the plugin's "no config dialog" feel.
  private viewMode: "pending" | "activity" | "info" = "pending";
  private activityGroupBy: "date" | "queueKey" | "eventType" = "date";
  private showSystemEvents = true;
  private openSection: string | undefined;
  private submodulesCollapsed = false;
  private cb: InstrumentalityViewCallbacks;
  private getKbRoot: () => string | null;

  constructor(leaf: WorkspaceLeaf, callbacks: InstrumentalityViewCallbacks) {
    super(leaf);
    this.cb = callbacks;
    this.getKbRoot = callbacks.getKbRoot;
    this.openSection = callbacks.getOpenSection();
    this.submodulesCollapsed = callbacks.getSubmodulesCollapsed();
  }

  getViewType(): string {
    return VIEW_TYPE_INSTRUMENTALITY;
  }

  getDisplayText(): string {
    return "Instrumentality";
  }

  getIcon(): string {
    return ICON_ID;
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("instrumentality-view");
    this.kbRoot = this.getKbRoot();
    if (this.kbRoot) {
      this.watcher = new SyncWatcher(this.kbRoot, () => void this.refresh());
      this.watcher.start();
    }
    await this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  /**
   * Public entry point for plugin-level Vault events (`modify`/`create`/
   * `delete` on markdown files). Routes through the watcher's debouncer
   * so we coalesce with fs.watch events and don't double-refresh on a
   * single edit that produces both vault and fs notifications.
   */
  notifySourceChanged(): void {
    this.watcher?.fire();
  }

  async refresh(): Promise<void> {
    const root = this.getKbRoot();
    this.kbRoot = root;
    // eslint-disable-next-line no-console
    console.log("[instrumentality] refresh: kbRoot =", root, "__dirname =", __dirname);
    if (!root) {
      this.status = null;
      this.render();
      return;
    }
    try {
      // Live mode — overlays drift/conform in-memory entries onto the
      // committed snapshot so the dashboard reflects working-tree state.
      // Vendored knowledge/_mcp/scripts/live-status.js wins when present;
      // otherwise the bundled runner shipped with this plugin
      // (<plugin-dir>/runner/scripts/live-status.js) is used so vaults
      // that only have the KB content still get the live overlay.
      // NOTE: `__dirname` resolves to Electron's renderer asar path in
      // Obsidian, not the plugin directory. Use the plugin manifest dir
      // (passed via getPluginDir) to locate the bundled runner.
      const pluginDir = this.cb.getPluginDir();
      const bundledRunnerPath = pluginDir
        ? path.join(pluginDir, "runner", "scripts", "live-status.js")
        : undefined;
      // F16: bundled lint-standalone.js path so the Lint section can run in
      // consumer projects without vendored knowledge/_mcp/. Currently skipped
      // in Obsidian because the lint subprocess uses process.execPath which
      // resolves to Electron — needs a node-binary lookup to actually run.
      // TODO: extend findNodeBinary to lint.ts so this works in Obsidian too.
      const bundledLintScriptPath = pluginDir
        ? path.join(pluginDir, "runner", "scripts", "lint-standalone.js")
        : undefined;
      this.status = await getStatus(root, {
        skipLint: true,
        live: true,
        bundledRunnerPath,
        bundledLintScriptPath,
      });
      // eslint-disable-next-line no-console
      console.log(
        "[instrumentality] refresh done: patternAudit findings =",
        this.status?.patternAudit?.findings?.length ?? "null"
      );
    } catch (err: any) {
      console.error("[instrumentality] getStatus failed:", err);
      this.status = null;
    }
    this.entryIndex = buildEntryIndex(this.status);
    // Refresh submodule HEAD watchers so branch switches inside a
    // submodule push the UI without waiting for the 5s poll fallback.
    if (this.watcher && this.status?.submodules) {
      const extras: string[] = [];
      if (this.status.submodules.parentGitdirHeadPath) {
        extras.push(this.status.submodules.parentGitdirHeadPath);
      }
      for (const e of this.status.submodules.entries) {
        if (e.gitdirHeadPath) extras.push(e.gitdirHeadPath);
      }
      this.watcher.setExtraPaths(extras);
    }
    // Push the latest code-path globs into the watcher so source edits
    // fire the same debounced refresh — keeps the Uncommitted preview
    // sub-groups responsive to ongoing work.
    if (this.watcher) {
      this.watcher.setCodePatterns(this.status?.livePatterns ?? null);
    }
    this.render();
  }

  // ── rendering ──────────────────────────────────────────────────────────

  private render(): void {
    this.contentEl.empty();
    const root = this.contentEl;

    if (!this.kbRoot) {
      root.createDiv({
        cls: "instrumentality-empty",
        text:
          "Knowledge base not detected. Open a vault containing a knowledge/ directory (with sync/, _rules.md, or _index.yaml).",
      });
      return;
    }

    if (!this.status) {
      root.createDiv({ cls: "instrumentality-empty", text: "Loading sync state…" });
      return;
    }

    this.renderHeader(root);
    if (this.viewMode === "info") {
      renderInfoBody(root, this.kbRoot);
      return;
    }
    this.renderSubmodulesPinned(root);
    this.renderPipelineStrip(root);
    this.renderViewModeTabs(root);
    if (this.viewMode === "activity") {
      this.renderActivityFilterBar(root);
      this.renderActivityBody(root);
    } else {
      this.renderFilterBar(root);
      this.renderSections(root);
    }
  }

  private renderViewModeTabs(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: "instrumentality-view-mode-tabs" });
    const make = (mode: "pending" | "activity" | "info", label: string) => {
      const tab = tabs.createEl("button", {
        cls: "instrumentality-view-mode-tab" + (this.viewMode === mode ? " on" : ""),
        text: label,
      });
      tab.addEventListener("click", () => {
        if (this.viewMode === mode) return;
        this.viewMode = mode;
        this.render();
      });
    };
    make("pending", "Pending");
    make("activity", "Activity");
  }

  private renderActivityFilterBar(parent: HTMLElement): void {
    const bar = parent.createDiv({
      cls: "instrumentality-filter-bar instrumentality-activity-filter-bar",
    });
    const groupBox = bar.createDiv({ cls: "instrumentality-chip-group" });
    groupBox.createSpan({ cls: "group-by-label", text: "Group:" });
    const modes: { key: "date" | "queueKey" | "eventType"; label: string }[] = [
      { key: "date", label: "Date" },
      { key: "queueKey", label: "Queue key" },
      { key: "eventType", label: "Event type" },
    ];
    for (const m of modes) {
      const chip = groupBox.createSpan({
        cls:
          "instrumentality-chip group-by-chip" +
          (this.activityGroupBy === m.key ? " on" : ""),
        text: m.label,
      });
      chip.addEventListener("click", () => {
        if (this.activityGroupBy === m.key) return;
        this.activityGroupBy = m.key;
        this.render();
      });
    }
    const toggleLabel = bar.createEl("label", { cls: "instrumentality-activity-toggle" });
    const cb = toggleLabel.createEl("input", { attr: { type: "checkbox" } });
    cb.checked = this.showSystemEvents;
    toggleLabel.appendText(" Show system events");
    cb.addEventListener("change", () => {
      this.showSystemEvents = cb.checked;
      this.render();
    });
  }

  /**
   * Workflow at-a-glance: drift → conform → promotion → lint with counts.
   * Replaces the older five-tile totals row; the lifecycle ordering tells
   * users where their backlog actually sits.
   */
  private renderPipelineStrip(parent: HTMLElement): void {
    if (!this.status) return;
    const strip = parent.createDiv({ cls: "instrumentality-pipeline-strip" });
    const segs = pipelineSegments(this.status);
    segs.forEach((s, i) => {
      const cell = strip.createDiv({
        cls: `instrumentality-pipeline-cell ${s.count > 0 ? "active" : "dim"}`,
        attr: { "data-pipeline-stage": s.stage },
      });
      cell.createDiv({ cls: "pipeline-count", text: String(s.count) });
      cell.createDiv({ cls: "pipeline-label", text: s.label });
      if (i < segs.length - 1) {
        strip.createSpan({ cls: "pipeline-arrow", text: "→" });
      }
    });
  }

  private renderHeader(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "instrumentality-header" });
    const left = header.createDiv();
    left.createEl("h2", { text: "Instrumentality" });
    const meta = left.createDiv({ cls: "instrumentality-head-meta" });
    meta.createSpan({ text: "HEAD: " });
    meta.createEl("code", { text: this.status?.currentHeadShort ?? "?" });
    this.renderHooksBadge(meta);

    const tools = header.createDiv({ cls: "instrumentality-tools" });
    const publish = tools.createEl("button", { text: "Publish", cls: "mod-cta" });
    publish.title = "Run drift + conform detection and commit the queue files";
    publish.addEventListener("click", () => void this.handlePublishDrift());
    const refresh = tools.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.refresh());
    const help = tools.createEl("button", {
      text: this.viewMode === "info" ? "✕" : "?",
      cls: "instrumentality-help-btn" + (this.viewMode === "info" ? " on" : ""),
    });
    help.title =
      this.viewMode === "info"
        ? "Close capabilities"
        : "Show MCP capabilities — what the server exposes and how to invoke it";
    help.addEventListener("click", () => {
      this.viewMode = this.viewMode === "info" ? "pending" : "info";
      this.render();
    });
  }

  private renderHooksBadge(parent: HTMLElement): void {
    const h = this.status?.hooks;
    if (!h) return;
    const labels: Record<string, string> = {
      managed: "Hooks: ✓ managed",
      partial: "Hooks: ⚠ partial",
      missing: "Hooks: ✗ missing",
    };
    const sevClass =
      h.health === "managed"
        ? "sev-info"
        : h.health === "partial"
        ? "sev-warn"
        : "sev-error";
    const tip = h.hooks
      .map(
        (f) =>
          `${f.name}: ${
            f.managed
              ? "managed"
              : f.present
              ? "present (not managed)"
              : "missing"
          }`
      )
      .join("\n");
    parent.appendText(" ");
    parent.createSpan({
      cls: `badge ${sevClass} hooks-badge`,
      text: labels[h.health],
      attr: { title: tip },
    });
  }

  private renderFilterBar(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "instrumentality-filter-bar" });

    const search = bar.createEl("input", {
      attr: { type: "search", placeholder: "Filter entries…" },
    });
    search.value = this.filterSearch;
    search.addEventListener("input", (e) => {
      const v = (e.target as HTMLInputElement).value;
      this.filterSearch = v;
      this.applyFilterDom();
    });

    const severityGroup = bar.createDiv({ cls: "instrumentality-chip-group" });
    for (const sev of ["error", "warn", "info"] as const) {
      const chip = severityGroup.createSpan({
        cls: `instrumentality-chip sev-${sev}` + (this.severityFilter.has(sev) ? " on" : ""),
        text: sev,
      });
      chip.addEventListener("click", () => {
        if (this.severityFilter.has(sev)) this.severityFilter.delete(sev);
        else this.severityFilter.add(sev);
        chip.toggleClass("on", this.severityFilter.has(sev));
        this.applyFilterDom();
      });
    }

    // Group-by chip group — switching the axis triggers a full re-render
    // because section structure changes.
    const groupBox = bar.createDiv({ cls: "instrumentality-chip-group" });
    groupBox.createSpan({ cls: "group-by-label", text: "Group:" });
    const modes: { key: GroupBy; label: string }[] = [
      { key: "section", label: "Section" },
      { key: "file", label: "File" },
      { key: "standard", label: "Standard" },
      { key: "lifecycle", label: "Lifecycle" },
    ];
    for (const m of modes) {
      const chip = groupBox.createSpan({
        cls: "instrumentality-chip group-by-chip" + (this.groupBy === m.key ? " on" : ""),
        text: m.label,
      });
      chip.addEventListener("click", () => {
        if (this.groupBy === m.key) return;
        this.groupBy = m.key;
        this.render();
      });
    }

    const clear = bar.createEl("button", { text: "Clear", cls: "instrumentality-link" });
    clear.addEventListener("click", () => {
      this.filterSearch = "";
      this.severityFilter.clear();
      this.hiddenSections.clear();
      this.render();
    });
  }

  private renderSections(parent: HTMLElement): void {
    const grid = parent.createDiv({ cls: "instrumentality-section-grid" });
    if (this.groupBy === "section") {
      this.renderAccordionSections(grid);
    } else {
      this.renderGenericGroups(grid);
    }
    this.applyFilterDom();
  }

  /**
   * Render the section cards in accordion mode: only one card body is
   * visible at a time, sections re-ordered so non-empty ones float to
   * the top, canonical order as stable tiebreak. Mirrors VSCode's
   * sidebar accordion (buildSectionsForOrder + orderSections +
   * pickOpenSection in webview-render.ts).
   */
  private renderAccordionSections(grid: HTMLElement): void {
    const s = this.status!;
    const conformCount =
      (s.conformPending.current?.requested.length ?? 0) +
      (s.conformPending.aspirational?.requested.length ?? 0);
    const sections: {
      key: string;
      count: number;
      build: (parent: HTMLElement) => void;
    }[] = [
      {
        key: "code-drift",
        count: s.codeDrift.entries.length,
        build: (p) => this.renderCodeDriftCard(p),
      },
      {
        key: "kb-drift",
        count: s.kbDrift.entries.length,
        build: (p) => this.renderKbDriftCard(p),
      },
      {
        key: "standards-drift",
        count: s.standardsDrift.entries.length,
        build: (p) => this.renderStandardsDriftCard(p),
      },
      {
        key: "conform-pending",
        count: conformCount,
        build: (p) => this.renderConformCard(p),
      },
      {
        key: "promotions",
        count: s.promotions.length,
        build: (p) => this.renderPromotionsCard(p),
      },
      {
        key: "lint",
        count: s.lint.violations.length,
        build: (p) => this.renderLintCard(p),
      },
      {
        key: "mapping-diagnostics",
        count: s.patternAudit?.findings.length ?? 0,
        build: (p) => this.renderMappingDiagnosticsCard(p),
      },
    ];

    const canonical = new Map(sections.map((sec, i) => [sec.key, i]));
    const ordered = [...sections].sort((a, b) => {
      const aHas = a.count > 0;
      const bHas = b.count > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return (canonical.get(a.key) ?? 0) - (canonical.get(b.key) ?? 0);
    });

    // Honor stored choice if still present; otherwise first non-empty;
    // otherwise first card.
    let openKey: string | null = null;
    if (this.openSection && ordered.some((sec) => sec.key === this.openSection)) {
      openKey = this.openSection;
    } else {
      openKey =
        (ordered.find((sec) => sec.count > 0) ?? ordered[0])?.key ?? null;
    }

    for (const sec of ordered) {
      sec.build(grid);
    }

    // Decorate the chosen section's card. sectionShell tags every card
    // with data-section so we can find it post-render.
    if (openKey) {
      const card = grid.querySelector(
        `.instrumentality-section-card[data-section="${cssEscape(openKey)}"]`
      );
      card?.setAttribute("data-open", "true");
    }

    // Header click swaps the open card. Skip clicks on inner controls
    // (buttons, chips, the `?` icon) so existing interactions still work.
    grid.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      const headerEl = target.closest(
        ".instrumentality-section-card > header"
      );
      if (!headerEl) return;
      const card = headerEl.closest(".instrumentality-section-card");
      if (!card) return;
      const key = card.getAttribute("data-section");
      if (!key) return;
      if (target.closest("button, a, input")) return;
      if (card.getAttribute("data-open") === "true") return;
      grid
        .querySelectorAll('.instrumentality-section-card[data-open="true"]')
        .forEach((el) => el.removeAttribute("data-open"));
      card.setAttribute("data-open", "true");
      this.openSection = key;
      this.cb.setOpenSection(key);
    });
  }

  /**
   * Render top-level groups for non-section group-by modes via the shared
   * `groupEntries` projection. Entries are rebuilt by handle so each
   * surface keeps its own row formatting.
   */
  private renderGenericGroups(parent: HTMLElement): void {
    const handles = buildEntryHandles(this.status!);
    const groups = groupEntries(handles, this.groupBy);
    for (const g of groups) {
      const card = parent.createDiv({
        cls: "instrumentality-section-card",
        attr: { "data-section": g.key },
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: g.label });
      h2.createSpan({ cls: "count", text: String(g.entries.length) });
      if (g.hint) {
        header.createDiv({ cls: "group-hint", text: g.hint });
      }
      const body = card.createDiv({ cls: "body" });
      if (g.entries.length === 0) {
        this.placeholder(body, "No entries");
        continue;
      }
      for (const h of g.entries) {
        this.renderEntryByHandle(body, h);
      }
    }
  }

  private renderEntryByHandle(parent: HTMLElement, h: EntryHandle): void {
    const s = this.status!;
    switch (h.section) {
      case "code-drift": {
        const i = s.codeDrift.entries.findIndex((e, idx) => stableEntryId(e.kbTarget, idx) === h.id);
        if (i >= 0) {
          const e = s.codeDrift.entries[i];
          this.renderCodeDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "kb-drift": {
        const i = s.kbDrift.entries.findIndex((e, idx) => stableEntryId(e.kbFile, idx) === h.id);
        if (i >= 0) {
          const e = s.kbDrift.entries[i];
          this.renderKbDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "standards-drift": {
        const i = s.standardsDrift.entries.findIndex(
          (e, idx) => stableEntryId(`${e.mode}:${e.queueKey}`, idx) === h.id
        );
        if (i >= 0) {
          const e = s.standardsDrift.entries[i];
          this.renderStandardsDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "conform-pending": {
        for (const p of [s.conformPending.current, s.conformPending.aspirational]) {
          if (!p) continue;
          const idx = p.requested.findIndex((r, j) => stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, j) === h.id);
          if (idx >= 0) {
            this.renderConformRow(parent, p, p.requested[idx], idx);
            return;
          }
        }
        return;
      }
      case "promotions": {
        const i = s.promotions.findIndex((e, idx) => stableEntryId(e.queueKey, idx) === h.id);
        if (i >= 0) this.renderPromotionRow(parent, s.promotions[i], i);
        return;
      }
      case "lint": {
        const i = s.lint.violations.findIndex(
          (v, idx) => stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, idx) === h.id
        );
        if (i >= 0) this.renderLintRow(parent, s.lint.violations[i], i);
        return;
      }
    }
  }

  private sectionShell(
    parent: HTMLElement,
    kind: SectionKind,
    title: string,
    count: number,
    badgeText?: string,
    hint?: string,
    extraBanner?: (parent: HTMLElement) => void
  ): HTMLElement {
    const card = parent.createDiv({ cls: "instrumentality-section-card", attr: { "data-section": kind } });
    const header = card.createEl("header");
    const h2 = header.createEl("h2");
    h2.createSpan({ text: title });
    h2.createSpan({ cls: "count", text: String(count) });
    if (badgeText) h2.createSpan({ cls: "badge", text: badgeText });
    if (hint) header.createDiv({ cls: "group-hint", text: hint });

    // Education banner + "?" icon. Dismissed → "?" in header, banner hidden.
    // Click "?" → transient banner show (no re-persist, by design).
    const dismissed = this.cb.getDismissedBanners().has(kind);
    if (dismissed) {
      const help = h2.createEl("button", {
        cls: "instrumentality-banner-question",
        text: "?",
        attr: { title: `Show ${SECTION_GUIDE[kind].label} lifecycle` },
      });
      help.addEventListener("click", (e) => {
        e.stopPropagation();
        const banner = card.querySelector(
          ".instrumentality-banner.education"
        ) as HTMLElement | null;
        if (banner) banner.removeClass("hidden");
        help.remove();
      });
    }
    this.renderEducationBanner(card, kind, dismissed);

    // Section-level extras (e.g. stale-baseline banner on conform pending).
    if (extraBanner) extraBanner(card);

    return card.createDiv({ cls: "body" });
  }

  private renderEducationBanner(
    parent: HTMLElement,
    kind: SectionKind,
    dismissed: boolean
  ): void {
    const guide = SECTION_GUIDE[kind];
    const banner = parent.createDiv({
      cls: "instrumentality-banner education" + (dismissed ? " hidden" : ""),
      attr: { "data-banner-kind": kind },
    });
    const content = banner.createDiv({ cls: "banner-content" });
    const explainer = content.createDiv({ cls: "banner-explainer" });
    explainer.createEl("strong", { text: guide.label });
    explainer.appendText(" — " + guide.what + " ");
    explainer.createEl("em", { text: guide.todo });
    content.createEl("pre", { cls: "banner-diagram", text: guide.lifecycleDiagram });
    const dismissBtn = banner.createEl("button", { text: "Got it" });
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Optimistic UI then persist.
      banner.addClass("hidden");
      this.cb.dismissBanner(kind);
      // Insert the "?" icon next to the count.
      const h2 = parent.querySelector("header h2");
      if (h2 && !h2.querySelector(".instrumentality-banner-question")) {
        const help = h2.createEl("button", {
          cls: "instrumentality-banner-question",
          text: "?",
          attr: { title: `Show ${guide.label} lifecycle` },
        });
        help.addEventListener("click", (ev) => {
          ev.stopPropagation();
          banner.removeClass("hidden");
          help.remove();
        });
      }
    });
  }

  private placeholder(parent: HTMLElement, text: string): void {
    parent.createDiv({ cls: "instrumentality-placeholder", text });
  }

  /**
   * Render a section body split into "Uncommitted preview" and "Published"
   * sub-groups. When only one bucket has entries the header is omitted so
   * the section looks like it always did. Mirrors the VS Code renderer
   * exactly — keeping both UIs in lockstep.
   */
  private renderBucketedBody<T extends { source?: "committed" | "working-tree" }>(
    parent: HTMLElement,
    entries: readonly T[],
    rowFn: (parent: HTMLElement, entry: T, index: number, isUncommitted: boolean) => void,
    emptyMessage: string,
    sectionKind: SectionKind
  ): void {
    if (entries.length === 0) {
      this.placeholder(parent, emptyMessage);
      return;
    }
    const { uncommitted, published } = splitBySource(entries);
    if (uncommitted.length === 0) {
      published.forEach((e, i) => rowFn(parent, e, i, false));
      return;
    }
    if (published.length === 0) {
      this.renderBucketHeader(
        parent,
        UNCOMMITTED_LABEL,
        uncommitted.length,
        SECTION_GUIDE[sectionKind].uncommittedHint
      );
      uncommitted.forEach((e, i) => rowFn(parent, e, i, true));
      return;
    }
    this.renderBucketHeader(
      parent,
      UNCOMMITTED_LABEL,
      uncommitted.length,
      SECTION_GUIDE[sectionKind].uncommittedHint
    );
    uncommitted.forEach((e, i) => rowFn(parent, e, i, true));
    this.renderBucketHeader(parent, PUBLISHED_LABEL, published.length);
    published.forEach((e, i) => rowFn(parent, e, i, false));
  }

  private renderBucketHeader(
    parent: HTMLElement,
    label: string,
    count: number,
    hint?: string
  ): void {
    const wrap = parent.createDiv({ cls: "instrumentality-bucket-header" });
    wrap.createEl("strong", { text: label });
    wrap.createSpan({ cls: "count", text: ` ${count}` });
    if (hint) wrap.createDiv({ cls: "group-hint", text: hint });
  }

  private renderCodeDriftCard(parent: HTMLElement): void {
    const entries = this.status!.codeDrift.entries;
    const baseline = this.status!.codeDrift.baseline.sha;
    const body = this.sectionShell(
      parent,
      "code-drift",
      SECTION_GUIDE["code-drift"].label + "s",
      entries.length,
      baseline ? baseline.slice(0, 7) : undefined,
      SECTION_GUIDE["code-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderCodeDriftRow(p, e, i, isUncommitted),
      "No code drift",
      "code-drift"
    );
  }

  private renderCodeDriftRow(parent: HTMLElement, e: CodeDriftEntry, i: number, isUncommitted: boolean = false): void {
    const id = stableEntryId(e.kbTarget, i);
    const targetMissing = this.kbRoot
      ? !fs.existsSync(path.join(this.kbRoot, "knowledge", e.kbTarget))
      : false;
    const sev = targetMissing || e.hasShared ? "warn" : "info";
    const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.kbTarget });
      if (e.hasShared) h2.createSpan({ cls: "badge shared", text: "shared" });
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview — not yet published" },
        });
      }
      if (targetMissing) {
        h2.createSpan({
          cls: "badge sev-warn",
          text: "missing",
          attr: { title: "Target KB file does not exist — click Scaffold to create it" },
        });
      }
    };
    const meta = `${e.codeFiles.length} file(s) · ${e.codeFiles
      .slice(0, 3)
      .map((f) => path.basename(f.path))
      .join(", ")}${e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : ""}`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const row = div.createDiv();
      row.createSpan({ text: "KB target: " });
      row.createEl("code", { text: e.kbTarget });
      this.renderAcknowledgement(div, e.acknowledgement);
      if (targetMissing) {
        const note = div.createDiv({ cls: "rule-row warn-note" });
        note.createSpan({ text: "⚠ Target KB file does not exist. Use " });
        note.createEl("strong", { text: "Scaffold KB doc" });
        note.createSpan({ text: " to copy a scaffold prompt for the agent, or add an exception to the matching " });
        note.createEl("code", { text: "code_path_patterns" });
        note.createSpan({ text: " entry in " });
        note.createEl("code", { text: "_rules.md" });
        note.createSpan({ text: " if this code should not be documented." });
      }
      const filesBlock = div.createDiv();
      filesBlock.createEl("strong", { text: "Changed files:" });
      const ul = filesBlock.createEl("ul");
      for (const f of e.codeFiles) {
        const li = ul.createEl("li");
        li.createEl("code", { text: f.path });
        if (f.author) this.renderAuthorBadge(li, f.author);
      }
    };
    const openOverride = targetMissing
      ? {
          label: "Scaffold KB doc",
          onClick: async () => {
            const fileList = e.codeFiles.map((f) => `- \`${f.path}\``).join("\n");
            const prompt = [
              `The KB target \`${e.kbTarget}\` does not exist yet but is required by a \`code_path_patterns\` rule in \`_rules.md\`. The following code file(s) currently have no documentation:`,
              "",
              fileList,
              "",
              "Please:",
              `1. Run \`kb_scaffold\` to create \`${e.kbTarget}\` using the appropriate template (infer type and group from the path).`,
              "2. Read the listed code file(s) and follow the returned fill prompt to populate the new KB doc from their actual behavior — fields, endpoints, validation, etc.",
              "3. Run `kb_autotag` on the new file so it becomes discoverable via `kb_get`.",
              "",
              "If the code is **not** meant to be documented (test fixture, deprecated, internal-only), propose adding an `exceptions:` entry to the matching `code_path_patterns` rule in `_rules.md` instead of scaffolding — and explain why before making the change.",
            ].join("\n");
            await navigator.clipboard.writeText(prompt);
            new Notice("Instrumentality: scaffold prompt copied to clipboard.");
          },
        }
      : undefined;
    this.entryShell({
      parent,
      section: "code-drift",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: path.join("knowledge", e.kbTarget),
      diffableFiles: e.codeFiles
        .filter((f) => !!f.sinceCommit)
        .map((f) => ({ relPath: f.path, sinceCommit: f.sinceCommit!, latestCommit: f.latestCommit })),
      verdictQueueKey: e.kbTarget,
      driftKind: "code-drift",
      isUncommitted,
      openOverride,
    });
  }

  private renderKbDriftCard(parent: HTMLElement): void {
    const entries = this.status!.kbDrift.entries;
    const body = this.sectionShell(
      parent,
      "kb-drift",
      SECTION_GUIDE["kb-drift"].label + "s",
      entries.length,
      undefined,
      SECTION_GUIDE["kb-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderKbDriftRow(p, e, i, isUncommitted),
      "No KB drift",
      "kb-drift"
    );
  }

  private renderKbDriftRow(parent: HTMLElement, e: KbDriftEntry, i: number, isUncommitted: boolean = false): void {
    const id = stableEntryId(e.kbFile, i);
    const sev = e.unmapped ? "warn" : "info";
    const text = e.kbFile + " " + e.codeAreas.join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.kbFile });
      if (e.unmapped) h2.createSpan({ cls: "badge sev-warn", text: "unmapped" });
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview — not yet published" },
        });
      }
    };
    const meta = `${e.codeAreas.length} code area(s)${
      e.refCount && e.refCount.count > 0 ? ` · ${e.refCount.count} reference(s)` : ""
    }`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.renamedFrom) {
        const row = div.createDiv();
        row.createSpan({ text: "Renamed from: " });
        row.createEl("code", { text: e.renamedFrom });
      }
      if (e.sinceCommit) {
        const row = div.createDiv();
        row.createSpan({ text: "Since: " });
        row.createEl("code", { text: e.sinceCommit });
        row.createSpan({ text: ` (${e.sinceDate ?? ""})` });
        if (e.author) this.renderAuthorBadge(row, e.author);
      }
      this.renderAcknowledgement(div, e.acknowledgement);
      const areas = div.createDiv();
      areas.createSpan({ text: "Code areas: " });
      if (e.codeAreas.length === 0) {
        areas.createEl("em", { text: "none mapped" });
      } else {
        e.codeAreas.forEach((p, idx) => {
          if (idx > 0) areas.appendText(", ");
          areas.createEl("code", { text: p });
        });
      }
    };
    this.entryShell({
      parent,
      section: "kb-drift",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: path.join("knowledge", e.kbFile),
      diffableFiles: e.sinceCommit
        ? [{ relPath: path.join("knowledge", e.kbFile), sinceCommit: e.sinceCommit, latestCommit: e.latestCommit }]
        : [],
      verdictQueueKey: e.kbFile,
      driftKind: "kb-drift",
      isUncommitted,
    });
  }

  private renderStandardsDriftCard(parent: HTMLElement): void {
    const entries = this.status!.standardsDrift.entries;
    const body = this.sectionShell(
      parent,
      "standards-drift",
      SECTION_GUIDE["standards-drift"].label,
      entries.length,
      undefined,
      SECTION_GUIDE["standards-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderStandardsDriftRow(p, e, i, isUncommitted),
      "No standards drift",
      "standards-drift"
    );
  }

  private renderStandardsDriftRow(
    parent: HTMLElement,
    e: StandardsDriftEntry,
    i: number,
    isUncommitted: boolean = false
  ): void {
    // Disambiguate mode collisions: a (file, rule) pair can appear in both
    // current and aspirational queues simultaneously. Folding mode into
    // the id makes the entry-index keys unique.
    const id = stableEntryId(`${e.mode}:${e.queueKey}`, i);
    const sev = (e.severity as "error" | "warn" | "info" | null) ?? null;
    const fileCount = Object.values(e.filesByParty).reduce((s, fs) => s + fs.length, 0);
    const firstFile = Object.values(e.filesByParty).flat()[0]?.path;
    const ruleHint = e.resolvedRule?.title ? ` · ${e.resolvedRule.title}` : "";
    const text =
      e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "") + " " + (e.resolvedRule?.title ?? "");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (sev) h2.createSpan({ cls: `badge sev-${sev}`, text: sev });
      if (e.mode === "aspirational") {
        h2.createSpan({
          cls: "badge advisory-mode",
          text: "advisory",
          attr: { title: "Advisory backlog — not PR-blocking" },
        });
      }
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview — not yet published" },
        });
      }
    };
    const meta = `${e.standardId ?? "?"}${e.standardKind ? ` (${e.standardKind})` : ""} · ${fileCount} file(s)${ruleHint}`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.standardId) {
        const row = div.createDiv();
        row.createSpan({ text: "Standard: " });
        row.createEl("code", { text: e.standardId });
        if (e.standardKind) row.appendText(` (${e.standardKind})`);
      }
      if (e.ruleId) {
        const row = div.createDiv();
        row.createSpan({ text: "Rule id: " });
        row.createEl("code", { text: e.ruleId });
      }
      this.appendRuleBlock(div, e.resolvedRule);
      if (e.reason) {
        const row = div.createDiv();
        row.createEl("strong", { text: "Drift reason: " });
        row.appendText(e.reason);
      }
      this.renderAcknowledgement(div, e.acknowledgement);
      for (const [party, files] of Object.entries(e.filesByParty)) {
        const block = div.createDiv();
        block.createEl("strong", {
          text: party === "_" ? "Files:" : `Files (party: ${party}):`,
        });
        const ul = block.createEl("ul");
        for (const f of files) {
          const li = ul.createEl("li");
          li.createEl("code", { text: f.path });
          if (f.author) this.renderAuthorBadge(li, f.author);
        }
      }
    };
    const diffableFiles: { relPath: string; sinceCommit: string; latestCommit?: string }[] = [];
    for (const files of Object.values(e.filesByParty)) {
      for (const f of files) {
        if (!f.sinceCommit) continue;
        diffableFiles.push({ relPath: f.path, sinceCommit: f.sinceCommit, latestCommit: f.latestCommit });
      }
    }
    // Files for verdict-form file selectors. Order matches the queue file.
    const verdictFiles: string[] = [];
    for (const arr of Object.values(e.filesByParty)) {
      for (const f of arr) verdictFiles.push(f.path);
    }
    this.entryShell({
      parent,
      section: "standards-drift",
      id,
      sev: sev ?? "info",
      text,
      summary,
      meta,
      detail,
      sourceFile: firstFile,
      standardId: e.standardId,
      ruleId: e.ruleId,
      authorEntry: e,
      diffableFiles,
      modeAttr: e.mode,
      verdictQueueKey: e.queueKey,
      verdictFiles,
      driftKind: "standards-drift",
      isUncommitted,
    });
  }

  private renderAuthorBadge(parent: HTMLElement, author: string): void {
    parent.createSpan({
      cls: "instrumentality-author-badge",
      text: ` @${author}`,
      attr: { title: "Commit author" },
    });
  }

  private renderAcknowledgement(
    parent: HTMLElement,
    ack: { by: string; atCommit: string; atDate: string; reason: string } | undefined
  ): void {
    if (!ack) return;
    const box = parent.createDiv({
      cls: "instrumentality-ack-badge",
      attr: {
        title: `Acknowledged by ${ack.by} at ${ack.atCommit} (${ack.atDate})`,
      },
    });
    box.appendText("✓ Acknowledged by ");
    box.createEl("strong", { text: `@${ack.by}` });
    box.appendText(" at ");
    box.createEl("code", { text: ack.atCommit });
    box.appendText(` — "${ack.reason}"`);
  }

  private appendRuleBlock(parent: HTMLElement, rule: StandardRule | null | undefined): void {
    if (!rule) return;
    const block = parent.createDiv({ cls: "rule-block" });
    if (rule.title) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Rule:" });
      row.createSpan({ cls: "rule-title", text: ` ${rule.title}` });
    }
    if (rule.severity) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Severity:" });
      row.appendText(" ");
      row.createSpan({ cls: `badge sev-${rule.severity}`, text: rule.severity });
    }
    if (rule.description) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "What:" });
      row.appendText(` ${rule.description}`);
    }
    if (rule.why) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Why:" });
      row.appendText(` ${rule.why}`);
    }
    if (rule.fixHint) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Fix:" });
      row.appendText(` ${rule.fixHint}`);
    }
    if (rule.examples?.length) {
      const row = block.createDiv({ cls: "rule-row rule-aside" });
      row.createSpan({ cls: "rule-label", text: "Examples:" });
      row.appendText(` ${rule.examples.length} attached (open the standard to view)`);
    }
    if (rule.exceptions?.length) {
      const row = block.createDiv({ cls: "rule-row rule-aside" });
      row.createSpan({ cls: "rule-label", text: "Exceptions:" });
      row.appendText(` ${rule.exceptions.length} recorded`);
    }
  }

  private renderConformCard(parent: HTMLElement): void {
    const c = this.status!.conformPending.current;
    const a = this.status!.conformPending.aspirational;
    const total = (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
    const stale = c?.staleAgainstHead || a?.staleAgainstHead;

    const renderStaleBanner = stale
      ? (card: HTMLElement) => {
          const staleMode: "current" | "aspirational" = c?.staleAgainstHead
            ? "current"
            : "aspirational";
          const staleSha = c?.staleAgainstHead
            ? c.head_sha_short
            : a?.head_sha_short ?? "";
          const headSha = this.status?.currentHeadShort ?? "(unknown)";
          const banner = card.createDiv({ cls: "instrumentality-banner stale" });
          const txt = banner.createDiv({ cls: "banner-text" });
          txt.createEl("strong", { text: "Pending session is stale." });
          txt.appendText(" Baseline ");
          txt.createEl("code", { text: staleSha });
          txt.appendText(" · HEAD ");
          txt.createEl("code", { text: headSha });
          txt.appendText(". Re-run Phase 1 before submitting judgments.");
          const btn = banner.createEl("button", { text: "Re-run Phase 1" });
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            // Pure observer: copy the prompt; the user pastes into their
            // agent. Same dispatch model as every other action in this view.
            await navigator.clipboard.writeText(rerunPhase1Prompt(staleMode));
            new Notice("Instrumentality: Re-run Phase 1 prompt copied.");
          });
        }
      : undefined;

    const body = this.sectionShell(
      parent,
      "conform-pending",
      SECTION_GUIDE["conform-pending"].label,
      total,
      stale ? "baseline stale" : undefined,
      SECTION_GUIDE["conform-pending"].what,
      renderStaleBanner
    );
    if (total === 0) return this.placeholder(body, "No conform pending");
    for (const p of [c, a]) {
      if (!p || p.requested.length === 0) continue;
      p.requested.forEach((r, i) => this.renderConformRow(body, p, r, i));
    }
  }

  private renderConformRow(
    parent: HTMLElement,
    p: ConformPending & { staleAgainstHead?: boolean },
    r: ConformRequest,
    i: number
  ): void {
    const id = stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i);
    const sev = p.staleAgainstHead ? "warn" : "info";
    const ruleHint = r.resolvedRules && r.resolvedRules.length > 0
      ? ` · ${r.resolvedRules.map((rr) => rr.title ?? rr.id).join(", ")}`
      : "";
    const text =
      r.file + " " + r.standard_id + " " + r.rule_ids.join(" ") +
      " " + (r.resolvedRules?.map((rr) => rr.title ?? "").join(" ") ?? "");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: r.file });
      if (p.staleAgainstHead) h2.createSpan({ cls: "badge sev-warn", text: "stale" });
    };
    const meta = `${r.standard_id} · ${r.rule_ids.join(", ")} (${p.mode} @ ${p.head_sha_short})${ruleHint}`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      div.createDiv({ text: `Mode: ${p.mode}` });
      const baseline = div.createDiv();
      baseline.createSpan({ text: "Baseline: " });
      baseline.createEl("code", { text: p.head_sha_short });
      baseline.createSpan({ text: ` (${p.head_date})` });
      if (p.scope) {
        const sc = div.createDiv();
        sc.createSpan({ text: "Scope: " });
        sc.createEl("code", { text: p.scope });
      }
      const std = div.createDiv();
      std.createSpan({ text: "Standard: " });
      std.createEl("code", { text: r.standard_id });
      const rules = div.createDiv();
      rules.createSpan({ text: "Rules: " });
      r.rule_ids.forEach((x, idx) => {
        if (idx > 0) rules.appendText(", ");
        rules.createEl("code", { text: x });
      });
      // Render resolved rule details: title, why, fix-hint per rule.
      if (r.resolvedRules) {
        for (const rr of r.resolvedRules) this.appendRuleBlock(div, rr);
      }
    };
    this.entryShell({
      parent,
      section: "conform-pending",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: r.file,
      standardId: r.standard_id,
      ruleId: r.rule_ids[0] ?? null,
    });
  }

  private renderPromotionsCard(parent: HTMLElement): void {
    const entries = this.status!.promotions;
    const body = this.sectionShell(
      parent,
      "promotions",
      SECTION_GUIDE.promotions.label,
      entries.length,
      undefined,
      SECTION_GUIDE.promotions.what
    );
    if (entries.length === 0) return this.placeholder(body, "No pending promotions");
    entries.forEach((e, i) => this.renderPromotionRow(body, e, i));
  }

  private renderPromotionRow(parent: HTMLElement, e: PromotionEntry, i: number): void {
    const id = stableEntryId(e.queueKey, i);
    const sev = (e.severity as "error" | "warn" | "info" | null) ?? "info";
    const ruleHint = e.resolvedRule?.title ? ` · ${e.resolvedRule.title}` : "";
    const text =
      e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ") + " " + (e.resolvedRule?.title ?? "");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (e.severity) h2.createSpan({ cls: `badge sev-${e.severity}`, text: e.severity });
    };
    const meta = `${e.files.length} file(s) · ${e.standardId ?? "?"}${ruleHint}`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const rule = div.createDiv();
      rule.createSpan({ text: "Rule: " });
      rule.createEl("code", { text: e.ruleId ?? "?" });
      this.appendRuleBlock(div, e.resolvedRule);
      const filesBlock = div.createDiv();
      filesBlock.createEl("strong", { text: "Files:" });
      const ul = filesBlock.createEl("ul");
      for (const f of e.files) {
        const li = ul.createEl("li");
        li.createEl("code", { text: f.path });
        li.appendText(` — promoted ${f.promotedAt}`);
        if (f.note) {
          li.appendText(" ");
          li.createEl("em", { text: f.note });
        }
      }
      this.renderSuppressionContract(div, e);
    };
    const verdictFiles = e.files.map((f) => f.path);
    this.entryShell({
      parent,
      section: "promotions",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: e.files[0]?.path,
      standardId: e.standardId,
      ruleId: e.ruleId,
      verdictQueueKey: e.queueKey,
      verdictFiles,
    });
  }

  // Suppression contract panel: surfaces the ledger semantics inline so
  // a user staring at a promoted entry knows *why* it isn't re-firing
  // and *when* it will auto-clear. Fingerprint shown as stored at
  // promote time — no live recompute.
  private renderSuppressionContract(parent: HTMLElement, e: PromotionEntry): void {
    const panel = parent.createDiv({ cls: "instrumentality-suppression-contract" });
    panel.createDiv({ cls: "sc-title", text: "Suppression contract" });

    const earliest = e.files.map((f) => f.promotedAt).sort()[0] ?? null;
    const fingerprintShort = e.ruleFingerprint
      ? e.ruleFingerprint.length > 22
        ? e.ruleFingerprint.slice(0, 22) + "…"
        : e.ruleFingerprint
      : "(none recorded)";
    const fingerprintTooltip =
      "Hash inputs: rule.description, rule.severity, canonicalized rule.detect, " +
      "canonicalized rule.applies_to, plus parties[].applies_to.paths for contracts. " +
      "Mismatch on next sweep → auto-close.";

    const row1 = panel.createDiv({ cls: "sc-row" });
    row1.createSpan({ cls: "sc-label", text: "Suppressed since:" });
    row1.appendText(" ");
    if (earliest) row1.createEl("code", { text: earliest });
    else row1.createEl("em", { text: "(no files)" });

    const row2 = panel.createDiv({ cls: "sc-row" });
    row2.createSpan({ cls: "sc-label", text: "Rule fingerprint:" });
    row2.appendText(" ");
    row2.createEl("code", { text: fingerprintShort, attr: { title: fingerprintTooltip } });

    const row3 = panel.createDiv({ cls: "sc-row" });
    row3.createSpan({ cls: "sc-label", text: "Auto-closes if:" });
    row3.appendText(" rule definition changes (fingerprint mismatch on next Phase 1 sweep) or the standard/rule is removed.");

    const row4 = panel.createDiv({ cls: "sc-row" });
    row4.createSpan({ cls: "sc-label", text: "Or close manually:" });
    row4.appendText(" use the ");
    row4.createEl("em", { text: "Close promotion" });
    row4.appendText(" verdict to write an exception into the rule.");

    const actions = panel.createDiv({ cls: "sc-row sc-actions" });
    const openLedger = actions.createEl("button", { text: "Open ledger" });
    openLedger.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!this.kbRoot) {
        new Notice("Instrumentality: knowledge base not detected.");
        return;
      }
      const abs = path.join(
        this.kbRoot,
        "knowledge",
        "sync",
        "standards-promotions.md"
      );
      await this.openPath(abs);
    });
  }

  private renderLintCard(parent: HTMLElement): void {
    const v = this.status!.lint.violations;
    const ran = this.status!.lint.ran;
    const body = this.sectionShell(
      parent,
      "lint",
      SECTION_GUIDE.lint.label,
      v.length,
      ran ? undefined : "unavailable",
      SECTION_GUIDE.lint.what
    );
    if (!ran) {
      // F16: when the lint subprocess didn't run, point the user at how to
      // configure it. The plugin bundles a standalone lint script and tries
      // it automatically; this hint covers cases where it can't spawn (no
      // node on PATH, etc).
      return this.placeholder(
        body,
        (this.status!.lint.error || "Lint subprocess unavailable in this workspace.") +
          " Vendor knowledge/_mcp/scripts/lint-standalone.js in your project to enable inline lint, or configure your own lint binary."
      );
    }
    if (v.length === 0) return this.placeholder(body, "No lint issues");
    v.forEach((violation, i) => this.renderLintRow(body, violation, i));
  }

  private renderLintRow(parent: HTMLElement, v: LintViolation, i: number): void {
    const id = stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i);
    const text = v.file + " " + v.message;
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: path.basename(v.file) });
      h2.createSpan({ cls: `badge sev-${v.severity}`, text: v.severity });
    };
    const meta = `${v.file} — ${v.message}`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const fileRow = div.createDiv();
      fileRow.createSpan({ text: "File: " });
      fileRow.createEl("code", { text: v.file });
      div.createDiv({ text: `Message: ${v.message}` });
    };
    this.entryShell({
      parent,
      section: "lint",
      id,
      sev: v.severity,
      text,
      summary,
      meta,
      detail,
      sourceFile: v.file,
    });
  }

  // ── Mapping diagnostics card ───────────────────────────────────────────
  //
  // Panel-level audit findings from knowledge/_mcp/lib/pattern-audit.js —
  // surfaces structural problems with code_path_patterns in _rules.md. The
  // data arrives via the live-status runner; the card is empty when no
  // findings are present.

  private renderMappingDiagnosticsCard(parent: HTMLElement): void {
    const audit = this.status!.patternAudit;
    const findings = audit?.findings ?? [];
    const body = this.sectionShell(
      parent,
      "mapping-diagnostics",
      SECTION_GUIDE["mapping-diagnostics"].label,
      findings.length,
      undefined,
      SECTION_GUIDE["mapping-diagnostics"].what
    );
    if (findings.length === 0) {
      return this.placeholder(body, "No mapping diagnostics — patterns are consistent with the current filesystem.");
    }
    findings.forEach((f, i) => this.renderMappingDiagnosticsRow(body, f, i));
  }

  private renderMappingDiagnosticsRow(
    parent: HTMLElement,
    f: NonNullable<typeof this.status>["patternAudit"] extends infer A
      ? A extends { findings: (infer F)[] }
        ? F
        : never
      : never,
    i: number
  ): void {
    const id = stableEntryId(`audit:${f.type}`, i);
    const text = JSON.stringify(f);
    const summary = (h2: HTMLElement) => {
      switch (f.type) {
        case "orphan_pattern":
          h2.createSpan({ cls: "title", text: "Orphan pattern: " });
          h2.createEl("code", { text: formatKbTarget(f.kb_target) });
          if (f.is_submodule_pattern) h2.createSpan({ cls: "badge sev-info", text: "submodule" });
          break;
        case "ghost_target":
          h2.createSpan({ cls: "title", text: "Ghost target: " });
          h2.createEl("code", { text: f.resolved_target });
          break;
        case "convention_violation":
          h2.createSpan({ cls: "title", text: "Convention violation: " });
          h2.createEl("code", { text: formatKbTarget(f.kb_target) });
          break;
        case "unmapped_kb_group":
          h2.createSpan({ cls: "title", text: "Unmapped KB folder: " });
          h2.createEl("code", { text: f.folder });
          h2.createSpan({ cls: "badge sev-info", text: `${f.count} file(s)` });
          break;
        case "fanout_with_hardcoded":
          h2.createSpan({ cls: "title", text: "Overbroad hardcoded pattern: " });
          h2.createEl("code", { text: formatKbTarget(f.kb_target) });
          break;
      }
    };
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      switch (f.type) {
        case "orphan_pattern": {
          if (f.intent) div.createDiv({ text: `Intent: ${f.intent}` });
          div.createDiv({ text: "Paths match no source files:" });
          const ul = div.createEl("ul");
          for (const p of f.paths) ul.createEl("li").createEl("code", { text: p });
          break;
        }
        case "ghost_target":
          div.createDiv({
            text: "kb_target points at a KB file that does not exist. Either create the KB file or fix the pattern in _rules.md.",
          });
          break;
        case "convention_violation":
          div.createDiv({
            text: `intent "${f.intent}" conventionally targets ${f.expected_folder} but this pattern points elsewhere.`,
          });
          break;
        case "unmapped_kb_group": {
          div.createDiv({
            text: "No code_path_patterns entry targets these KB files. Code→KB drift detection is silent for them.",
          });
          const ul = div.createEl("ul");
          for (const s of f.sample_files) ul.createEl("li").createEl("code", { text: s });
          break;
        }
        case "fanout_with_hardcoded":
          div.createDiv({
            text: `${f.distinct_concepts} distinct file basenames map to this single KB file. Consider a {name} template or narrower paths.`,
          });
          break;
      }
    };
    this.entryShell({
      parent,
      section: "mapping-diagnostics",
      id,
      sev: "info",
      text,
      summary,
      meta: f.type,
      detail: (d: HTMLElement) => {
        detail(d);
        const actions = d.createDiv({ cls: "instrumentality-entry-actions" });
        const btn = actions.createEl("button", {
          cls: "instrumentality-btn instrumentality-btn-tiny",
          text: "Copy fix prompt",
        });
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const prompt = buildAuditFixPrompt(f);
          try {
            await navigator.clipboard.writeText(prompt);
            new Notice("Audit fix prompt copied to clipboard.");
          } catch {
            // Fallback for sandboxed contexts where navigator.clipboard is unavailable
            const ta = document.createElement("textarea");
            ta.value = prompt;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); new Notice("Audit fix prompt copied to clipboard."); }
            catch { new Notice("Could not copy — clipboard API unavailable."); }
            finally { document.body.removeChild(ta); }
          }
        });
      },
    });
  }

  // ── Submodules pinned card ─────────────────────────────────────────────
  //
  // Structurally distinct from accordion cards — git state is an
  // orient-yourself glance, not a work queue. Header dots stay visible
  // even when the body is collapsed so health is always readable.

  private renderSubmodulesPinned(parent: HTMLElement): void {
    const sub = this.status?.submodules;
    if (!sub || sub.entries.length === 0) return;

    const collapsed = this.submodulesCollapsed;
    const card = parent.createDiv({
      cls: "instrumentality-submodules-pinned",
      attr: { "data-collapsed": String(collapsed) },
    });

    const header = card.createDiv({ cls: "submodules-pinned-header" });
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const chevron = header.createSpan({
      cls: "submodules-pinned-chevron",
      text: collapsed ? "▸" : "▾",
    });
    header.createSpan({ cls: "submodules-pinned-title", text: "Submodules" });
    header.createSpan({ cls: "count", text: String(sub.entries.length) });

    const dots = header.createSpan({ cls: "submodules-pinned-dots" });
    for (const e of sub.entries) {
      const align = classifyBranch(e, sub.parentBranch);
      dots.createSpan({
        cls: `submodule-dot-summary submodule-dot-${align}`,
        text: "●",
        attr: { title: `${e.path} · ${e.branch ?? "detached"}` },
      });
    }

    const metaSpan = header.createSpan({ cls: "submodules-pinned-meta" });
    if (sub.parentBranch) {
      metaSpan.appendText("parent on ");
      metaSpan.createEl("code", { text: sub.parentBranch });
    } else {
      metaSpan.createSpan({ cls: "sev-warn", text: "parent HEAD detached" });
    }

    if (sub.wouldBlock) {
      header.createSpan({
        cls: "badge sev-error",
        text: "would block push",
        attr: {
          title:
            "Pre-push hook will block. Submodules need to match the parent branch.",
        },
      });
    }

    // Click header (but not on inner controls) to toggle collapsed state.
    header.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest("button, a, input")) return;
      const next = !this.submodulesCollapsed;
      this.submodulesCollapsed = next;
      this.cb.setSubmodulesCollapsed(next);
      card.setAttribute("data-collapsed", String(next));
      chevron.setText(next ? "▸" : "▾");
      header.setAttribute("aria-expanded", next ? "false" : "true");
      body.style.display = next ? "none" : "";
    });

    const body = card.createDiv({ cls: "submodule-pinned-body" });
    if (collapsed) body.style.display = "none";

    if (sub.sharedPointerChanged.length > 0) {
      const warn = body.createDiv({ cls: "submodule-shared-warn" });
      warn.appendText("⚠ Shared submodule pointer changed: ");
      sub.sharedPointerChanged.forEach((p, i) => {
        if (i > 0) warn.appendText(", ");
        warn.createEl("code", { text: p });
      });
      warn.appendText(" — affects all consumers.");
    }

    const list = body.createDiv({ cls: "submodule-list" });
    for (const e of sub.entries) {
      this.renderSubmoduleRow(list, e, sub.parentBranch);
    }

    const actions = body.createDiv({ cls: "submodule-actions" });
    const pushBtn = actions.createEl("button", {
      cls: sub.wouldBlock
        ? "instrumentality-submodule-push-btn danger"
        : "instrumentality-submodule-push-btn mod-cta",
      text: sub.wouldBlock ? "Run push (will block)" : "Run push",
    });
    pushBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void this.handleSubmodulePush();
    });
  }

  private renderSubmoduleRow(
    parent: HTMLElement,
    e: SubmoduleEntry,
    parentBranch: string | null
  ): void {
    const align = classifyBranch(e, parentBranch);
    const row = parent.createDiv({
      cls: `submodule-row submodule-row-${align}`,
    });

    const main = row.createDiv({ cls: "submodule-main" });
    const title = main.createDiv({ cls: "submodule-title" });
    title.createEl("code", { text: e.path });
    title.appendText(" ");
    if (e.type === "shared") {
      title.createSpan({
        cls: "badge sev-info",
        text: "shared",
        attr: { title: "kb-shared = true in .gitmodules" },
      });
    } else {
      title.createSpan({
        cls: "badge",
        text: "owned",
        attr: { title: "owned by this superproject" },
      });
    }
    // F9: explicit detached badge alongside type so a checked-out-by-SHA
    // submodule is unmistakable. Mirrors the VS Code extension.
    if (align === "detached") {
      title.appendText(" ");
      title.createSpan({
        cls: "badge sev-warn",
        text: "detached",
        attr: { title: "Submodule HEAD is detached — no branch to compare against parent." },
      });
    }
    if (e.pointerChanged) {
      title.appendText(" ");
      title.createSpan({
        cls: "submodule-dot pointer",
        text: "●",
        attr: { title: "Pointer changed vs upstream" },
      });
    }

    const meta = main.createDiv({ cls: "submodule-meta" });
    meta.appendText("on ");
    const branchChipTitle =
      align === "aligned"
        ? "Same branch as parent — push will sail through."
        : align === "blocking"
        ? "Owned submodule on a different branch than parent — the pre-push hook will block this combination."
        : align === "advisory"
        ? "Shared submodule on its own branch — informational, not blocking."
        : "Detached HEAD — no branch to compare.";
    if (e.branch) {
      meta.createEl("code", {
        cls: `branch-chip branch-${align}`,
        text: e.branch,
        attr: { title: branchChipTitle },
      });
    } else {
      const chip = meta.createSpan({
        cls: `branch-chip branch-detached`,
        attr: { title: branchChipTitle },
      });
      chip.createEl("em", { text: "detached" });
    }
    meta.appendText(" ");
    if (e.branchMismatch && parentBranch) {
      meta.createSpan({
        cls: "badge sev-error",
        text: "mismatch",
        attr: {
          title:
            "Submodule branch differs from parent — the pre-push hook will block this combination.",
        },
      });
    } else if (e.pointerChanged) {
      meta.createSpan({
        cls: "badge sev-info",
        text: "to push",
        attr: {
          title:
            "Pointer changed since upstream — will be included in the next push.",
        },
      });
    } else {
      meta.createSpan({
        cls: "badge",
        text: "clean",
        attr: { title: "In sync with upstream." },
      });
    }

    const rowActions = row.createDiv({ cls: "submodule-row-actions" });
    if (e.branchMismatch && parentBranch) {
      const btn = rowActions.createEl("button", {
        cls: "instrumentality-submodule-sync-btn danger",
      });
      btn.appendText("Sync to ");
      btn.createEl("code", { text: parentBranch });
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void this.handleSubmoduleSync(e.path, parentBranch);
      });
    }
  }

  // ── Submodule actions ──────────────────────────────────────────────────

  private async handleSubmoduleSync(
    subPath: string,
    parentBranch: string
  ): Promise<void> {
    if (!this.kbRoot) {
      new Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const ok = await confirmModal(this.app, {
      title: `Sync submodule '${subPath}' → ${parentBranch}?`,
      detail: `Runs \`git -C ${subPath} checkout ${parentBranch}\`. Uncommitted changes in the submodule will block the checkout.`,
      confirmLabel: "Sync",
    });
    if (!ok) return;
    const result = await syncSubmoduleBranch(this.kbRoot, subPath, parentBranch);
    if (result.success) {
      new Notice(
        `Instrumentality: synced ${subPath} → ${parentBranch}.`
      );
      void this.refresh();
    } else {
      new Notice(
        `Instrumentality: sync failed: ${result.output || "unknown error"}`
      );
    }
  }

  private async handleSubmodulePush(): Promise<void> {
    if (!this.kbRoot) {
      new Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const sub = this.status?.submodules;
    if (!sub) {
      new Notice("Instrumentality: no submodule data — refresh first.");
      return;
    }

    if (sub.wouldBlock) {
      const detail = [
        `Pre-push hook will reject this push.`,
        ``,
        `Submodules on a different branch than the parent (${
          sub.parentBranch ?? "?"
        }):`,
        ...sub.blockingPaths.map((p) => `  • ${p}`),
        ``,
        `Fix: sync each submodule to '${
          sub.parentBranch ?? "<parent>"
        }' (use the Sync button on each row),`,
        `or unstage the submodule pointer change if it isn't part of this feature.`,
      ].join("\n");
      await confirmModal(this.app, {
        title: "Push blocked by submodule branch mismatch",
        detail,
        confirmLabel: "Dismiss",
        hideCancel: true,
      });
      return;
    }

    const plan = buildPushPlan(this.kbRoot, sub);

    let parentRemote: string | undefined;
    const parentStep = plan.find((s) => s.type === "parent");
    if (parentStep?.branch && !(await hasUpstream(parentStep.fullPath))) {
      const remotes = await listRemotes(parentStep.fullPath);
      if (remotes.length === 0) {
        new Notice(
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
        const pick = await selectModal(this.app, {
          title: `Set upstream for '${parentStep.branch}' — pick a remote`,
          placeholder: `Default: ${defaultRemote}`,
          options: [
            defaultRemote,
            ...remotes.filter((r) => r !== defaultRemote),
          ].map((r) => ({
            value: r,
            label: r,
            description: r === defaultRemote ? "default" : undefined,
          })),
        });
        if (!pick) return;
        parentRemote = pick;
      }
    }

    const planLines = plan.map((s) => {
      if (s.type === "parent" && parentRemote && s.branch) {
        return `${s.order}. parent — git push -u ${parentRemote} ${s.branch}`;
      }
      return `${s.order}. ${
        s.type === "parent" ? "parent" : s.path
      } — git ${s.action}`;
    });
    const sharedWarn =
      sub.sharedPointerChanged.length > 0
        ? `\n\n⚠ Shared submodule pointer changed:\n${sub.sharedPointerChanged
            .map((p) => `  • ${p}`)
            .join(
              "\n"
            )}\nThese affect all projects consuming the module.`
        : "";

    const ok = await confirmModal(this.app, {
      title: "Push submodules and parent in order?",
      detail: planLines.join("\n") + sharedWarn,
      confirmLabel: "Push",
    });
    if (!ok) return;

    const result = await runPushPlan(plan, { parentRemote });
    void this.refresh();
    if (result.allSuccess) {
      new Notice(
        `Instrumentality: pushed ${result.steps.length} step(s) successfully.`
      );
      return;
    }
    const failed = result.steps.find((s) => !s.success);
    new Notice(
      `Instrumentality: push failed at ${failed?.step.path}: ${
        failed?.output?.slice(0, 200) ?? "unknown error"
      }`
    );
  }

  // ── Publish drift ──────────────────────────────────────────────────────
  //
  // Runs drift.runTool() + conform.runTool() in write mode, then stages and
  // commits any changes to knowledge/sync/*.md as a single
  // `chore(kb): publish drift queue` commit. Mirrors the VSCode extension's
  // handlePublishDrift exactly.

  private async handlePublishDrift(): Promise<void> {
    if (!this.kbRoot) {
      new Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const scriptDrift = path.join(this.kbRoot, "knowledge", "_mcp", "tools", "drift.js");
    const scriptConform = path.join(this.kbRoot, "knowledge", "_mcp", "tools", "conform.js");
    const fs = await import("node:fs");
    if (!fs.existsSync(scriptDrift)) {
      new Notice(
        "Instrumentality: publish requires knowledge/_mcp/tools/drift.js (missing in this workspace)."
      );
      return;
    }
    const ok = await confirmModal(this.app, {
      title: "Publish drift queue?",
      detail:
        "Runs drift + conform detection in write mode, then commits any changes to knowledge/sync/*.md as `chore(kb): publish drift queue`. Does not push.",
      confirmLabel: "Publish",
    });
    if (!ok) return;

    try {
      await this.runNodeTool(scriptDrift, this.kbRoot);
      if (fs.existsSync(scriptConform)) {
        await this.runNodeTool(scriptConform, this.kbRoot);
      }
    } catch (err: any) {
      new Notice(
        `Instrumentality: drift detection failed: ${err?.message ?? err}`
      );
      return;
    }

    const queueFiles = [
      "knowledge/sync/code-drift.md",
      "knowledge/sync/kb-drift.md",
      "knowledge/sync/standards-drift.md",
      "knowledge/sync/standards-backlog.md",
    ].filter((f) => fs.existsSync(path.join(this.kbRoot!, f)));

    if (queueFiles.length === 0) {
      new Notice(
        "Instrumentality: nothing to publish — no queue files present."
      );
      return;
    }

    try {
      await this.runGit(["add", "--", ...queueFiles], this.kbRoot);
    } catch (err: any) {
      new Notice(`Instrumentality: git add failed: ${err?.message ?? err}`);
      return;
    }

    let stagedNames = "";
    try {
      stagedNames = (
        await this.runGit(
          ["diff", "--cached", "--name-only", "--", ...queueFiles],
          this.kbRoot
        )
      ).trim();
    } catch {
      /* fall through */
    }
    if (!stagedNames) {
      new Notice(
        "Instrumentality: nothing to publish — drift queue is already up to date."
      );
      void this.refresh();
      return;
    }

    try {
      await this.runGit(
        ["commit", "-m", "chore(kb): publish drift queue"],
        this.kbRoot
      );
    } catch (err: any) {
      new Notice(`Instrumentality: git commit failed: ${err?.message ?? err}`);
      return;
    }
    new Notice(
      `Instrumentality: published drift queue (${
        stagedNames.split("\n").length
      } file(s)). Push when ready.`
    );
    void this.refresh();
  }

  private runNodeTool(scriptPath: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [
          "-e",
          `require(${JSON.stringify(scriptPath)}).runTool({}).then(() => {}).catch((e) => { process.stderr.write(String(e && e.message || e)); process.exit(1); })`,
        ],
        { cwd, maxBuffer: 16 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  private runGit(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }

  // ── Entry shell + actions ──────────────────────────────────────────────

  private entryShell(opts: {
    parent: HTMLElement;
    section: SectionKind;
    id: string;
    sev: "error" | "warn" | "info";
    text: string;
    summary: (h: HTMLElement) => void;
    meta: string;
    detail: (d: HTMLElement) => void;
    sourceFile?: string;
    standardId?: string | null;
    ruleId?: string | null;
    authorEntry?: StandardsDriftEntry;
    /**
     * Files for which we can show a git diff. Lazy-loaded on click — we
     * shell out to `git diff <since>..<latest>` (or against working tree
     * when `latestCommit` is missing) and render the patch text inline.
     */
    diffableFiles?: { relPath: string; sinceCommit: string; latestCommit?: string }[];
    /** Carried as `data-entry-mode` for aspirational opacity-demotion CSS. */
    modeAttr?: string;
    /** Queue key passed to verdict prompt generators (when verdicts apply). */
    verdictQueueKey?: string;
    /** File paths offered as checkboxes in the verdict form. */
    verdictFiles?: string[];
    /**
     * Drift kind for verdicts that route per-kind (currently only
     * `acknowledged`). For code-drift / kb-drift / standards-drift sections
     * this is set so the picker can build the correct MCP-call prompt.
     */
    driftKind?: DriftKind;
    /**
     * When true, the entry came from the author's working tree and isn't in
     * the published queue yet. Suppresses verdict pickers (those resolve
     * published entries) and stamps the row with a "preview" marker.
     */
    isUncommitted?: boolean;
    /**
     * Replaces the default "Open Source" button. Used by code-drift entries
     * whose KB target file does not exist — the button becomes a scaffold
     * action instead of an open-file action that would error out.
     */
    openOverride?: { label: string; onClick: () => void | Promise<void> };
  }): void {
    const attr: Record<string, string> = {
      "data-entry-section": opts.section,
      "data-entry-id": opts.id,
      "data-entry-sev": opts.sev,
      "data-entry-text": opts.text.toLowerCase(),
    };
    if (opts.modeAttr) attr["data-entry-mode"] = opts.modeAttr;
    if (opts.isUncommitted) attr["data-entry-bucket"] = "uncommitted";
    const row = opts.parent.createDiv({
      cls: "instrumentality-entry",
      attr,
    });
    const summary = row.createDiv({ cls: "entry-summary" });
    const titleRow = summary.createDiv({ cls: "entry-title-row" });
    opts.summary(titleRow);
    summary.createDiv({ cls: "entry-meta", text: opts.meta });
    const detail = row.createDiv({ cls: "entry-detail" });
    opts.detail(detail);

    // Mapping-diagnostics findings aren't queue entries — they have no
    // entryIndex prompt and no source file. The detail callback supplies its
    // own "Copy fix prompt" button via buildAuditFixPrompt; skip the default
    // sendBtn/openBtn so the user doesn't get a prominent mod-cta button
    // that silently misses entryIndex.
    const skipDefaultActions = opts.section === "mapping-diagnostics";

    if (!skipDefaultActions) {
    const actions = detail.createDiv({ cls: "entry-actions" });
    const sendBtn = actions.createEl("button", { text: copyActionLabel(opts.section), cls: "mod-cta" });
    sendBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const indexed2 = this.entryIndex.get(`${opts.section}:${opts.id}`);
      if (!indexed2) return;
      await navigator.clipboard.writeText(indexed2.prompt);
      new Notice(`Instrumentality: ${primaryActionLabel(opts.section).toLowerCase()} prompt copied.`);
    });
    if (opts.openOverride) {
      const override = opts.openOverride;
      const overrideBtn = actions.createEl("button", { text: override.label });
      overrideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void override.onClick();
      });
    } else {
      const openBtn = actions.createEl("button", { text: "Open Source" });
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.openSource(opts.sourceFile);
      });
    }
    if (opts.standardId) {
      const stdBtn = actions.createEl("button", { text: "Open Standard" });
      stdBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.openStandard(opts.standardId!);
      });
      if (opts.ruleId) {
        const editBtn = actions.createEl("button", { text: "Edit Rule" });
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.editRule(opts.standardId!, opts.ruleId!);
        });
      }
      if (opts.authorEntry) {
        const refineBtn = actions.createEl("button", { text: "Refine with Agent" });
        refineBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const prompt = getActionPrompt({
            kind: "standard-author",
            entry: opts.authorEntry!,
            mode: "refine",
          });
          await navigator.clipboard.writeText(prompt);
          new Notice("Instrumentality: refine prompt copied to clipboard.");
        });
      }
    }
    }

    // Verdict picker — only for sections in VERDICTS_BY_SECTION. Mirrors
    // the VSCode extension: user has already decided, form just records
    // the call. UI never invokes MCP directly — every verdict generates
    // a prompt and copies it to the clipboard for the user's agent.
    // Skip on uncommitted-preview entries — those aren't in the published
    // queue yet, so a verdict would target nothing.
    const verdictDefs = opts.isUncommitted ? undefined : VERDICTS_BY_SECTION[opts.section];
    if (verdictDefs && opts.verdictQueueKey) {
      this.appendVerdictPicker(detail, {
        section: opts.section,
        verdictDefs,
        queueKey: opts.verdictQueueKey,
        files: opts.verdictFiles ?? [],
        driftKind: opts.driftKind,
      });
    }

    // Show Diff section (lazy — populated on click). The text content is
    // captured into a closure so subsequent clicks don't re-shell.
    if (opts.diffableFiles && opts.diffableFiles.length > 0) {
      this.appendDiffDisclosure(detail, opts.diffableFiles);
    }

    // Prompt is hidden by default. Users who want to inspect or hand-tune
    // before pasting can expand it; the Copy Prompt button always works
    // without expanding.
    const disclosure = detail.createEl("details", { cls: "prompt-disclosure" });
    disclosure.createEl("summary", { text: "Show prompt" });
    const promptPre = disclosure.createEl("pre", { cls: "entry-prompt" });
    const indexed = this.entryIndex.get(`${opts.section}:${opts.id}`);
    promptPre.appendText(indexed?.prompt ?? "(no prompt available)");

    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
  }

  private appendVerdictPicker(
    parent: HTMLElement,
    opts: {
      section: SectionKind;
      verdictDefs: VerdictDef[];
      queueKey: string;
      files: string[];
      driftKind?: DriftKind;
    }
  ): void {
    const row = parent.createDiv({ cls: "instrumentality-verdict-actions-row" });
    for (const def of opts.verdictDefs) {
      const btn = row.createEl("button", {
        cls: "instrumentality-verdict-btn",
        text: def.label,
      });
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!def.needsForm) {
          // Direct submit (e.g. Apply).
          await this.submitVerdict(opts.section, def, opts.queueKey, {}, opts.driftKind);
          return;
        }
        // Toggle the form: hide any other open form in this entry, show
        // ours, populate field visibility.
        const entry = parent.closest(".instrumentality-entry");
        if (!entry) return;
        let form = entry.querySelector(
          ".instrumentality-verdict-form"
        ) as HTMLElement | null;
        if (!form) {
          form = this.buildVerdictForm(opts);
          parent.appendChild(form);
        }
        this.activateVerdictForm(form, def, opts);
      });
    }
  }

  private buildVerdictForm(opts: {
    section: SectionKind;
    verdictDefs: VerdictDef[];
    queueKey: string;
    files: string[];
    driftKind?: DriftKind;
  }): HTMLElement {
    const form = createDiv({
      cls: "instrumentality-verdict-form hidden",
      attr: { "data-active-verdict": "" },
    });
    form.createDiv({ cls: "verdict-form-title" });
    // filePaths field
    const filesField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "filePaths" },
    });
    filesField.createEl("label", { cls: "verdict-field-label" });
    const ul = filesField.createEl("ul", { cls: "verdict-file-list" });
    for (const p of opts.files) {
      const li = ul.createEl("li");
      const lbl = li.createEl("label");
      const cb = lbl.createEl("input", { attr: { type: "checkbox", value: p } });
      cb.setAttribute("name", "vfile");
      lbl.appendText(" ");
      lbl.createEl("code", { text: p });
    }
    // reason field
    const reasonField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "reason" },
    });
    const reasonLbl = reasonField.createEl("label");
    reasonLbl.appendText("Reason ");
    reasonLbl.createSpan({ cls: "verdict-required-marker", text: "(required)" });
    const reason = reasonField.createEl("textarea", {
      cls: "verdict-reason",
      attr: { rows: "3", placeholder: "Why?" },
    });
    // note field
    const noteField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "note" },
    });
    const noteLbl = noteField.createEl("label");
    noteLbl.appendText("Note ");
    noteLbl.createSpan({ cls: "verdict-optional-marker", text: "(optional)" });
    noteField.createEl("textarea", {
      cls: "verdict-note",
      attr: { rows: "2", placeholder: "Optional context for the senior reviewer" },
    });
    // actions
    const actions = form.createDiv({ cls: "verdict-form-actions" });
    const submit = actions.createEl("button", {
      cls: "instrumentality-verdict-submit mod-cta",
      text: "Send to agent",
    });
    submit.setAttribute("disabled", "");
    const cancel = actions.createEl("button", { text: "Cancel" });

    const revalidate = () => {
      const active = form.getAttribute("data-active-verdict") as VerdictKey | null;
      if (!active) {
        submit.setAttribute("disabled", "");
        return;
      }
      const def = opts.verdictDefs.find((d) => d.verdict === active);
      if (!def) {
        submit.setAttribute("disabled", "");
        return;
      }
      let valid = true;
      if (def.fields.filePaths?.required) {
        const checked = form.querySelectorAll('input[name="vfile"]:checked');
        if (checked.length === 0) valid = false;
      }
      if (def.fields.reason?.required) {
        if (!reason.value.trim()) valid = false;
      }
      if (valid) submit.removeAttribute("disabled");
      else submit.setAttribute("disabled", "");
    };
    form.addEventListener("input", revalidate);
    form.addEventListener("change", revalidate);

    submit.addEventListener("click", async (e) => {
      e.stopPropagation();
      const active = form.getAttribute("data-active-verdict") as VerdictKey | null;
      if (!active) return;
      const def = opts.verdictDefs.find((d) => d.verdict === active);
      if (!def) return;
      const draft: { filePaths?: string[]; reason?: string; note?: string } = {};
      const checked = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[name="vfile"]:checked')
      ).map((i) => i.value);
      if (checked.length > 0) draft.filePaths = checked;
      const rEl = form.querySelector(".verdict-reason") as HTMLTextAreaElement | null;
      if (rEl && rEl.value.trim()) draft.reason = rEl.value.trim();
      const nEl = form.querySelector(".verdict-note") as HTMLTextAreaElement | null;
      if (nEl && nEl.value.trim()) draft.note = nEl.value.trim();
      await this.submitVerdict(opts.section, def, opts.queueKey, draft, opts.driftKind);
      this.resetVerdictForm(form);
    });
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetVerdictForm(form);
    });
    return form;
  }

  private activateVerdictForm(
    form: HTMLElement,
    def: VerdictDef,
    opts: { verdictDefs: VerdictDef[]; queueKey: string; files: string[] }
  ): void {
    form.setAttribute("data-active-verdict", def.verdict);
    const title = form.querySelector(".verdict-form-title") as HTMLElement | null;
    if (title) title.setText("Resolve as: " + def.label.replace(/…$/, ""));
    form.querySelectorAll<HTMLElement>("[data-for-field]").forEach((el) => {
      const key = el.getAttribute("data-for-field") as
        | "filePaths"
        | "reason"
        | "note"
        | null;
      if (!key) return;
      const cfg = (def.fields as Record<string, unknown>)[key];
      el.toggleClass("hidden", !cfg);
      if (key === "filePaths" && cfg) {
        const lbl = el.querySelector(".verdict-field-label") as HTMLElement | null;
        if (lbl) lbl.setText((cfg as { label: string }).label);
      }
    });
    form.removeClass("hidden");
    // Initial validation pass — Apply has no fields and stays valid; others
    // start disabled until the user fills the required fields.
    form.dispatchEvent(new Event("input"));
  }

  private resetVerdictForm(form: HTMLElement): void {
    form.setAttribute("data-active-verdict", "");
    form.addClass("hidden");
    form
      .querySelectorAll<HTMLInputElement>('input[name="vfile"]')
      .forEach((i) => (i.checked = false));
    const r = form.querySelector(".verdict-reason") as HTMLTextAreaElement | null;
    if (r) r.value = "";
    const n = form.querySelector(".verdict-note") as HTMLTextAreaElement | null;
    if (n) n.value = "";
    const submit = form.querySelector(
      ".instrumentality-verdict-submit"
    ) as HTMLButtonElement | null;
    if (submit) submit.setAttribute("disabled", "");
  }

  private async submitVerdict(
    section: SectionKind,
    def: VerdictDef,
    queueKey: string,
    draft: { filePaths?: string[]; reason?: string; note?: string },
    driftKind?: DriftKind
  ): Promise<void> {
    // Same safety belt as the VSCode extension: client-side validation
    // already covered this, but messages are untrusted input semantically.
    let prompt: string;
    try {
      switch (def.verdict) {
        case "acknowledged": {
          if (!driftKind) throw new Error("Acknowledge requires a drift kind.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Acknowledge requires a reason.");
          prompt = acknowledgedPrompt({
            verdict: "acknowledged",
            kind: driftKind,
            entryKey: queueKey,
            reason: draft.reason.trim(),
          });
          break;
        }
        case "applied":
          prompt = appliedPrompt({ verdict: "applied", queueKey });
          break;
        case "exempted":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Exempt requires at least one file.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Exempt requires a reason.");
          prompt = exemptedPrompt({
            verdict: "exempted",
            queueKey,
            filePaths: draft.filePaths,
            reason: draft.reason.trim(),
          });
          break;
        case "promoted":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Promote requires at least one originating file.");
          prompt = promotedPrompt({
            verdict: "promoted",
            queueKey,
            originatingFiles: draft.filePaths,
            note: draft.note?.trim() || undefined,
          });
          break;
        case "dismissed":
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Dismiss requires a reason.");
          prompt = dismissedPrompt({
            verdict: "dismissed",
            queueKey,
            reason: draft.reason.trim(),
          });
          break;
        case "closed_promotion":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Close promotion requires at least one file.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Close promotion requires a reason.");
          prompt = closedPromotionPrompt({
            verdict: "closed_promotion",
            queueKey,
            filePaths: draft.filePaths,
            reason: draft.reason.trim(),
          });
          break;
        default:
          throw new Error(`Unknown verdict: ${(def as { verdict: string }).verdict}`);
      }
    } catch (err: any) {
      new Notice(`Instrumentality: ${err?.message ?? err}`);
      return;
    }
    await navigator.clipboard.writeText(prompt);
    // Unused parameter `section` is kept for symmetry with the VSCode
    // extension's handleVerdictSubmit so the call signatures match if we
    // need to broaden routing later.
    void section;
    new Notice(`Instrumentality: ${def.verdict.replace(/_/g, " ")} prompt copied.`);
  }

  /**
   * Lazy git-diff disclosure. We don't run git on render — only when the
   * user expands a file's `<details>` block. Cache the resolved text on
   * the disclosure element so re-toggling doesn't re-shell.
   */
  private appendDiffDisclosure(
    parent: HTMLElement,
    files: { relPath: string; sinceCommit: string; latestCommit?: string }[]
  ): void {
    const wrap = parent.createDiv({ cls: "diff-actions" });
    const top = wrap.createEl("details", { cls: "diff-disclosure" });
    top.createEl("summary", {
      text: `Show diffs (${files.length} file${files.length === 1 ? "" : "s"})`,
    });
    const list = top.createEl("ul", { cls: "diff-list" });
    for (const f of files) {
      const li = list.createEl("li");
      const fileDetail = li.createEl("details", { cls: "diff-file" });
      const summary = fileDetail.createEl("summary");
      summary.createEl("code", { text: f.relPath });
      summary.appendText(
        ` (${f.sinceCommit.slice(0, 7)}${
          f.latestCommit ? ` → ${f.latestCommit.slice(0, 7)}` : " → working tree"
        })`
      );
      const out = fileDetail.createEl("pre", { cls: "diff-block" });
      let loaded = false;
      fileDetail.addEventListener("toggle", async () => {
        if (!fileDetail.open || loaded) return;
        loaded = true;
        try {
          const text = await this.gitDiffFor(f);
          out.empty();
          this.renderDiffText(out, text);
        } catch (err: any) {
          out.empty();
          out.appendText(`error: ${err?.message ?? err}`);
        }
      });
    }
  }

  private async gitDiffFor(f: {
    relPath: string;
    sinceCommit: string;
    latestCommit?: string;
  }): Promise<string> {
    if (!this.kbRoot) return "(kb root not detected)";
    // `sinceCommit` is the FIRST post-baseline commit that touched the file,
    // so the change introduced BY it is part of the drift. Diff from its
    // parent (`<since>^`) — not from `<since>` — to capture that change.
    const range = f.latestCommit
      ? `${f.sinceCommit}^..${f.latestCommit}`
      : `${f.sinceCommit}^`; // diff against working tree when no latest
    // The KB may be a superproject with submodules. Resolve the actual repo
    // containing this file so the SHA range is valid for `git diff`.
    const absPath = path.isAbsolute(f.relPath)
      ? f.relPath
      : path.join(this.kbRoot, f.relPath);
    const repoRoot = await this.resolveRepoRoot(absPath);
    const relInRepo = path.relative(repoRoot, absPath);
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        ["diff", "--no-color", range, "--", relInRepo],
        { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout || "(no changes)");
        }
      );
    });
  }

  private resolveRepoRoot(absPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd: path.dirname(absPath) },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  private renderDiffText(parent: HTMLElement, text: string): void {
    const lines = text.split("\n");
    for (const line of lines) {
      const cls = line.startsWith("+++") || line.startsWith("---")
        ? "diff-meta"
        : line.startsWith("+")
        ? "diff-add"
        : line.startsWith("-")
        ? "diff-del"
        : line.startsWith("@@")
        ? "diff-hunk"
        : "diff-ctx";
      parent.createDiv({ cls, text: line });
    }
  }

  private async openSource(sourceFile?: string): Promise<void> {
    if (!sourceFile || !this.kbRoot) {
      new Notice("Instrumentality: no source file for this entry.");
      return;
    }
    const abs = path.isAbsolute(sourceFile)
      ? sourceFile
      : path.join(this.kbRoot, sourceFile);
    await this.openPath(abs);
  }

  private async openStandard(standardId: string): Promise<void> {
    if (!this.kbRoot) return;
    const filePath = resolveStandardPath(this.kbRoot, standardId);
    if (!filePath) {
      new Notice(`Instrumentality: standard '${standardId}' not found.`);
      return;
    }
    await this.openPath(filePath);
  }

  private async editRule(standardId: string, ruleId: string): Promise<void> {
    if (!this.kbRoot) return;
    const filePath = resolveStandardPath(this.kbRoot, standardId);
    if (!filePath) {
      new Notice(`Instrumentality: standard '${standardId}' not found.`);
      return;
    }
    const range = findRuleLineRange(filePath, ruleId);
    await this.openPath(filePath, range?.start);
  }

  /**
   * Open via Obsidian when the file lives inside the vault (preferred — keeps
   * navigation, backlinks, and tabs working). Fall back to Electron's shell
   * for code files outside the vault.
   *
   * If `line` is given and the file opens inside the vault, position the
   * editor cursor on that line (0-indexed). Used by Edit Rule.
   */
  private async openPath(absPath: string, line?: number): Promise<void> {
    const vault = this.app.vault;
    const adapter = vault.adapter as unknown as { basePath?: string; getBasePath?: () => string };
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (basePath && absPath.startsWith(basePath + path.sep)) {
      const rel = absPath.slice(basePath.length + 1);
      const file = vault.getAbstractFileByPath(rel);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        if (typeof line === "number" && line >= 0) {
          // The editor is exposed on MarkdownView; in newer Obsidian APIs
          // the `editor` getter is on `leaf.view`. Guard for both shapes.
          const view = leaf.view as unknown as {
            editor?: {
              setCursor: (pos: { line: number; ch: number }) => void;
              scrollIntoView: (range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean) => void;
            };
          };
          if (view.editor) {
            const pos = { line, ch: 0 };
            view.editor.setCursor(pos);
            view.editor.scrollIntoView({ from: pos, to: pos }, true);
          }
        }
        return;
      }
    }
    try {
      const electron = (window as any).require?.("electron");
      if (electron?.shell?.openPath) {
        const result = await electron.shell.openPath(absPath);
        if (result) new Notice(`Instrumentality: cannot open ${absPath}: ${result}`);
        return;
      }
    } catch {
      // electron unavailable; fall through
    }
    new Notice(`Instrumentality: cannot open ${absPath} (not inside vault).`);
  }

  // ── Filter (DOM-only, no re-render) ─────────────────────────────────────

  private applyFilterDom(): void {
    const search = this.filterSearch.toLowerCase();
    const sevFilter = this.severityFilter;
    const hidden = this.hiddenSections;

    const cards = this.contentEl.querySelectorAll<HTMLElement>("[data-section]");
    cards.forEach((card) => {
      const section = card.getAttribute("data-section") as SectionKind | null;
      card.toggleClass("hidden", !!section && hidden.has(section));
    });

    const rows = this.contentEl.querySelectorAll<HTMLElement>(".instrumentality-entry");
    rows.forEach((row) => {
      const section = row.getAttribute("data-entry-section") as SectionKind | null;
      const sev = row.getAttribute("data-entry-sev") || "";
      const text = row.getAttribute("data-entry-text") || "";
      let show = true;
      if (sevFilter.size > 0 && !sevFilter.has(sev as any)) show = false;
      if (search && !text.includes(search)) show = false;
      if (section && hidden.has(section)) show = false;
      row.toggleClass("hidden", !show);
    });
  }

  // ── Activity (drift-log timeline) ──────────────────────────────────────

  private renderActivityBody(parent: HTMLElement): void {
    const grid = parent.createDiv({ cls: "instrumentality-section-grid" });
    let events = this.status?.driftLogEvents ?? [];
    if (!this.showSystemEvents) {
      events = events.filter((e) => !e.isSystem);
    }
    if (events.length === 0) {
      const card = grid.createDiv({
        cls: "instrumentality-section-card",
        attr: { "data-section": "activity" },
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: "Activity" });
      h2.createSpan({ cls: "count", text: "0" });
      const body = card.createDiv({ cls: "body" });
      this.placeholder(
        body,
        "No drift-log events in the current + previous month."
      );
      return;
    }

    const groups = new Map<string, DriftLogEvent[]>();
    for (const e of events) {
      let key: string;
      if (this.activityGroupBy === "queueKey")
        key = e.queueKey || e.kbTarget || e.kbFile || "(unattributed)";
      else if (this.activityGroupBy === "eventType")
        key = activityEventLabel(e.eventType);
      else key = e.date;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    const sortedKeys = [...groups.keys()].sort((a, b) =>
      this.activityGroupBy === "date"
        ? a < b
          ? 1
          : a > b
          ? -1
          : 0
        : a.localeCompare(b)
    );

    // Accordion behavior mirrors the Pending view: one group open at a
    // time so its body gets the full available height (no flex-shrink
    // squeeze that previously cut detail panels off mid-line). Default-open
    // = the first sorted group (newest date / first alpha).
    const cards: HTMLElement[] = [];
    for (let i = 0; i < sortedKeys.length; i++) {
      const k = sortedKeys[i];
      const arr = groups.get(k)!;
      const card = grid.createDiv({
        cls: "instrumentality-section-card activity-group",
        attr: {
          "data-activity-group": k,
          ...(i === 0 ? { "data-open": "true" } : {}),
        },
      });
      cards.push(card);
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: k });
      h2.createSpan({ cls: "count", text: String(arr.length) });
      // Header click swaps the open card. Clicking the currently-open
      // header is a no-op (matches Pending — collapsing all would leave
      // an empty view). Skip clicks on inner controls.
      header.addEventListener("click", (ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        if (card.getAttribute("data-open") === "true") return;
        for (const other of cards) other.removeAttribute("data-open");
        card.setAttribute("data-open", "true");
      });
      const body = card.createDiv({ cls: "body" });
      for (const e of arr) this.renderActivityRow(body, e);
    }
  }

  private renderActivityRow(parent: HTMLElement, e: DriftLogEvent): void {
    const id = `${e.date}:${e.queueKey ?? e.kbTarget ?? e.kbFile ?? ""}:${e.eventType}`;
    const subject = e.queueKey ?? e.kbTarget ?? e.kbFile ?? "(unattributed)";
    const row = parent.createDiv({
      cls: "instrumentality-entry activity-entry",
      attr: {
        "data-entry-section": "activity",
        "data-entry-id": id,
        "data-entry-sev": "",
        "data-entry-text": `${subject} ${e.eventType} ${e.reason ?? ""}`.toLowerCase(),
      },
    });
    const summary = row.createDiv({ cls: "entry-summary" });
    const summaryRow = summary.createDiv({ cls: "activity-summary" });
    summaryRow.createSpan({
      cls: `badge ${activityBadgeClass(e.eventType, e.isSystem)}`,
      text: activityEventLabel(e.eventType),
    });
    summaryRow.createSpan({ cls: "activity-subject", text: subject });
    summaryRow.createSpan({ cls: "activity-date", text: e.date });
    const line = summary.createDiv({ cls: "activity-line" });
    if (e.reason) {
      line.appendText(
        " — " + (e.reason.length > 100 ? e.reason.slice(0, 100) + "…" : e.reason)
      );
    } else {
      line.createEl("em", { text: "(no reason recorded)" });
    }

    const detail = row.createDiv({ cls: "entry-detail" });
    const meta = detail.createDiv({ cls: "detail-meta" });
    const eventRow = meta.createDiv();
    eventRow.createEl("strong", { text: "Event: " });
    eventRow.createEl("code", { text: e.eventType });
    meta.createDiv({ text: `Date: ${e.date}` });
    if (e.queueKey) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Queue key: " });
      r.createEl("code", { text: e.queueKey });
    }
    if (e.kbTarget) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "KB target: " });
      r.createEl("code", { text: e.kbTarget });
    }
    if (e.kbFile) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "KB file: " });
      r.createEl("code", { text: e.kbFile });
    }
    if (e.files?.length) {
      const block = meta.createDiv();
      block.createEl("strong", { text: "Files:" });
      const ul = block.createEl("ul");
      for (const f of e.files) ul.createEl("li").createEl("code", { text: f });
    }
    if (e.originatingFiles?.length) {
      const block = meta.createDiv();
      block.createEl("strong", { text: "Originating files:" });
      const ul = block.createEl("ul");
      for (const f of e.originatingFiles)
        ul.createEl("li").createEl("code", { text: f });
    }
    if (e.reason) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Reason: " });
      r.appendText(e.reason);
    }
    if (e.note) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Note: " });
      r.appendText(e.note);
    }
    // Toggle the detail panel on summary click. Use the DOM API directly
    // — Obsidian's `toggleClass(name, force)` had a reported case where
    // the force arg wasn't honored, leaving the entry stuck "open" with
    // no way to close it.
    summary.addEventListener("click", () => {
      if (row.classList.contains("open")) row.classList.remove("open");
      else row.classList.add("open");
    });
  }

}

