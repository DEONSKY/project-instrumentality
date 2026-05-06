import * as vscode from "vscode";
import * as path from "node:path";
import {
  getActionPrompt,
  stableEntryId,
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
  type GroupBy,
  type EntryHandle,
  type Group,
  type SectionKind,
} from "@instrumentality/shared";
import {
  buildCodeDriftDetail,
  buildKbDriftDetail,
  buildStandardsDriftDetail,
  buildPromotionDetail,
  buildConformDetail,
  buildLintDetail,
  collectDiffableFromCodeDrift,
  collectDiffableFromKbDrift,
  collectDiffableFromStandardsDrift,
  type DiffableFile,
} from "./details-html";

export type { SectionKind };

export interface DashboardFilter {
  search: string;
  severities: Set<"error" | "warn" | "info">;
  hiddenSections: Set<SectionKind>;
  groupBy: GroupBy;
}

export interface DashboardCallbacks {
  getStatus: () => StatusSummary | null;
  getKbRoot: () => string | null;
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
  | { type: "editRule"; ref: EntryRef }
  | { type: "refineStandard"; ref: EntryRef }
  | { type: "showFileDiff"; absPath: string; sinceCommit: string; latestCommit?: string }
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
  const kbRoot = cb.getKbRoot();
  entryIndex = buildEntryIndex(status);
  panel.webview.html = renderHtml(status, filter, entryIndex, kbRoot);
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
      // Group-by changes the section structure, so trigger a full re-render
      // (filter alone is applied client-side).
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
  index: Map<string, IndexedEntry>,
  kbRoot: string | null
): string {
  const head = status?.currentHeadShort ?? "?";

  const initialFilter = JSON.stringify({
    search: filter.search,
    severities: [...filter.severities],
    hiddenSections: [...filter.hiddenSections],
    groupBy: filter.groupBy,
  });

  const entriesJson = JSON.stringify(
    Object.fromEntries(
      [...index].map(([k, v]) => [k, { prompt: v.prompt }])
    )
  );

  const groupedBody = status ? renderGroupedBody(status, filter, index, kbRoot) : "";

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
  ${renderPipelineStrip(status)}

  <div class="filter-bar">
    <input id="search" type="search" placeholder="Filter entries…" value="${escapeAttr(filter.search)}" />
    <div class="chip-group" id="severity-chips" data-group="severity">
      ${chip("error", "Error", filter.severities.has("error"), "sev-error")}
      ${chip("warn", "Warn", filter.severities.has("warn"), "sev-warn")}
      ${chip("info", "Info", filter.severities.has("info"), "sev-info")}
    </div>
    <div class="group-by" data-group="groupBy">
      <span class="group-by-label">Group by</span>
      ${groupByChip("section", "Section", filter.groupBy)}
      ${groupByChip("file", "File", filter.groupBy)}
      ${groupByChip("standard", "Standard", filter.groupBy)}
      ${groupByChip("lifecycle", "Lifecycle", filter.groupBy)}
    </div>
    <button class="btn btn-link" id="clear-filter">Clear</button>
  </div>

  <div class="section-grid">
    ${groupedBody}
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

      let visiblePerSection = {};
      document.querySelectorAll(".entry").forEach((row) => {
        const section = row.getAttribute("data-entry-section");
        const sev = row.getAttribute("data-entry-sev") || "";
        const text = (row.getAttribute("data-entry-text") || "").toLowerCase();
        let show = true;
        if (severities.size > 0 && !severities.has(sev)) show = false;
        if (search && !text.includes(search)) show = false;
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
        hiddenSections: [],
        groupBy: filterState.groupBy,
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

      const pipelineCell = target.closest(".pipeline-cell");
      if (pipelineCell) {
        // Scroll the matching section card into view; if we're not in section
        // mode, switch to it first.
        const stage = pipelineCell.getAttribute("data-pipeline-stage");
        if (filterState.groupBy !== "section") {
          filterState.groupBy = "section";
          vscode.postMessage({ command: "setGroupBy", groupBy: "section" });
          return; // re-render will follow; user can click again post-render
        }
        const targetSections = stage === "drift"
          ? ["code-drift", "kb-drift", "standards-drift"]
          : stage === "conform"
          ? ["conform-pending"]
          : stage === "promotion"
          ? ["promotions"]
          : ["lint"];
        const card = document.querySelector('[data-section="' + targetSections[0] + '"]');
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const chip = target.closest(".chip");
      if (chip) {
        const group = chip.parentElement.getAttribute("data-group");
        const value = chip.getAttribute("data-value");
        if (group === "severity") {
          if (filterState.severities.has(value)) filterState.severities.delete(value);
          else filterState.severities.add(value);
          chip.classList.toggle("on");
          applyFilter();
        } else if (group === "groupBy") {
          // Switch group-by mode; host triggers full re-render.
          if (filterState.groupBy === value) return;
          filterState.groupBy = value;
          vscode.postMessage({ command: "setGroupBy", groupBy: value });
        }
        return;
      }

      if (target.id === "clear-filter") {
        filterState = { search: "", severities: new Set(), hiddenSections: new Set(), groupBy: filterState.groupBy };
        const search = document.getElementById("search");
        if (search instanceof HTMLInputElement) search.value = "";
        document.querySelectorAll(".chip:not(.group-by-chip)").forEach((c) => c.classList.remove("on"));
        applyFilter();
        return;
      }

      const action = target.getAttribute("data-action");
      if (action) {
        if (action === "showFileDiff") {
          vscode.postMessage({
            command: "showFileDiff",
            absPath: target.getAttribute("data-diff-path") || "",
            sinceCommit: target.getAttribute("data-diff-since") || "",
            latestCommit: target.getAttribute("data-diff-latest") || "",
          });
          return;
        }
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

function chip(value: string, label: string, on: boolean, sevClass: string): string {
  return `<span class="chip ${sevClass} ${on ? "on" : ""}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</span>`;
}

function groupByChip(value: GroupBy, label: string, current: GroupBy): string {
  const on = current === value;
  return `<span class="chip group-by-chip ${on ? "on" : ""}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</span>`;
}

/**
 * Pipeline strip — drift → conform → promotion → lint with counts. Click
 * a segment to scroll the matching section into view (when group-by is
 * "section"); otherwise, switching to "section" first via group-by puts
 * the user in the right context.
 */
function renderPipelineStrip(status: StatusSummary): string {
  const segs = pipelineSegments(status);
  const cells = segs
    .map((s, i) => {
      const dim = s.count === 0;
      const arrow = i < segs.length - 1
        ? `<span class="pipeline-arrow">→</span>`
        : "";
      return `<div class="pipeline-cell ${dim ? "dim" : "active"}" data-pipeline-stage="${escapeAttr(
        s.stage
      )}">
          <div class="pipeline-count">${s.count}</div>
          <div class="pipeline-label">${escapeHtml(s.label)}</div>
        </div>${arrow}`;
    })
    .join("");
  return `<div class="pipeline-strip">${cells}</div>`;
}

/**
 * Render the section grid driven by the current group-by mode. Section
 * mode delegates to the existing per-section card renderers (preserving
 * baselines, warnings, etc.); other modes synthesize generic group cards
 * containing entry rows projected from the IndexedEntry map.
 */
function renderGroupedBody(
  status: StatusSummary,
  filter: DashboardFilter,
  index: Map<string, IndexedEntry>,
  kbRoot: string | null
): string {
  if (filter.groupBy === "section") {
    return [
      renderCodeDriftCard(status, index, kbRoot),
      renderKbDriftCard(status, index, kbRoot),
      renderStandardsDriftCard(status, index, kbRoot),
      renderConformCard(status, index),
      renderPromotionsCard(status, index),
      renderLintCard(status, index),
    ].join("");
  }
  const handles = buildEntryHandles(status);
  const groups = groupEntries(handles, filter.groupBy);
  return groups.map((g) => renderGenericGroupCard(g, status, index, kbRoot)).join("");
}

function renderGenericGroupCard(
  g: Group,
  status: StatusSummary,
  index: Map<string, IndexedEntry>,
  kbRoot: string | null
): string {
  const body =
    g.entries.length === 0
      ? `<div class="placeholder">No entries</div>`
      : g.entries.map((h) => renderEntryByHandle(h, status, index, kbRoot)).join("");
  const hint = g.hint ? `<div class="group-hint">${escapeHtml(g.hint)}</div>` : "";
  return `<section class="section-card" data-section="${escapeAttr(g.key)}">
    <header><h2>${escapeHtml(g.label)} <span class="count">${g.entries.length}</span></h2>${hint}</header>
    <div class="body">
      ${body}
      <div class="visible-empty placeholder hidden">No entries match the current filter</div>
    </div>
  </section>`;
}

function renderEntryByHandle(
  h: EntryHandle,
  status: StatusSummary,
  _index: Map<string, IndexedEntry>,
  kbRoot: string | null
): string {
  switch (h.section) {
    case "code-drift": {
      const i = status.codeDrift.entries.findIndex((e) => stableEntryId(e.kbTarget, status.codeDrift.entries.indexOf(e)) === h.id);
      if (i < 0) return "";
      return codeDriftRow(status.codeDrift.entries[i], i, kbRoot);
    }
    case "kb-drift": {
      const i = status.kbDrift.entries.findIndex((e) => stableEntryId(e.kbFile, status.kbDrift.entries.indexOf(e)) === h.id);
      if (i < 0) return "";
      return kbDriftRow(status.kbDrift.entries[i], i, kbRoot);
    }
    case "standards-drift": {
      const i = status.standardsDrift.entries.findIndex((e) => stableEntryId(e.queueKey, status.standardsDrift.entries.indexOf(e)) === h.id);
      if (i < 0) return "";
      return standardsDriftRow(status.standardsDrift.entries[i], i, kbRoot);
    }
    case "conform-pending": {
      for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
        if (!p) continue;
        const idx = p.requested.findIndex(
          (r, i2) => stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i2) === h.id
        );
        if (idx >= 0) return conformRow(p, p.requested[idx], idx);
      }
      return "";
    }
    case "promotions": {
      const i = status.promotions.findIndex((e) => stableEntryId(e.queueKey, status.promotions.indexOf(e)) === h.id);
      if (i < 0) return "";
      return promotionRow(status.promotions[i], i);
    }
    case "lint": {
      const i = status.lint.violations.findIndex(
        (v) => stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, status.lint.violations.indexOf(v)) === h.id
      );
      if (i < 0) return "";
      return lintRow(status.lint.violations[i], i);
    }
  }
}

function entryShell(
  ref: EntryRef,
  sev: string | null,
  searchableText: string,
  summaryHtml: string,
  detailMetaHtml: string,
  hasStandard: boolean,
  hasStandardRule: boolean,
  diffableFiles: DiffableFile[]
): string {
  const sevAttr = sev ?? "";
  const standardBtns = hasStandard
    ? `<button class="btn btn-tiny" data-action="openStandard">Open Standard</button>` +
      (hasStandardRule
        ? `<button class="btn btn-tiny" data-action="editRule">Edit Rule</button>
           <button class="btn btn-tiny" data-action="refineStandard">Refine with Agent</button>`
        : "")
    : "";
  const diffSection = renderDiffSection(diffableFiles);
  const sendLabel = primaryActionLabel(ref.section);
  const copyLabel = copyActionLabel(ref.section);
  return `<div class="entry"
    data-entry-section="${escapeAttr(ref.section)}"
    data-entry-id="${escapeAttr(ref.id)}"
    data-entry-sev="${escapeAttr(sevAttr)}"
    data-entry-text="${escapeAttr(searchableText)}">
    <div class="entry-summary">${summaryHtml}</div>
    <div class="entry-detail">
      ${detailMetaHtml}
      <div class="entry-actions">
        <button class="btn btn-primary btn-tiny" data-action="send">${escapeHtml(sendLabel)}</button>
        <button class="btn btn-tiny" data-action="copy">${escapeHtml(copyLabel)}</button>
        <button class="btn btn-tiny" data-action="open">Open Source</button>
        ${standardBtns}
      </div>
      ${diffSection}
      <details class="prompt-disclosure">
        <summary>Show prompt</summary>
        <pre class="entry-detail-prompt"></pre>
      </details>
    </div>
  </div>`;
}

/**
 * Same shape as the side-view diff section but inlined here so the
 * dashboard's per-row HTML stays self-contained. Buttons carry the
 * data needed for the host to invoke `vscode.diff`.
 */
function renderDiffSection(files: DiffableFile[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) {
    const f = files[0];
    return `<div class="diff-actions">
      <button class="btn btn-tiny" data-action="showFileDiff" data-diff-path="${escapeAttr(
        f.absPath
      )}" data-diff-since="${escapeAttr(f.sinceCommit)}" data-diff-latest="${escapeAttr(
      f.latestCommit ?? ""
    )}">Show Diff (${escapeHtml(f.sinceCommit.slice(0, 7))}${
      f.latestCommit ? `→${escapeHtml(f.latestCommit.slice(0, 7))}` : "→working tree"
    })</button>
    </div>`;
  }
  const rows = files
    .map(
      (f) =>
        `<li><code>${escapeHtml(f.label)}</code>
        <button class="btn btn-tiny" data-action="showFileDiff" data-diff-path="${escapeAttr(
          f.absPath
        )}" data-diff-since="${escapeAttr(f.sinceCommit)}" data-diff-latest="${escapeAttr(
          f.latestCommit ?? ""
        )}">Show Diff</button></li>`
    )
    .join("");
  return `<div class="diff-actions">
    <details class="diff-disclosure">
      <summary>Show diffs (${files.length} files)</summary>
      <ul class="diff-list">${rows}</ul>
    </details>
  </div>`;
}

function sectionShell(
  kind: SectionKind,
  title: string,
  count: number,
  badgeHtml: string,
  bodyHtml: string,
  hint?: string
): string {
  const hintHtml = hint ? `<div class="group-hint">${escapeHtml(hint)}</div>` : "";
  return `<section class="section-card" data-section="${escapeAttr(kind)}">
    <header><h2>${escapeHtml(title)} <span class="count">${count}</span> ${badgeHtml}</h2>${hintHtml}</header>
    <div class="body">
      ${bodyHtml}
      <div class="visible-empty placeholder hidden">No entries match the current filter</div>
    </div>
  </section>`;
}

function renderCodeDriftCard(status: StatusSummary, idx: Map<string, IndexedEntry>, kbRoot: string | null): string {
  const entries = status.codeDrift.entries;
  const baseline = status.codeDrift.baseline.sha;
  const baselineHtml = baseline
    ? `<span class="badge" title="baseline">${escapeHtml(baseline.slice(0, 7))}</span>`
    : "";
  const body = entries.length === 0
    ? `<div class="placeholder">No code drift</div>`
    : entries.map((e, i) => codeDriftRow(e, i, kbRoot)).join("");
  return sectionShell("code-drift", SECTION_GUIDE["code-drift"].label + "s", entries.length, baselineHtml, body, SECTION_GUIDE["code-drift"].what);
}

function resolveAbsFor(kbRoot: string | null, p: string): string {
  return path.isAbsolute(p) ? p : kbRoot ? path.join(kbRoot, p) : p;
}

function codeDriftRow(e: CodeDriftEntry, i: number, kbRoot: string | null): string {
  const id = stableEntryId(e.kbTarget, i);
  const ref = { section: "code-drift" as SectionKind, id };
  const filesPreview = e.codeFiles.slice(0, 3).map((f) => path.basename(f.path)).join(", ");
  const more = e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : "";
  const sharedBadge = e.hasShared ? `<span class="badge shared">shared</span>` : "";
  const summary = `
    <div class="title">${escapeHtml(e.kbTarget)} ${sharedBadge}</div>
    <div class="meta">${e.codeFiles.length} file(s) — ${escapeHtml(filesPreview + more)}</div>`;
  const sev = e.hasShared ? "warn" : "info";
  const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
  const diffs = collectDiffableFromCodeDrift(e, (p) => resolveAbsFor(kbRoot, p));
  return entryShell(ref, sev, text, summary, buildCodeDriftDetail(e), false, false, diffs);
}

function renderKbDriftCard(status: StatusSummary, _idx: Map<string, IndexedEntry>, kbRoot: string | null): string {
  const entries = status.kbDrift.entries;
  const body = entries.length === 0
    ? `<div class="placeholder">No KB drift</div>`
    : entries.map((e, i) => kbDriftRow(e, i, kbRoot)).join("");
  return sectionShell("kb-drift", SECTION_GUIDE["kb-drift"].label + "s", entries.length, "", body, SECTION_GUIDE["kb-drift"].what);
}

function kbDriftRow(e: KbDriftEntry, i: number, kbRoot: string | null): string {
  const id = stableEntryId(e.kbFile, i);
  const ref = { section: "kb-drift" as SectionKind, id };
  const summary = `
    <div class="title">${escapeHtml(e.kbFile)} ${e.unmapped ? `<span class="badge sev-warn">unmapped</span>` : ""}</div>
    <div class="meta">${e.codeAreas.length} code area(s)${e.refCount && e.refCount.count > 0 ? ` · ${e.refCount.count} reference(s)` : ""}</div>`;
  const sev = e.unmapped ? "warn" : "info";
  const text = e.kbFile + " " + e.codeAreas.join(" ");
  const diffs = collectDiffableFromKbDrift(e, (p) => resolveAbsFor(kbRoot, p));
  return entryShell(ref, sev, text, summary, buildKbDriftDetail(e), false, false, diffs);
}

function renderStandardsDriftCard(status: StatusSummary, _idx: Map<string, IndexedEntry>, kbRoot: string | null): string {
  const entries = status.standardsDrift.entries;
  const body = entries.length === 0
    ? `<div class="placeholder">No standards drift</div>`
    : entries.map((e, i) => standardsDriftRow(e, i, kbRoot)).join("");
  return sectionShell("standards-drift", SECTION_GUIDE["standards-drift"].label, entries.length, "", body, SECTION_GUIDE["standards-drift"].what);
}

function standardsDriftRow(e: StandardsDriftEntry, i: number, kbRoot: string | null): string {
  const id = stableEntryId(e.queueKey, i);
  const ref = { section: "standards-drift" as SectionKind, id };
  const sev = severityLabel(e.severity);
  const sevBadge = sev ? `<span class="badge ${severityClass(sev)}">${sev}</span>` : "";
  const fileCount = Object.values(e.filesByParty).reduce((sum, files) => sum + files.length, 0);
  const ruleHint = e.resolvedRule?.title ? ` · ${escapeHtml(e.resolvedRule.title)}` : "";
  const summary = `
    <div class="title">${escapeHtml(e.queueKey)} ${sevBadge}</div>
    <div class="meta">${escapeHtml(e.standardId ?? "?")} ${e.standardKind ? `(${escapeHtml(e.standardKind)})` : ""} · ${fileCount} file(s)${ruleHint}</div>`;
  const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "") + " " + (e.resolvedRule?.title ?? "");
  const hasRule = !!(e.standardId && e.ruleId);
  const diffs = collectDiffableFromStandardsDrift(e, (p) => resolveAbsFor(kbRoot, p));
  return entryShell(ref, sev, text, summary, buildStandardsDriftDetail(e), !!e.standardId, hasRule, diffs);
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
  return sectionShell("conform-pending", SECTION_GUIDE["conform-pending"].label, total, badge, body, SECTION_GUIDE["conform-pending"].what);
}

function conformRow(
  p: ConformPending & { staleAgainstHead?: boolean },
  r: ConformRequest,
  i: number
): string {
  const id = stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i);
  const ref = { section: "conform-pending" as SectionKind, id };
  const ruleHint = r.resolvedRules && r.resolvedRules.length > 0
    ? ` · ${escapeHtml(r.resolvedRules.map((rr) => rr.title ?? rr.id).join(", "))}`
    : "";
  const summary = `
    <div class="title">${escapeHtml(r.file)} ${p.staleAgainstHead ? `<span class="badge sev-warn">stale</span>` : ""}</div>
    <div class="meta"><code>${escapeHtml(r.standard_id)}</code> · ${escapeHtml(r.rule_ids.join(", "))} (${escapeHtml(p.mode)} @ ${escapeHtml(p.head_sha_short)})${ruleHint}</div>`;
  const text =
    r.file + " " + r.standard_id + " " + r.rule_ids.join(" ") +
    " " + (r.resolvedRules?.map((rr) => rr.title ?? "").join(" ") ?? "");
  const hasRule = !!(r.standard_id && r.rule_ids.length > 0);
  return entryShell(ref, p.staleAgainstHead ? "warn" : "info", text, summary, buildConformDetail(p, r), true, hasRule, []);
}

