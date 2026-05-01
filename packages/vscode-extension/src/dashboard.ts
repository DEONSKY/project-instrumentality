import * as vscode from "vscode";
import * as path from "node:path";
import {
  getActionPrompt,
  stableEntryId,
  type StatusSummary,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type LintViolation,
  type PromptInput,
} from "@instrumentality/shared";

export type SectionKind =
  | "code-drift"
  | "kb-drift"
  | "standards-drift"
  | "conform-pending"
  | "promotions"
  | "lint";

export interface DashboardFilter {
  search: string;
  severities: Set<"error" | "warn" | "info">;
  hiddenSections: Set<SectionKind>;
}

export interface DashboardCallbacks {
  getStatus: () => StatusSummary | null;
  getFilter: () => DashboardFilter;
  setFilter: (f: DashboardFilter) => void;
  onAction: (action: DashboardAction) => Promise<void>;
  onReveal: (entryRef: EntryRef) => Promise<void>;
}

export type DashboardAction =
  | { type: "send"; ref: EntryRef }
  | { type: "copy"; ref: EntryRef }
  | { type: "open"; ref: EntryRef }
  | { type: "openStandard"; ref: EntryRef }
  | { type: "refresh" };

export interface EntryRef {
  section: SectionKind;
  id: string;
}

let panel: vscode.WebviewPanel | null = null;
let cb: DashboardCallbacks | null = null;
let entryIndex: Map<string, IndexedEntry> = new Map();

interface IndexedEntry {
  section: SectionKind;
  id: string;
  promptInput: PromptInput;
  prompt: string;
  sourceFile?: string;
  standardId?: string | null;
}

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
  entryIndex = buildEntryIndex(status);
  panel.webview.html = renderHtml(status, filter, entryIndex);
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
    case "reveal":
      await cb.onReveal(msg.ref);
      return;
    case "updateFilter": {
      const next: DashboardFilter = {
        search: typeof msg.search === "string" ? msg.search : "",
        severities: new Set(Array.isArray(msg.severities) ? msg.severities : []),
        hiddenSections: new Set(Array.isArray(msg.hiddenSections) ? msg.hiddenSections : []),
      };
      cb.setFilter(next);
      // No re-render — webview applies filter client-side and persists via this message.
      return;
    }
  }
}

export function lookupEntry(ref: EntryRef): IndexedEntry | undefined {
  return entryIndex.get(`${ref.section}:${ref.id}`);
}

// ── Index building ──────────────────────────────────────────────────────────

