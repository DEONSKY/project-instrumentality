import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import * as path from "node:path";
import {
  getStatus,
  getActionPrompt,
  stableEntryId,
  resolveStandardPath,
  type StatusSummary,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type LintViolation,
  type PromptInput,
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
    this.renderTotals(root);
    this.renderFilterBar(root);
    this.renderSections(root);
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

  private renderTotals(parent: HTMLElement): void {
    const totals = this.status!.totals;
    const grid = parent.createDiv({ cls: "instrumentality-totals" });
    this.totalCard(grid, "Drifts", totals.drifts, totals.drifts > 0 ? "warn" : "ok");
    this.totalCard(
      grid,
      "Conform Pending",
      totals.conformPending,
      totals.conformPending > 0 ? "warn" : "ok"
    );
    this.totalCard(grid, "Promotions", totals.promotions, "");
    this.totalCard(
      grid,
      "Lint Errors",
      totals.lintErrors,
      totals.lintErrors > 0 ? "error" : "ok"
    );
    this.totalCard(
      grid,
      "Lint Warnings",
      totals.lintWarnings,
      totals.lintWarnings > 0 ? "warn" : "ok"
    );
  }

  private totalCard(parent: HTMLElement, label: string, n: number, cls: string): void {
    const card = parent.createDiv({ cls: `instrumentality-total-card ${cls}` });
    card.createDiv({ cls: "n", text: String(n) });
    card.createDiv({ cls: "l", text: label });
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

    const sectionGroup = bar.createDiv({ cls: "instrumentality-chip-group" });
    const sections: { key: SectionKind; label: string }[] = [
      { key: "code-drift", label: "Code" },
      { key: "kb-drift", label: "KB" },
      { key: "standards-drift", label: "Standards" },
      { key: "conform-pending", label: "Conform" },
      { key: "promotions", label: "Promotions" },
      { key: "lint", label: "Lint" },
    ];
    for (const s of sections) {
      const visible = !this.hiddenSections.has(s.key);
      const chip = sectionGroup.createSpan({
        cls: "instrumentality-chip section" + (visible ? " on" : ""),
        text: s.label,
      });
      chip.addEventListener("click", () => {
        if (this.hiddenSections.has(s.key)) this.hiddenSections.delete(s.key);
        else this.hiddenSections.add(s.key);
        chip.toggleClass("on", !this.hiddenSections.has(s.key));
        this.applyFilterDom();
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
    this.renderCodeDriftCard(grid);
    this.renderKbDriftCard(grid);
    this.renderStandardsDriftCard(grid);
    this.renderConformCard(grid);
    this.renderPromotionsCard(grid);
    this.renderLintCard(grid);
    this.applyFilterDom();
  }

  private sectionShell(
    parent: HTMLElement,
    kind: SectionKind,
    title: string,
    count: number,
    badgeText?: string
  ): HTMLElement {
    const card = parent.createDiv({ cls: "instrumentality-section-card", attr: { "data-section": kind } });
    const header = card.createEl("header");
    const h2 = header.createEl("h2");
    h2.createSpan({ text: title });
    h2.createSpan({ cls: "count", text: String(count) });
    if (badgeText) h2.createSpan({ cls: "badge", text: badgeText });
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
      "Code Drifts",
      entries.length,
      baseline ? baseline.slice(0, 7) : undefined
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
    });
  }

  private renderKbDriftCard(parent: HTMLElement): void {
    const entries = this.status!.kbDrift.entries;
    const body = this.sectionShell(parent, "kb-drift", "KB Drifts", entries.length);
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
    });
  }

  private renderStandardsDriftCard(parent: HTMLElement): void {
    const entries = this.status!.standardsDrift.entries;
    const body = this.sectionShell(parent, "standards-drift", "Standards Drifts", entries.length);
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
    const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (sev) h2.createSpan({ cls: `badge sev-${sev}`, text: sev });
    };
    const meta = `${e.standardId ?? "?"}${e.standardKind ? ` (${e.standardKind})` : ""} · ${fileCount} file(s)`;
    const detail = (d: HTMLElement) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.reason) {
        const row = div.createDiv();
        row.createSpan({ text: "Reason: " });
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
    });
  }

  private renderConformCard(parent: HTMLElement): void {
    const c = this.status!.conformPending.current;
    const a = this.status!.conformPending.aspirational;
    const total = (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
    const stale = c?.staleAgainstHead || a?.staleAgainstHead;
    const body = this.sectionShell(
      parent,
      "conform-pending",
      "Conform Pending",
      total,
      stale ? "baseline stale" : undefined
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
    r: ConformPending["requested"][number],
    i: number
  ): void {
    const id = stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i);
    const sev = p.staleAgainstHead ? "warn" : "info";
    const text = r.file + " " + r.standard_id + " " + r.rule_ids.join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: r.file });
      if (p.staleAgainstHead) h2.createSpan({ cls: "badge sev-warn", text: "stale" });
    };
    const meta = `${r.standard_id} · ${r.rule_ids.join(", ")} (${p.mode} @ ${p.head_sha_short})`;
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
    });
  }

  private renderPromotionsCard(parent: HTMLElement): void {
    const entries = this.status!.promotions;
    const body = this.sectionShell(parent, "promotions", "Pending Promotions", entries.length);
    if (entries.length === 0) return this.placeholder(body, "No pending promotions");
    entries.forEach((e, i) => this.renderPromotionRow(body, e, i));
  }

  private renderPromotionRow(parent: HTMLElement, e: PromotionEntry, i: number): void {
    const id = stableEntryId(e.queueKey, i);
    const sev = (e.severity as "error" | "warn" | "info" | null) ?? "info";
    const text =
      e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ");
    const summary = (h2: HTMLElement) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (e.severity) h2.createSpan({ cls: `badge sev-${e.severity}`, text: e.severity });
    };
    const meta = `${e.files.length} file(s) · ${e.standardId ?? "?"}`;
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
    });
  }

  private renderLintCard(parent: HTMLElement): void {
    const v = this.status!.lint.violations;
    const ran = this.status!.lint.ran;
    const body = this.sectionShell(
      parent,
      "lint",
      "Lint Issues",
      v.length,
      ran ? undefined : "unavailable"
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
    const promptPre = detail.createEl("pre", { cls: "entry-prompt" });
    promptPre.empty();
    const indexed = this.entryIndex.get(`${opts.section}:${opts.id}`);
    promptPre.appendText(indexed?.prompt ?? "(no prompt available)");

    const actions = detail.createDiv({ cls: "entry-actions" });
    const copyBtn = actions.createEl("button", { text: "Copy Prompt", cls: "mod-cta" });
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const indexed2 = this.entryIndex.get(`${opts.section}:${opts.id}`);
      if (!indexed2) return;
      await navigator.clipboard.writeText(indexed2.prompt);
      new Notice("Instrumentality: prompt copied to clipboard.");
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
    }

    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
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

  /**
   * Open via Obsidian when the file lives inside the vault (preferred — keeps
   * navigation, backlinks, and tabs working). Fall back to Electron's shell
   * for code files outside the vault.
   */
  private async openPath(absPath: string): Promise<void> {
    const vault = this.app.vault;
    const adapter = vault.adapter as unknown as { basePath?: string; getBasePath?: () => string };
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (basePath && absPath.startsWith(basePath + path.sep)) {
      const rel = absPath.slice(basePath.length + 1);
      const file = vault.getAbstractFileByPath(rel);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
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