function renderPromotionsCard(status: StatusSummary, _idx: Map<string, IndexedEntry>): string {
  const entries = status.promotions;
  const body = entries.length === 0
    ? `<div class="placeholder">No pending promotions</div>`
    : entries.map((e, i) => promotionRow(e, i)).join("");
  return sectionShell("promotions", SECTION_GUIDE.promotions.label, entries.length, "", body, SECTION_GUIDE.promotions.what);
}

function promotionRow(e: PromotionEntry, i: number): string {
  const id = stableEntryId(e.queueKey, i);
  const ref = { section: "promotions" as SectionKind, id };
  const sev = severityLabel(e.severity);
  const sevBadge = sev ? `<span class="badge ${severityClass(sev)}">${sev}</span>` : "";
  const ruleHint = e.resolvedRule?.title ? ` · ${escapeHtml(e.resolvedRule.title)}` : "";
  const summary = `
    <div class="title">${escapeHtml(e.queueKey)} ${sevBadge}</div>
    <div class="meta">${e.files.length} file(s) · <code>${escapeHtml(e.standardId ?? "?")}</code>${ruleHint}</div>`;
  const text = e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ") + " " + (e.resolvedRule?.title ?? "");
  const hasRule = !!(e.standardId && e.ruleId);
  return entryShell(ref, sev, text, summary, buildPromotionDetail(e), !!e.standardId, hasRule, []);
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
  return sectionShell("lint", SECTION_GUIDE.lint.label, v.length, badge, body, SECTION_GUIDE.lint.what);
}