function buildEntryIndex(status: StatusSummary | null): Map<string, IndexedEntry> {
  const out = new Map<string, IndexedEntry>();
  if (!status) return out;
  const push = (e: Omit<IndexedEntry, "prompt"> & { prompt?: string }) => {
    const key = `${e.section}:${e.id}`;
    out.set(key, {
      ...e,
      prompt: e.prompt ?? getActionPrompt(e.promptInput),
    });
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

// ── HTML rendering ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function severityClass(sev: string | null | undefined): string {
  if (sev === "error") return "sev-error";
  if (sev === "warn") return "sev-warn";
  if (sev === "info") return "sev-info";
  return "sev-none";
}

function severityLabel(sev: string | null | undefined): string | null {
  if (sev === "error" || sev === "warn" || sev === "info") return sev;
  return null;
}

function renderHtml(
  status: StatusSummary | null,
  filter: DashboardFilter,
  index: Map<string, IndexedEntry>
): string {
  const head = status?.currentHeadShort ?? "?";
  const totals = status?.totals;

  const initialFilter = JSON.stringify({
    search: filter.search,
    severities: [...filter.severities],
    hiddenSections: [...filter.hiddenSections],
  });

  const entriesJson = JSON.stringify(
    Object.fromEntries(
      [...index].map(([k, v]) => [k, { prompt: v.prompt }])
    )
  );

  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>Instrumentality Dashboard</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="app-header">
    <div>
      <h1>Instrumentality Dashboard</h1>
      <div class="head-line">HEAD: <code>${escapeHtml(head)}</code></div>
    </div>
    <div class="toolbar">
      <button class="btn" data-cmd="refresh">Refresh</button>
    </div>
  </header>

  ${
    !status
      ? `<div class="empty-state">Knowledge base not detected. Open a workspace containing a <code>knowledge/</code> directory.</div>`
      : `
  <div class="totals">
    ${totalCard("Drifts", totals!.drifts, totals!.drifts > 0 ? "warn" : "ok")}
    ${totalCard("Conform Pending", totals!.conformPending, totals!.conformPending > 0 ? "warn" : "ok")}
    ${totalCard("Promotions", totals!.promotions, "")}
    ${totalCard("Lint Errors", totals!.lintErrors, totals!.lintErrors > 0 ? "error" : "ok")}
    ${totalCard("Lint Warnings", totals!.lintWarnings, totals!.lintWarnings > 0 ? "warn" : "ok")}
  </div>

  <div class="filter-bar">
    <input id="search" type="search" placeholder="Filter entries…" value="${escapeAttr(filter.search)}" />
    <div class="chip-group" id="severity-chips" data-group="severity">
      ${chip("error", "Error", filter.severities.has("error"), "sev-error")}
      ${chip("warn", "Warn", filter.severities.has("warn"), "sev-warn")}
      ${chip("info", "Info", filter.severities.has("info"), "sev-info")}
    </div>
    <div class="chip-group" id="section-chips" data-group="section">
      ${sectionChip("code-drift", "Code", filter.hiddenSections)}
      ${sectionChip("kb-drift", "KB", filter.hiddenSections)}
      ${sectionChip("standards-drift", "Standards", filter.hiddenSections)}
      ${sectionChip("conform-pending", "Conform", filter.hiddenSections)}
      ${sectionChip("promotions", "Promotions", filter.hiddenSections)}
      ${sectionChip("lint", "Lint", filter.hiddenSections)}
    </div>
    <button class="btn btn-link" id="clear-filter">Clear</button>
  </div>

  <div class="section-grid">
    ${renderCodeDriftCard(status, index)}
    ${renderKbDriftCard(status, index)}
    ${renderStandardsDriftCard(status, index)}
    ${renderConformCard(status, index)}
    ${renderPromotionsCard(status, index)}
    ${renderLintCard(status, index)}
  </div>
  `
  }

  <script>
    const vscode = acquireVsCodeApi();
    const ENTRIES = ${entriesJson};
    let filterState = ${initialFilter};
    filterState.severities = new Set(filterState.severities);
    filterState.hiddenSections = new Set(filterState.hiddenSections);

    function applyFilter() {
      const search = (filterState.search || "").toLowerCase();
      const severities = filterState.severities;
      const hiddenSections = filterState.hiddenSections;

      document.querySelectorAll("[data-section]").forEach((card) => {
        const section = card.getAttribute("data-section");
        if (hiddenSections.has(section)) {
          card.classList.add("hidden");
        } else {
          card.classList.remove("hidden");
        }
      });

      let visiblePerSection = {};
      document.querySelectorAll(".entry").forEach((row) => {
        const section = row.getAttribute("data-entry-section");
        const sev = row.getAttribute("data-entry-sev") || "";
        const text = (row.getAttribute("data-entry-text") || "").toLowerCase();
        let show = true;
        if (severities.size > 0 && !severities.has(sev)) show = false;
        if (search && !text.includes(search)) show = false;
        if (hiddenSections.has(section)) show = false;
        row.classList.toggle("hidden", !show);
        if (show) visiblePerSection[section] = (visiblePerSection[section] || 0) + 1;
      });

      document.querySelectorAll("[data-section]").forEach((card) => {
        const section = card.getAttribute("data-section");
        const visEmpty = card.querySelector(".visible-empty");
        const total = (visiblePerSection[section] || 0);
        if (visEmpty) visEmpty.classList.toggle("hidden", total > 0);
      });

      vscode.postMessage({
        command: "updateFilter",
        search: filterState.search,
        severities: [...severities],
        hiddenSections: [...hiddenSections],
      });
    }

    function refRefFromEl(el) {
      return { section: el.getAttribute("data-entry-section"), id: el.getAttribute("data-entry-id") };
    }

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const cmd = target.getAttribute("data-cmd");
      if (cmd === "refresh") { vscode.postMessage({ command: "refresh" }); return; }

      const chip = target.closest(".chip");
      if (chip) {
        const group = chip.parentElement.getAttribute("data-group");
        const value = chip.getAttribute("data-value");
        if (group === "severity") {
          if (filterState.severities.has(value)) filterState.severities.delete(value);
          else filterState.severities.add(value);
        } else if (group === "section") {
          if (filterState.hiddenSections.has(value)) filterState.hiddenSections.delete(value);
          else filterState.hiddenSections.add(value);
        }
        chip.classList.toggle("on");
        applyFilter();
        return;
      }

      if (target.id === "clear-filter") {
        filterState = { search: "", severities: new Set(), hiddenSections: new Set() };
        const search = document.getElementById("search");
        if (search instanceof HTMLInputElement) search.value = "";
        document.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
        document.querySelectorAll(".chip[data-group-default-on='true']").forEach((c) => c.classList.add("on"));
        applyFilter();
        return;
      }

      const action = target.getAttribute("data-action");
      if (action) {
        const row = target.closest(".entry");
        if (!row) return;
        const ref = refRefFromEl(row);
        vscode.postMessage({ command: action, ref });
        return;
      }

      const summary = target.closest(".entry-summary");
      if (summary) {
        const row = summary.closest(".entry");
        if (!row) return;
        const wasOpen = row.classList.toggle("open");
        if (wasOpen) {
          const ref = refRefFromEl(row);
          const detail = row.querySelector(".entry-detail-prompt");
          if (detail) {
            const data = ENTRIES[ref.section + ":" + ref.id];
            detail.textContent = (data && data.prompt) || "(no prompt available)";
          }
          vscode.postMessage({ command: "reveal", ref: ref });
        }
      }
    });

    let searchTimer;
    document.getElementById("search")?.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      const v = (e.target instanceof HTMLInputElement) ? e.target.value : "";
      searchTimer = setTimeout(() => {
        filterState.search = v;
        applyFilter();
      }, 200);
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg && msg.command === "highlight" && msg.ref) {
        const row = document.querySelector(
          ".entry[data-entry-section='" + msg.ref.section + "'][data-entry-id='" + msg.ref.id + "']"
        );
        if (row) {
          row.scrollIntoView({ block: "nearest", behavior: "smooth" });
          row.classList.add("flash");
          setTimeout(() => row.classList.remove("flash"), 1500);
        }
      }
    });

    applyFilter();
  </script>
