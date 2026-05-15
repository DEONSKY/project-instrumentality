import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
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
  pipelineSegments,
  buildEntryHandles,
  groupEntries,
  SECTION_GUIDE,
  appliedPrompt,
  exemptedPrompt,
  promotedPrompt,
  dismissedPrompt,
  closedPromotionPrompt,
  rerunPhase1Prompt,
  type StatusSummary,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type ConformRequest,
  type LintViolation,
  type PromptInput,
  type StandardRule,
  type DriftLogEvent,
  type GroupBy,
  type EntryHandle,
  type SectionKind,
} from "@instrumentality/shared";
import { SyncWatcher } from "./watcher";

export interface InstrumentalityViewCallbacks {
  getKbRoot: () => string | null;
  getDismissedBanners: () => ReadonlySet<SectionKind>;
  dismissBanner: (kind: SectionKind) => void;
}

type VerdictKey =
  | "applied"
  | "exempted"
  | "promoted"
  | "dismissed"
  | "closed_promotion";

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
  return "event-other";
}

const VERDICTS_BY_SECTION: Partial<Record<SectionKind, VerdictDef[]>> = {
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

interface RenderedEntry {
  section: SectionKind;
  id: string;
  promptInput: PromptInput;
  prompt: string;
  sourceFile?: string;
  standardId?: string | null;
}

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
  private viewMode: "pending" | "activity" = "pending";
  private activityGroupBy: "date" | "queueKey" | "eventType" = "date";
  private showSystemEvents = true;
  private cb: InstrumentalityViewCallbacks;
  private getKbRoot: () => string | null;

  constructor(leaf: WorkspaceLeaf, callbacks: InstrumentalityViewCallbacks) {
    super(leaf);
    this.cb = callbacks;
    this.getKbRoot = callbacks.getKbRoot;
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

  async refresh(): Promise<void> {
    const root = this.getKbRoot();
    this.kbRoot = root;
    if (!root) {
      this.status = null;
      this.render();
      return;
    }
    try {
      this.status = await getStatus(root, { skipLint: true });
    } catch (err: any) {
      console.error("[instrumentality] getStatus failed:", err);
      this.status = null;
    }
    this.entryIndex = this.buildEntryIndex(this.status);
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
    const make = (mode: "pending" | "activity", label: string) => {
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

    const tools = header.createDiv({ cls: "instrumentality-tools" });
    const refresh = tools.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.refresh());
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
      this.renderCodeDriftCard(grid);
      this.renderKbDriftCard(grid);
      this.renderStandardsDriftCard(grid);
      this.renderConformCard(grid);
      this.renderPromotionsCard(grid);
      this.renderLintCard(grid);
    } else {
      this.renderGenericGroups(grid);
    }
    this.applyFilterDom();
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
        if (i >= 0) this.renderCodeDriftRow(parent, s.codeDrift.entries[i], i);
        return;
      }
      case "kb-drift": {
        const i = s.kbDrift.entries.findIndex((e, idx) => stableEntryId(e.kbFile, idx) === h.id);
        if (i >= 0) this.renderKbDriftRow(parent, s.kbDrift.entries[i], i);
        return;
      }
      case "standards-drift": {
        const i = s.standardsDrift.entries.findIndex(
          (e, idx) => stableEntryId(`${e.mode}:${e.queueKey}`, idx) === h.id
        );
        if (i >= 0) this.renderStandardsDriftRow(parent, s.standardsDrift.entries[i], i);
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
    if (entries.length === 0) return this.placeholder(body, "No code drift");
    entries.forEach((e, i) => this.renderCodeDriftRow(body, e, i));
  }

  private renderCodeDriftRow(parent: HTMLElement, e: CodeDriftEntry, i: number): void {
    const id = stableEntryId(e.kbTarget, i);
    const sev = e.hasShared ? "warn" : "info";
    const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.kbTarget });
      if (e.hasShared) h2.createSpan({ cls: "badge shared", text: "shared" });
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
    };
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
    if (entries.length === 0) return this.placeholder(body, "No KB drift");
    entries.forEach((e, i) => this.renderKbDriftRow(body, e, i));
  }

  private renderKbDriftRow(parent: HTMLElement, e: KbDriftEntry, i: number): void {
    const id = stableEntryId(e.kbFile, i);
    const sev = e.unmapped ? "warn" : "info";
    const text = e.kbFile + " " + e.codeAreas.join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.kbFile });
      if (e.unmapped) h2.createSpan({ cls: "badge sev-warn", text: "unmapped" });
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
      }
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
    if (entries.length === 0) return this.placeholder(body, "No standards drift");
    entries.forEach((e, i) => this.renderStandardsDriftRow(body, e, i));
  }

  private renderStandardsDriftRow(
    parent: HTMLElement,
    e: StandardsDriftEntry,
    i: number
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
      for (const [party, files] of Object.entries(e.filesByParty)) {
        const block = div.createDiv();
        block.createEl("strong", {
          text: party === "_" ? "Files:" : `Files (party: ${party}):`,
        });
        const ul = block.createEl("ul");
        for (const f of files) {
          const li = ul.createEl("li");
          li.createEl("code", { text: f.path });
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
    });
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
      return this.placeholder(
        body,
        this.status!.lint.error || "Lint subprocess unavailable in this workspace"
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
  }): void {
    const attr: Record<string, string> = {
      "data-entry-section": opts.section,
      "data-entry-id": opts.id,
      "data-entry-sev": opts.sev,
      "data-entry-text": opts.text.toLowerCase(),
    };
    if (opts.modeAttr) attr["data-entry-mode"] = opts.modeAttr;
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

    const actions = detail.createDiv({ cls: "entry-actions" });
    const sendBtn = actions.createEl("button", { text: copyActionLabel(opts.section), cls: "mod-cta" });
    sendBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const indexed2 = this.entryIndex.get(`${opts.section}:${opts.id}`);
      if (!indexed2) return;
      await navigator.clipboard.writeText(indexed2.prompt);
      new Notice(`Instrumentality: ${primaryActionLabel(opts.section).toLowerCase()} prompt copied.`);
    });
    const openBtn = actions.createEl("button", { text: "Open Source" });
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.openSource(opts.sourceFile);
    });
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

    // Verdict picker — only for sections in VERDICTS_BY_SECTION. Mirrors
    // the VSCode extension: user has already decided, form just records
    // the call. UI never invokes MCP directly — every verdict generates
    // a prompt and copies it to the clipboard for the user's agent.
    const verdictDefs = VERDICTS_BY_SECTION[opts.section];
    if (verdictDefs && opts.verdictQueueKey) {
      this.appendVerdictPicker(detail, {
        section: opts.section,
        verdictDefs,
        queueKey: opts.verdictQueueKey,
        files: opts.verdictFiles ?? [],
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
          await this.submitVerdict(opts.section, def, opts.queueKey, {});
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
      await this.submitVerdict(opts.section, def, opts.queueKey, draft);
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
    draft: { filePaths?: string[]; reason?: string; note?: string }
  ): Promise<void> {
    // Same safety belt as the VSCode extension: client-side validation
    // already covered this, but messages are untrusted input semantically.
    let prompt: string;
    try {
      switch (def.verdict) {
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

    for (const k of sortedKeys) {
      const arr = groups.get(k)!;
      const card = grid.createDiv({
        cls: "instrumentality-section-card activity-group",
        attr: { "data-activity-group": k },
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: k });
      h2.createSpan({ cls: "count", text: String(arr.length) });
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
    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
  }

  // ── Index ──────────────────────────────────────────────────────────────

  private buildEntryIndex(status: StatusSummary | null): Map<string, RenderedEntry> {
    const out = new Map<string, RenderedEntry>();
    if (!status) return out;
    const push = (e: Omit<RenderedEntry, "prompt">) => {
      const key = `${e.section}:${e.id}`;
      out.set(key, { ...e, prompt: getActionPrompt(e.promptInput) });
    };

    status.codeDrift.entries.forEach((e, i) =>
      push({
        section: "code-drift",
        id: stableEntryId(e.kbTarget, i),
        promptInput: { kind: "code-drift", entry: e },
        sourceFile: path.join("knowledge", e.kbTarget),
      })
    );
    status.kbDrift.entries.forEach((e, i) =>
      push({
        section: "kb-drift",
        id: stableEntryId(e.kbFile, i),
        promptInput: { kind: "kb-drift", entry: e },
        sourceFile: path.join("knowledge", e.kbFile),
      })
    );
    status.standardsDrift.entries.forEach((e, i) =>
      push({
        section: "standards-drift",
        id: stableEntryId(`${e.mode}:${e.queueKey}`, i),
        promptInput: { kind: "standards-drift", entry: e },
        sourceFile: Object.values(e.filesByParty).flat()[0]?.path,
        standardId: e.standardId,
      })
    );
    for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
      if (!p || p.requested.length === 0) continue;
      p.requested.forEach((r, i) =>
        push({
          section: "conform-pending",
          id: stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i),
          promptInput: { kind: "conform", entry: p },
          sourceFile: r.file,
          standardId: r.standard_id,
        })
      );
    }
    status.promotions.forEach((e, i) =>
      push({
        section: "promotions",
        id: stableEntryId(e.queueKey, i),
        promptInput: { kind: "promotion", entry: e },
        sourceFile: e.files[0]?.path,
        standardId: e.standardId,
      })
    );
    status.lint.violations.forEach((v, i) =>
      push({
        section: "lint",
        id: stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i),
        promptInput: { kind: "lint", entry: v },
        sourceFile: v.file,
      })
    );
    return out;
  }
}