function lintRow(v: LintViolation, i: number): string {
  const id = stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i);
  const ref = { section: "lint" as SectionKind, id };
  const sevBadge = `<span class="badge ${severityClass(v.severity)}">${v.severity}</span>`;
  const summary = `
    <div class="title">${escapeHtml(path.basename(v.file))} ${sevBadge}</div>
    <div class="meta"><code>${escapeHtml(v.file)}</code> — ${escapeHtml(v.message)}</div>`;
  const text = v.file + " " + v.message;
  return entryShell(ref, v.severity, text, summary, buildLintDetail(v), false, false, []);
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

.rule-block {
  background: var(--code-bg);
  border-left: 3px solid var(--accent);
  padding: 8px 10px;
  margin: 6px 0;
  border-radius: 3px;
}
.rule-block .rule-row { margin: 2px 0; font-size: 0.9em; }
.rule-block .rule-label { color: var(--muted); margin-right: 4px; font-weight: 500; }
.rule-block .rule-title { font-weight: 600; }
.rule-block .rule-aside { color: var(--muted); font-size: 0.85em; }
.rule-row.warn-note {
  margin-top: 6px;
  color: var(--warn);
  font-size: 0.88em;
}
.prompt-disclosure {
  margin-top: 10px;
  font-size: 0.88em;
  color: var(--muted);
}
.prompt-disclosure summary {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.prompt-disclosure summary:hover { color: var(--fg); }
.prompt-disclosure[open] summary { color: var(--fg); margin-bottom: 4px; }

.pipeline-strip {
  display: flex;
  align-items: stretch;
  gap: 6px;
  margin-bottom: 18px;
  padding: 10px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  flex-wrap: wrap;
}
.pipeline-cell {
  flex: 1 1 120px;
  min-width: 100px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.pipeline-cell:hover { border-color: var(--accent); }
.pipeline-cell.dim { opacity: 0.5; }
.pipeline-cell.active .pipeline-count { color: var(--accent); }
.pipeline-cell .pipeline-count {
  font-size: 1.5em;
  font-weight: 600;
  line-height: 1.1;
}
.pipeline-cell .pipeline-label {
  color: var(--muted);
  font-size: 0.78em;
  margin-top: 4px;
}
.pipeline-arrow {
  color: var(--muted);
  align-self: center;
  font-size: 1.1em;
}

.group-by {
  display: flex;
  align-items: center;
  gap: 6px;
}
.group-by-label {
  color: var(--muted);
  font-size: 0.82em;
  margin-right: 2px;
}
.chip.group-by-chip.on {
  background: var(--accent);
  color: var(--vscode-editor-background);
  border-color: var(--accent);
}

.group-hint {
  color: var(--muted);
  font-size: 0.82em;
  font-style: italic;
  padding: 4px 14px 6px;
}
.section-card > header {
  padding-bottom: 0 !important;
}

.diff-actions { margin-top: 8px; }
.diff-disclosure {
  font-size: 0.86em;
  color: var(--muted);
}
.diff-disclosure summary {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.diff-disclosure summary:hover { color: var(--fg); }
.diff-list {
  margin: 4px 0 0 0;
  padding: 0;
  list-style: none;
}
.diff-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.86em;
}
.diff-list li code { flex: 1; word-break: break-all; }
`;