</body>
</html>`;
}

function totalCard(label: string, n: number, cls: string): string {
  return `<div class="total-card ${cls}"><div class="n">${n}</div><div class="l">${escapeHtml(label)}</div></div>`;
}

function chip(value: string, label: string, on: boolean, sevClass: string): string {
  return `<span class="chip ${sevClass} ${on ? "on" : ""}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</span>`;
}

function sectionChip(value: SectionKind, label: string, hidden: Set<SectionKind>): string {
  // Section chips work inversely — they're "on" when section is VISIBLE.
  const on = !hidden.has(value);
  return `<span class="chip section ${on ? "" : "on"}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</span>`;
}

function entryShell(
  ref: EntryRef,
  sev: string | null,
  searchableText: string,
  summaryHtml: string,
  detailMetaHtml: string,
  hasStandard: boolean
): string {
  const sevAttr = sev ?? "";
  const standardBtn = hasStandard
    ? `<button class="btn btn-tiny" data-action="openStandard">Open Standard</button>`
    : "";
  return `<div class="entry"
    data-entry-section="${escapeAttr(ref.section)}"
    data-entry-id="${escapeAttr(ref.id)}"
    data-entry-sev="${escapeAttr(sevAttr)}"
    data-entry-text="${escapeAttr(searchableText)}">
    <div class="entry-summary">${summaryHtml}</div>
    <div class="entry-detail">
      ${detailMetaHtml}
      <pre class="entry-detail-prompt"></pre>
      <div class="entry-actions">
        <button class="btn btn-primary" data-action="send">Send</button>
        <button class="btn" data-action="copy">Copy</button>
        <button class="btn" data-action="open">Open Source</button>
        ${standardBtn}
      </div>
    </div>
  </div>`;
}

