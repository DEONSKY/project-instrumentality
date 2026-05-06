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
  type GroupBy,
  type EntryHandle,
} from "@instrumentality/shared";
import { SyncWatcher } from "./watcher";

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

type SectionKind =
  | "code-drift"
  | "kb-drift"
  | "standards-drift"
  | "conform-pending"
  | "promotions"
  | "lint";

export class InstrumentalityView extends ItemView {
  private status: StatusSummary | null = null;
  private kbRoot: string | null = null;
  private watcher: SyncWatcher | null = null;
  private entryIndex: Map<string, RenderedEntry> = new Map();
  private filterSearch = "";
  private hiddenSections: Set<SectionKind> = new Set();
  private severityFilter: Set<"error" | "warn" | "info"> = new Set();
  private groupBy: GroupBy = "section";

  constructor(leaf: WorkspaceLeaf, private getKbRoot: () => string | null) {
    super(leaf);
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
    this.renderFilterBar(root);
    this.renderSections(root);
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
        const i = s.standardsDrift.entries.findIndex((e, idx) => stableEntryId(e.queueKey, idx) === h.id);
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
    hint?: string
  ): HTMLElement {
    const card = parent.createDiv({ cls: "instrumentality-section-card", attr: { "data-section": kind } });
    const header = card.createEl("header");
    const h2 = header.createEl("h2");
    h2.createSpan({ text: title });
    h2.createSpan({ cls: "count", text: String(count) });
    if (badgeText) h2.createSpan({ cls: "badge", text: badgeText });
    if (hint) header.createDiv({ cls: "group-hint", text: hint });
    return card.createDiv({ cls: "body" });
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
    const id = stableEntryId(e.queueKey, i);
    const sev = (e.severity as "error" | "warn" | "info" | null) ?? null;
    const fileCount = Object.values(e.filesByParty).reduce((s, fs) => s + fs.length, 0);
    const firstFile = Object.values(e.filesByParty).flat()[0]?.path;
    const ruleHint = e.resolvedRule?.title ? ` · ${e.resolvedRule.title}` : "";
    const text =
      e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "") + " " + (e.resolvedRule?.title ?? "");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (sev) h2.createSpan({ cls: `badge sev-${sev}`, text: sev });
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
    const body = this.sectionShell(
      parent,
      "conform-pending",
      SECTION_GUIDE["conform-pending"].label,
      total,
      stale ? "baseline stale" : undefined,
      SECTION_GUIDE["conform-pending"].what
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
      if (e.ruleFingerprint) {
        const fp = div.createDiv();
        fp.createSpan({ text: "Fingerprint: " });
        fp.createEl("code", { text: e.ruleFingerprint });
      }
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
    };
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
  }): void {
    const row = opts.parent.createDiv({
      cls: "instrumentality-entry",
      attr: {
        "data-entry-section": opts.section,
        "data-entry-id": opts.id,
        "data-entry-sev": opts.sev,
        "data-entry-text": opts.text.toLowerCase(),
      },
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
    const range = f.latestCommit
      ? `${f.sinceCommit}..${f.latestCommit}`
      : f.sinceCommit; // diff against working tree when no latest
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        ["diff", "--no-color", range, "--", f.relPath],
        { cwd: this.kbRoot!, maxBuffer: 8 * 1024 * 1024 },
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
        id: stableEntryId(e.queueKey, i),
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