function sectionShell(
  kind: SectionKind,
  title: string,
  count: number,
  badgeHtml: string,
  bodyHtml: string
): string {
  return `<section class="section-card" data-section="${escapeAttr(kind)}">
    <header><h2>${escapeHtml(title)} <span class="count">${count}</span> ${badgeHtml}</h2></header>
    <div class="body">
      ${bodyHtml}
      <div class="visible-empty placeholder hidden">No entries match the current filter</div>
    </div>
  </section>`;
}

function renderCodeDriftCard(status: StatusSummary, idx: Map<string, IndexedEntry>): string {
  const entries = status.codeDrift.entries;
  const baseline = status.codeDrift.baseline.sha;
  const baselineHtml = baseline
    ? `<span class="badge" title="baseline">${escapeHtml(baseline.slice(0, 7))}</span>`
    : "";
  const body = entries.length === 0
    ? `<div class="placeholder">No code drift</div>`
    : entries.map((e, i) => codeDriftRow(e, i, idx)).join("");
  return sectionShell("code-drift", "Code Drifts", entries.length, baselineHtml, body);
}

function codeDriftRow(e: CodeDriftEntry, i: number, idx: Map<string, IndexedEntry>): string {
  const id = stableEntryId(e.kbTarget, i);
  const ref = { section: "code-drift" as SectionKind, id };
  const filesPreview = e.codeFiles.slice(0, 3).map((f) => path.basename(f.path)).join(", ");
  const more = e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : "";
  const sharedBadge = e.hasShared ? `<span class="badge shared">shared</span>` : "";
  const summary = `
    <div class="title">${escapeHtml(e.kbTarget)} ${sharedBadge}</div>
    <div class="meta">${e.codeFiles.length} file(s) — ${escapeHtml(filesPreview + more)}</div>`;
  const detailMeta = `<div class="detail-meta"><strong>KB target:</strong> <code>${escapeHtml(e.kbTarget)}</code></div>`;
  const sev = e.hasShared ? "warn" : "info";
  const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
  return entryShell(ref, sev, text, summary, detailMeta, false);
}

function renderKbDriftCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const entries = status.kbDrift.entries;
  const body = entries.length === 0
    ? `<div class="placeholder">No KB drift</div>`
    : entries.map((e, i) => kbDriftRow(e, i)).join("");
  return sectionShell("kb-drift", "KB Drifts", entries.length, "", body);
}

function kbDriftRow(e: KbDriftEntry, i: number): string {
  const id = stableEntryId(e.kbFile, i);
  const ref = { section: "kb-drift" as SectionKind, id };
  const summary = `
    <div class="title">${escapeHtml(e.kbFile)} ${e.unmapped ? `<span class="badge sev-warn">unmapped</span>` : ""}</div>
    <div class="meta">${e.codeAreas.length} code area(s)${e.refCount && e.refCount.count > 0 ? ` · ${e.refCount.count} reference(s)` : ""}</div>`;
  const detailMeta = `<div class="detail-meta">
    ${e.renamedFrom ? `<div><strong>Renamed from:</strong> <code>${escapeHtml(e.renamedFrom)}</code></div>` : ""}
    ${e.sinceCommit ? `<div><strong>Since:</strong> <code>${escapeHtml(e.sinceCommit)}</code> (${escapeHtml(e.sinceDate ?? "")})</div>` : ""}
    <div><strong>Code areas:</strong> ${e.codeAreas.length === 0 ? "<em>none mapped</em>" : e.codeAreas.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ")}</div>
  </div>`;
  const sev = e.unmapped ? "warn" : "info";
  const text = e.kbFile + " " + e.codeAreas.join(" ");
  return entryShell(ref, sev, text, summary, detailMeta, false);
}

function renderStandardsDriftCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const entries = status.standardsDrift.entries;
  const body = entries.length === 0
    ? `<div class="placeholder">No standards drift</div>`
    : entries.map((e, i) => standardsDriftRow(e, i)).join("");
  return sectionShell("standards-drift", "Standards Drifts", entries.length, "", body);
}

function standardsDriftRow(e: StandardsDriftEntry, i: number): string {
  const id = stableEntryId(e.queueKey, i);
  const ref = { section: "standards-drift" as SectionKind, id };
  const sev = severityLabel(e.severity);
  const sevBadge = sev ? `<span class="badge ${severityClass(sev)}">${sev}</span>` : "";
  const fileCount = Object.values(e.filesByParty).reduce((sum, files) => sum + files.length, 0);
  const summary = `
    <div class="title">${escapeHtml(e.queueKey)} ${sevBadge}</div>
    <div class="meta">${escapeHtml(e.standardId ?? "?")} ${e.standardKind ? `(${escapeHtml(e.standardKind)})` : ""} · ${fileCount} file(s)</div>`;
  const partyBlocks = Object.entries(e.filesByParty)
    .map(([party, files]) => {
      const label = party === "_" ? "Files" : `Files (party: ${escapeHtml(party)})`;
      const lis = files.map((f) => `<li><code>${escapeHtml(f.path)}</code></li>`).join("");
      return `<div><strong>${label}:</strong><ul>${lis}</ul></div>`;
    })
    .join("");
  const detailMeta = `<div class="detail-meta">
    ${e.reason ? `<div><strong>Reason:</strong> ${escapeHtml(e.reason)}</div>` : ""}
    ${partyBlocks}
  </div>`;
  const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "");
  return entryShell(ref, sev, text, summary, detailMeta, !!e.standardId);
}

function renderConformCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const c = status.conformPending.current;
  const a = status.conformPending.aspirational;
  const total =
    (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
  const stale = c?.staleAgainstHead || a?.staleAgainstHead;
  const badge = stale
    ? `<span class="badge sev-warn">baseline stale</span>`
    : "";
  const rows: string[] = [];
  for (const p of [c, a]) {
    if (!p || p.requested.length === 0) continue;
    p.requested.forEach((r, i) => rows.push(conformRow(p, r, i)));
  }
  const body = rows.length === 0
    ? `<div class="placeholder">No conform pending</div>`
    : rows.join("");
  return sectionShell("conform-pending", "Conform Pending", total, badge, body);
}

function conformRow(
  p: ConformPending & { staleAgainstHead?: boolean },
  r: ConformPending["requested"][number],
  i: number
): string {
  const id = stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i);
  const ref = { section: "conform-pending" as SectionKind, id };
  const summary = `
    <div class="title">${escapeHtml(r.file)} ${p.staleAgainstHead ? `<span class="badge sev-warn">stale</span>` : ""}</div>
    <div class="meta"><code>${escapeHtml(r.standard_id)}</code> · ${escapeHtml(r.rule_ids.join(", "))} (${escapeHtml(p.mode)} @ ${escapeHtml(p.head_sha_short)})</div>`;
  const detailMeta = `<div class="detail-meta">
    <div><strong>Mode:</strong> ${escapeHtml(p.mode)}</div>
    <div><strong>Baseline:</strong> <code>${escapeHtml(p.head_sha_short)}</code> (${escapeHtml(p.head_date)})</div>
    ${p.scope ? `<div><strong>Scope:</strong> <code>${escapeHtml(p.scope)}</code></div>` : ""}
    <div><strong>Standard:</strong> <code>${escapeHtml(r.standard_id)}</code></div>
    <div><strong>Rules:</strong> ${r.rule_ids.map((x) => `<code>${escapeHtml(x)}</code>`).join(", ")}</div>
  </div>`;
  const text = r.file + " " + r.standard_id + " " + r.rule_ids.join(" ");
  return entryShell(ref, p.staleAgainstHead ? "warn" : "info", text, summary, detailMeta, true);
}

function renderPromotionsCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const entries = status.promotions;
  const body = entries.length === 0
    ? `<div class="placeholder">No pending promotions</div>`
    : entries.map((e, i) => promotionRow(e, i)).join("");
  return sectionShell("promotions", "Pending Promotions", entries.length, "", body);
}

function promotionRow(e: PromotionEntry, i: number): string {
  const id = stableEntryId(e.queueKey, i);
  const ref = { section: "promotions" as SectionKind, id };
  const sev = severityLabel(e.severity);
  const sevBadge = sev ? `<span class="badge ${severityClass(sev)}">${sev}</span>` : "";
  const summary = `
    <div class="title">${escapeHtml(e.queueKey)} ${sevBadge}</div>
    <div class="meta">${e.files.length} file(s) · <code>${escapeHtml(e.standardId ?? "?")}</code></div>`;
  const filesList = e.files
    .map((f) => `<li><code>${escapeHtml(f.path)}</code> — promoted ${escapeHtml(f.promotedAt)}${f.note ? ` <em>${escapeHtml(f.note)}</em>` : ""}</li>`)
    .join("");
  const detailMeta = `<div class="detail-meta">
    <div><strong>Rule:</strong> <code>${escapeHtml(e.ruleId ?? "?")}</code></div>
    ${e.ruleFingerprint ? `<div><strong>Fingerprint:</strong> <code>${escapeHtml(e.ruleFingerprint)}</code></div>` : ""}
    <div><strong>Files:</strong><ul>${filesList}</ul></div>
  </div>`;
  const text = e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ");
  return entryShell(ref, sev, text, summary, detailMeta, !!e.standardId);
}

function renderLintCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const v = status.lint.violations;
  const badge = !status.lint.ran
    ? `<span class="badge sev-info">unavailable</span>`
    : "";
  const body = !status.lint.ran
    ? `<div class="placeholder">${escapeHtml(status.lint.error || "Lint subprocess unavailable in this workspace")}</div>`
    : v.length === 0
    ? `<div class="placeholder">No lint issues</div>`
    : v.map((violation, i) => lintRow(violation, i)).join("");
  return sectionShell("lint", "Lint Issues", v.length, badge, body);
}

function lintRow(v: LintViolation, i: number): string {
  const id = stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i);
  const ref = { section: "lint" as SectionKind, id };
  const sevBadge = `<span class="badge ${severityClass(v.severity)}">${v.severity}</span>`;
  const summary = `
    <div class="title">${escapeHtml(path.basename(v.file))} ${sevBadge}</div>
    <div class="meta"><code>${escapeHtml(v.file)}</code> — ${escapeHtml(v.message)}</div>`;
  const detailMeta = `<div class="detail-meta">
    <div><strong>File:</strong> <code>${escapeHtml(v.file)}</code></div>
    <div><strong>Message:</strong> ${escapeHtml(v.message)}</div>
  </div>`;
  const text = v.file + " " + v.message;
  return entryShell(ref, v.severity, text, summary, detailMeta, false);
}

const CSS = `
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-foreground);
  --muted: var(--vscode-descriptionForeground);
  --border: var(--vscode-panel-border);
  --card-bg: var(--vscode-editorWidget-background);
  --accent: var(--vscode-textLink-foreground);
  --error: var(--vscode-charts-red, #e51400);
  --warn: var(--vscode-charts-yellow, #b58900);
  --info: var(--vscode-charts-blue, #4a90e2);
  --code-bg: var(--vscode-textBlockQuote-background);
  --highlight: var(--vscode-editor-findMatchHighlightBackground, rgba(255,200,0,0.3));
}
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--fg);
  background: var(--bg);
  margin: 0;
  padding: 24px;
  line-height: 1.45;
}
code {
  font-family: var(--vscode-editor-font-family);
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.92em;
}
pre {
  font-family: var(--vscode-editor-font-family);
  background: var(--code-bg);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  margin: 8px 0 0;
  max-height: 400px;
  overflow: auto;
  font-size: 0.92em;
}
.app-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}
h1 { margin: 0; font-size: 1.4em; font-weight: 600; }
.head-line { color: var(--muted); font-size: 0.9em; margin-top: 4px; }
.toolbar { display: flex; gap: 8px; }
.btn {
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--fg));
  border: 1px solid var(--border);
  padding: 5px 12px;
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  font-size: 0.9em;
}
.btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--card-bg)); }
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-tiny { padding: 3px 8px; font-size: 0.85em; }
.btn-link {
  background: transparent;
  border: none;
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
  padding: 2px 4px;
}
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--muted);
}
.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.total-card {
  padding: 12px 14px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.total-card .n { font-size: 1.7em; font-weight: 600; line-height: 1; }
.total-card .l { color: var(--muted); font-size: 0.82em; margin-top: 4px; }
.total-card.error .n { color: var(--error); }
.total-card.warn  .n { color: var(--warn); }
.total-card.ok    .n { color: var(--accent); }

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.filter-bar input[type="search"] {
  flex: 1 1 200px;
  min-width: 160px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--border));
  border-radius: 3px;
  padding: 4px 8px;
  font: inherit;
}
.chip-group { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 12px;
  font-size: 0.82em;
  background: var(--code-bg);
  border: 1px solid transparent;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}
.chip:hover { border-color: var(--border); }
.chip.on { color: var(--fg); border-color: var(--accent); background: var(--vscode-editor-selectionBackground, var(--card-bg)); }
.chip.section.on { color: var(--fg); }
.chip.sev-error.on { background: var(--error); color: #fff; border-color: var(--error); }
.chip.sev-warn.on  { background: var(--warn); color: #000; border-color: var(--warn); }
.chip.sev-info.on  { background: var(--info); color: #fff; border-color: var(--info); }

.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 16px;
}
.section-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.section-card.hidden { display: none; }
.section-card > header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.section-card h2 {
  margin: 0;
  font-size: 1.0em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-card h2 .count {
  display: inline-block;
  background: var(--code-bg);
  color: var(--muted);
  font-size: 0.82em;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.section-card .body { padding: 4px 14px; }
.placeholder {
  padding: 18px 4px;
  color: var(--muted);
  font-style: italic;
  text-align: center;
}
.placeholder.hidden { display: none; }

.entry {
  border-bottom: 1px solid var(--border);
  padding: 8px 0;
  transition: background-color 0.6s;
}
.entry.hidden { display: none; }
.entry:last-child { border-bottom: none; }
.entry-summary { cursor: pointer; }
.entry-summary:hover .title { color: var(--accent); }
.entry .title {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.95em;
  display: flex;
  align-items: center;
  gap: 6px;
}
.entry .meta {
  color: var(--muted);
  font-size: 0.83em;
  margin-top: 2px;
}
.entry-detail {
  display: none;
  padding: 8px 8px 4px;
  border-top: 1px dashed var(--border);
  margin-top: 8px;
}
.entry.open .entry-detail { display: block; }
.detail-meta { font-size: 0.88em; color: var(--fg); }
.detail-meta > div { margin-bottom: 4px; }
.detail-meta ul { margin: 4px 0 8px 18px; padding: 0; }
.detail-meta li { margin: 1px 0; }
.entry-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.entry.flash { background: var(--highlight); }

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.74em;
  vertical-align: middle;
  background: var(--code-bg);
  color: var(--muted);
  font-weight: 500;
}
.badge.shared { background: var(--info); color: #fff; }
.badge.sev-error { background: var(--error); color: #fff; }
.badge.sev-warn  { background: var(--warn);  color: #000; }
.badge.sev-info  { background: var(--info);  color: #fff; }
`;
