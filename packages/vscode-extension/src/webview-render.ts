import * as fs from "node:fs";
import * as path from "node:path";
import { CSS } from "./webview-css";
import {
  getActionPrompt,
  stableEntryId,
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
  type SubmoduleEntry,
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

export type RenderMode = "sidebar" | "dashboard";

export interface DashboardFilter {
  search: string;
  severities: Set<"error" | "warn" | "info">;
  hiddenSections: Set<SectionKind>;
  groupBy: GroupBy;
  /**
   * View mode toggle. "pending" = the existing section grid + filters.
   * "activity" = the drift-log timeline (Phase 4). Orthogonal to groupBy:
   * groupBy applies to pending view; activityGroupBy applies to activity.
   */
  viewMode: "pending" | "activity";
  /** Grouping for the Activity view. Ignored in pending view. */
  activityGroupBy: "date" | "queueKey" | "eventType";
  /** Default true. When false, auto-* and re-bootstrap events are hidden. */
  showSystemEvents: boolean;
  /**
   * Which section card is expanded in sidebar (accordion) mode. One section
   * is open at a time; clicking another header switches focus. Stored as a
   * generic string because submodules isn't a SectionKind. When undefined or
   * not found in the current render, the first non-empty section is opened.
   */
  openSection?: string;
  /**
   * Submodules sits OUTSIDE the accordion — it's a pinned status card with
   * its own independent collapse, because git state is a glance-and-orient
   * signal rather than a work queue. Defaults to expanded.
   */
  submodulesCollapsed?: boolean;
}

export interface EntryRef {
  section: SectionKind;
  id: string;
}

export type DashboardAction =
  | { type: "send"; ref: EntryRef }
  | { type: "copy"; ref: EntryRef }
  | { type: "open"; ref: EntryRef }
  | { type: "scaffold"; ref: EntryRef }
  | { type: "openStandard"; ref: EntryRef }
  | { type: "editRule"; ref: EntryRef }
  | { type: "refineStandard"; ref: EntryRef }
  | { type: "showFileDiff"; absPath: string; sinceCommit: string; latestCommit?: string }
  | { type: "rerunPhase1"; mode: "current" | "aspirational" }
  | { type: "openLedger" }
  | { type: "dismissBanner"; kind: SectionKind }
  | {
      type: "verdictSubmit";
      ref: EntryRef;
      verdict: VerdictKey;
      draft: VerdictDraft;
    }
  | { type: "submoduleSync"; subPath: string; parentBranch: string }
  | { type: "submodulePush" }
  | { type: "publishDrift" }
  | { type: "setOpenSection"; section: string }
  | { type: "toggleSubmodules"; collapsed: boolean }
  | { type: "copyAuditPrompt"; prompt: string }
  | { type: "refresh" };

// ── Verdict definitions ─────────────────────────────────────────────────────
//
// Verdict pickers live on standards-drift and promotions only — those are
// the two sections where the user has *already* made the judgment and just
// needs the call invoked. Other sections route through "Resolve via Agent"
// which is what they should use anyway because the verdict requires real
// agent reasoning. See the plan's "Why verdict pickers only on two
// sections" rationale.

export type VerdictKey =
  | "applied"
  | "exempted"
  | "promoted"
  | "dismissed"
  | "closed_promotion"
  | "acknowledged";

export interface VerdictDraft {
  filePaths?: string[];
  reason?: string;
  note?: string;
}

interface VerdictDef {
  verdict: VerdictKey;
  label: string;
  /** When false, click submits directly (e.g. `applied`). */
  needsForm: boolean;
  fields: {
    filePaths?: { required: boolean; label: string };
    reason?: { required: boolean };
    note?: { required: false };
  };
}

// Acknowledge — soft, non-resolving annotation. Available on all three drift
// kinds (unlike apply/exempt/promote/dismiss which only apply to
// standards-drift). The mandatory reason mitigates ack-spam; a later
// resolving verdict overrides.
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

// Webview-JS-side replica: serialized into the webview script so the click
// handler can validate forms without round-tripping to the host.
function verdictDefsForWebview(): string {
  const out: Record<string, Record<string, VerdictDef>> = {};
  for (const [section, defs] of Object.entries(VERDICTS_BY_SECTION)) {
    out[section] = {};
    for (const d of defs ?? []) out[section][d.verdict] = d;
  }
  return JSON.stringify(out);
}

export interface IndexedEntry {
  section: SectionKind;
  id: string;
  promptInput: PromptInput;
  prompt: string;
  sourceFile?: string;
  standardId?: string | null;
}

// ── Entry index ─────────────────────────────────────────────────────────────

export function buildEntryIndex(status: StatusSummary | null): Map<string, IndexedEntry> {
  const out = new Map<string, IndexedEntry>();
  if (!status) return out;
  const push = (e: Omit<IndexedEntry, "prompt"> & { prompt?: string }) => {
    const key = `${e.section}:${e.id}`;
    out.set(key, { ...e, prompt: e.prompt ?? getActionPrompt(e.promptInput) });
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

// ── HTML helpers ────────────────────────────────────────────────────────────

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

function resolveAbsFor(kbRoot: string | null, p: string): string {
  return path.isAbsolute(p) ? p : kbRoot ? path.join(kbRoot, p) : p;
}

// ── Top-level render ────────────────────────────────────────────────────────

export function renderHtml(
  status: StatusSummary | null,
  filter: DashboardFilter,
  index: Map<string, IndexedEntry>,
  kbRoot: string | null,
  mode: RenderMode,
  dismissedBanners: ReadonlySet<SectionKind> = new Set()
): string {
  const head = status?.currentHeadShort ?? "?";

  const initialFilter = JSON.stringify({
    search: filter.search,
    severities: [...filter.severities],
    hiddenSections: [...filter.hiddenSections],
    groupBy: filter.groupBy,
    viewMode: filter.viewMode,
    activityGroupBy: filter.activityGroupBy,
    showSystemEvents: filter.showSystemEvents,
  });

  const entriesJson = JSON.stringify(
    Object.fromEntries([...index].map(([k, v]) => [k, { prompt: v.prompt }]))
  );
  const verdictDefsJson = verdictDefsForWebview();

  const groupedBody = status
    ? filter.viewMode === "activity"
      ? renderActivityBody(status, filter)
      : renderGroupedBody(status, filter, index, kbRoot, dismissedBanners)
    : "";
  const showAppHeader = mode === "dashboard";

  const emptyMessage = !status
    ? !kbRoot
      ? `<div class="empty-state">Knowledge base not detected. Open a workspace containing a <code>knowledge/</code> directory.</div>`
      : `<div class="empty-state">Loading sync state…</div>`
    : "";

  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>Instrumentality</title>
  <style>${CSS}</style>
</head>
<body data-mode="${mode}">
  ${
    showAppHeader
      ? `<header class="app-header">
    <div>
      <h1>Instrumentality Dashboard</h1>
      <div class="head-line">HEAD: <code>${escapeHtml(head)}</code> ${
          status ? renderHooksBadge(status) : ""
        }</div>
    </div>
    <div class="toolbar">
      <button class="btn" data-cmd="publishDrift" title="Run drift + conform detection and commit the queue files">Publish</button>
      <button class="btn" data-cmd="refresh">Refresh</button>
    </div>
  </header>`
      : status
      ? `<div class="sidebar-ribbon"><span class="sidebar-head-line">HEAD: <code>${escapeHtml(head)}</code></span> ${renderHooksBadge(status)}</div>`
      : ""
  }

  ${
    !status
      ? emptyMessage
      : `
  ${renderSubmodulesPinned(status, filter)}

  ${renderPipelineStrip(status)}

  <div class="view-mode-tabs" data-group="viewMode">
    ${viewModeTab("pending", "Pending", filter.viewMode)}
    ${viewModeTab("activity", "Activity", filter.viewMode)}
  </div>

  ${
    filter.viewMode === "activity"
      ? renderActivityFilterBar(filter)
      : `<div class="filter-bar">
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
  </div>`
  }

  <div class="section-grid">
    ${groupedBody}
    ${status && filter.viewMode !== "activity" ? renderPatternAuditCard(status) : ""}
  </div>
  `
  }

  <script>
    const vscode = acquireVsCodeApi();
    const ENTRIES = ${entriesJson};
    const VERDICT_DEFS = ${verdictDefsJson};
    let filterState = ${initialFilter};
    filterState.severities = new Set(filterState.severities);
    filterState.hiddenSections = new Set(filterState.hiddenSections);

    // ── Verdict form helpers ────────────────────────────────────────────
    function getActiveVerdict(form) {
      const v = form.getAttribute("data-active-verdict") || "";
      const section = form.closest("[data-entry-section]")?.getAttribute("data-entry-section") || "";
      const def = (VERDICT_DEFS[section] || {})[v];
      return { verdict: v, def };
    }
    function showVerdictForm(row, verdict) {
      const form = row.querySelector(".verdict-form");
      if (!form) return;
      const section = row.getAttribute("data-entry-section");
      const def = (VERDICT_DEFS[section] || {})[verdict];
      if (!def) return;
      form.setAttribute("data-active-verdict", verdict);
      const label = form.querySelector(".verdict-active-label");
      if (label) label.textContent = "Resolve as: " + def.label.replace(/…$/, "");
      // Show only fields configured for this verdict.
      form.querySelectorAll("[data-for-field]").forEach(function (el) {
        const key = el.getAttribute("data-for-field");
        const cfg = def.fields ? def.fields[key] : null;
        el.classList.toggle("hidden", !cfg);
        if (cfg && key === "filePaths") {
          const fl = el.querySelector("[data-files-label]");
          if (fl) fl.textContent = cfg.label || "Files";
        }
      });
      form.classList.remove("hidden");
      revalidateVerdictForm(form);
    }
    function hideVerdictForm(row) {
      const form = row.querySelector(".verdict-form");
      if (!form) return;
      form.setAttribute("data-active-verdict", "");
      form.classList.add("hidden");
      // Reset fields so the next open starts clean.
      form.querySelectorAll('input[name="vfile"]').forEach(function (i) { i.checked = false; });
      const r = form.querySelector(".verdict-reason"); if (r) r.value = "";
      const n = form.querySelector(".verdict-note"); if (n) n.value = "";
    }
    function revalidateVerdictForm(form) {
      const submit = form.querySelector(".verdict-submit");
      if (!submit) return;
      const { def } = getActiveVerdict(form);
      if (!def) { submit.setAttribute("disabled", ""); return; }
      let valid = true;
      if (def.fields && def.fields.filePaths && def.fields.filePaths.required) {
        const checked = form.querySelectorAll('input[name="vfile"]:checked');
        if (checked.length === 0) valid = false;
      }
      if (def.fields && def.fields.reason && def.fields.reason.required) {
        const r = form.querySelector(".verdict-reason");
        if (!r || !r.value.trim()) valid = false;
      }
      if (valid) submit.removeAttribute("disabled");
      else submit.setAttribute("disabled", "");
    }
    function collectVerdictDraft(form) {
      const draft = {};
      const checked = [...form.querySelectorAll('input[name="vfile"]:checked')].map(function (i) { return i.value; });
      if (checked.length > 0) draft.filePaths = checked;
      const r = form.querySelector(".verdict-reason");
      if (r && r.value.trim()) draft.reason = r.value.trim();
      const n = form.querySelector(".verdict-note");
      if (n && n.value.trim()) draft.note = n.value.trim();
      return draft;
    }
    document.addEventListener("input", function (e) {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const form = t.closest(".verdict-form");
      if (form) revalidateVerdictForm(form);
    });
    document.addEventListener("change", function (e) {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const form = t.closest(".verdict-form");
      if (form) revalidateVerdictForm(form);
      if (t.id === "show-system-events" && t instanceof HTMLInputElement) {
        filterState.showSystemEvents = t.checked;
        vscode.postMessage({
          command: "setShowSystemEvents",
          showSystemEvents: t.checked,
        });
      }
    });

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
      if (cmd === "publishDrift") { vscode.postMessage({ command: "publishDrift" }); return; }

      const pipelineCell = target.closest(".pipeline-cell");
      if (pipelineCell) {
        const stage = pipelineCell.getAttribute("data-pipeline-stage");
        if (filterState.groupBy !== "section") {
          filterState.groupBy = "section";
          vscode.postMessage({ command: "setGroupBy", groupBy: "section" });
          return;
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

      const tab = target.closest(".view-mode-tab");
      if (tab) {
        const value = tab.getAttribute("data-value");
        if (filterState.viewMode === value) return;
        filterState.viewMode = value;
        vscode.postMessage({ command: "setViewMode", viewMode: value });
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
          if (filterState.groupBy === value) return;
          filterState.groupBy = value;
          vscode.postMessage({ command: "setGroupBy", groupBy: value });
        } else if (group === "activityGroupBy") {
          if (filterState.activityGroupBy === value) return;
          filterState.activityGroupBy = value;
          vscode.postMessage({ command: "setActivityGroupBy", activityGroupBy: value });
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

      // Pinned submodules card: clicking anywhere on the header (except
      // the action buttons or interactive controls inside it) toggles
      // collapse. Independent of the accordion below — separate state,
      // separate visual semantics.
      const subHeader = target.closest(".submodules-pinned-header");
      if (subHeader && !target.closest("button, a, input, [data-action='submodulePush'], [data-action='submoduleSync']")) {
        const card = subHeader.closest(".submodules-pinned");
        if (!card) return;
        const wasCollapsed = card.getAttribute("data-collapsed") === "true";
        const next = !wasCollapsed;
        card.setAttribute("data-collapsed", String(next));
        const chev = card.querySelector(".submodules-pinned-chevron");
        if (chev) chev.textContent = next ? "▸" : "▾";
        subHeader.setAttribute("aria-expanded", next ? "false" : "true");
        const body = card.querySelector(".submodule-pinned-body");
        if (body instanceof HTMLElement) body.style.display = next ? "none" : "";
        vscode.postMessage({ command: "toggleSubmodules", collapsed: next });
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
        // Section-level actions (no entry ref required). These buttons
        // live in section banners or other detail panels that don't
        // belong to a single entry row.
        if (action === "rerunPhase1") {
          const mode = target.getAttribute("data-mode") || "current";
          vscode.postMessage({ command: "rerunPhase1", mode });
          return;
        }
        if (action === "openLedger") {
          vscode.postMessage({ command: "openLedger" });
          return;
        }
        if (action === "dismissBanner") {
          const kind = target.getAttribute("data-banner-kind");
          if (!kind) return;
          // Optimistic UI: hide the banner and show the "?" icon
          // immediately, then notify the host to persist. The host's
          // re-render confirms the same state.
          const card = document.querySelector('section[data-section="' + kind + '"]');
          if (card) {
            const banner = card.querySelector('.banner.education[data-banner-kind="' + kind + '"]');
            if (banner) banner.classList.add("hidden");
            const header = card.querySelector("header h2");
            if (header && !header.querySelector(".banner-question")) {
              const q = document.createElement("button");
              q.className = "banner-question";
              q.setAttribute("data-action", "showBanner");
              q.title = "Show lifecycle";
              q.textContent = "?";
              header.appendChild(q);
            }
          }
          vscode.postMessage({ command: "dismissBanner", kind });
          return;
        }
        if (action === "showBanner") {
          // Transient — pure client toggle, no host roundtrip. Rerender
          // hides it again, by design (documented behavior).
          const card = target.closest('[data-section]');
          if (!card) return;
          const banner = card.querySelector('.banner.education');
          if (banner) banner.classList.remove("hidden");
          target.remove();
          return;
        }
        if (action === "verdictPick") {
          // Open the inline form for this verdict. "applied" never gets
          // here — its button is wired directly to verdictSubmit (no
          // form). This branch only handles needsForm verdicts.
          const verdict = target.getAttribute("data-verdict");
          const row = target.closest(".entry");
          if (!row || !verdict) return;
          showVerdictForm(row, verdict);
          return;
        }
        if (action === "verdictCancel") {
          const row = target.closest(".entry");
          if (row) hideVerdictForm(row);
          return;
        }
        if (action === "submoduleSync") {
          const subPath = target.getAttribute("data-sub-path") || "";
          const parentBranch = target.getAttribute("data-parent-branch") || "";
          if (!subPath || !parentBranch) return;
          vscode.postMessage({ command: "submoduleSync", subPath, parentBranch });
          return;
        }
        if (action === "submodulePush") {
          vscode.postMessage({ command: "submodulePush" });
          return;
        }
        if (action === "copyAuditPrompt") {
          // Audit findings ship the prompt as a base64-encoded data attribute
          // rather than going through the entry registry — the registry only
          // tracks queue entries, but findings are about patterns, not entries.
          const b64 = target.getAttribute("data-prompt-b64") || "";
          if (!b64) return;
          let prompt = "";
          try { prompt = atob(b64); } catch { return; }
          vscode.postMessage({ command: "copyAuditPrompt", prompt });
          return;
        }
        if (action === "verdictSubmit") {
          const row = target.closest(".entry");
          if (!row) return;
          const ref = refRefFromEl(row);
          // Two paths: (a) direct button (e.g. "Apply") on the verdict-actions-row
          // — verdict comes from data-verdict, no form to read. (b) submit
          // button inside the form — verdict comes from data-active-verdict.
          const form = target.closest(".verdict-form");
          let verdict = target.getAttribute("data-verdict");
          let draft = {};
          if (form) {
            const active = form.getAttribute("data-active-verdict");
            if (!active) return;
            verdict = active;
            draft = collectVerdictDraft(form);
          }
          if (!verdict) return;
          vscode.postMessage({ command: "verdictSubmit", ref, verdict, draft });
          if (form) hideVerdictForm(row);
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

      // Accordion: clicking a section header toggles which card is the
      // open one. Only one section is open at a time; clicking the
      // already-open header is a no-op (collapsing all would leave the
      // sidebar showing nothing useful). Headers inside .entry-summary,
      // verdict forms, or other interactive children are ignored — we
      // only act on the bare header bar of a card.
      const sectionHeader = target.closest(".section-card > header");
      if (sectionHeader) {
        const card = sectionHeader.closest(".section-card");
        // Pending cards use data-section; Activity groups use
        // data-activity-group. Either signals "this is an accordion card".
        const sectionKey = card && card.getAttribute("data-section");
        const activityKey = card && card.getAttribute("data-activity-group");
        const key = sectionKey || activityKey;
        if (!key) return;
        // If the user clicked something inside the header (a button,
        // chip, etc.), let that handle it instead of switching the
        // accordion underneath them.
        if (target.closest("button, a, input, .chip, [data-action]")) return;
        if (card.getAttribute("data-open") === "true") return;
        // Scope the close-others sweep to the same accordion group —
        // Activity groups and Pending sections are visually exclusive
        // anyway (different viewMode), but scoping by attribute prevents
        // a cross-tab race if both are ever rendered together.
        const scopeAttr = sectionKey ? "data-section" : "data-activity-group";
        document
          .querySelectorAll('.section-card[' + scopeAttr + '][data-open="true"]')
          .forEach((el) => el.removeAttribute("data-open"));
        card.setAttribute("data-open", "true");
        // Persist Pending state only — Activity's open card is ephemeral
        // (it resets to first-group on each refresh, matching how Activity
        // group-by works).
        if (sectionKey) {
          vscode.postMessage({ command: "setOpenSection", section: sectionKey });
        }
        return;
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

function viewModeTab(value: "pending" | "activity", label: string, current: string): string {
  const on = current === value;
  return `<button class="view-mode-tab ${on ? "on" : ""}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function activityGroupByChip(
  value: "date" | "queueKey" | "eventType",
  label: string,
  current: string
): string {
  const on = current === value;
  return `<span class="chip activity-group-by-chip ${on ? "on" : ""}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</span>`;
}

function renderActivityFilterBar(filter: DashboardFilter): string {
  return `<div class="filter-bar activity-filter-bar">
    <div class="group-by" data-group="activityGroupBy">
      <span class="group-by-label">Group by</span>
      ${activityGroupByChip("date", "Date", filter.activityGroupBy)}
      ${activityGroupByChip("queueKey", "Queue key", filter.activityGroupBy)}
      ${activityGroupByChip("eventType", "Event type", filter.activityGroupBy)}
    </div>
    <label class="activity-toggle">
      <input type="checkbox" id="show-system-events" ${filter.showSystemEvents ? "checked" : ""} />
      Show system events
    </label>
  </div>`;
}

// ── Pipeline strip ──────────────────────────────────────────────────────────

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

// ── Grouped body ────────────────────────────────────────────────────────────

// Compute section item counts for ordering. Submodules is pinned to the
// top (per UX request — git state is the orient-yourself signal). The
// rest fall by descending count so non-empty sections gather at the top
// and empties drop to the bottom. Ties keep their canonical order so the
// view doesn't shuffle on every refresh.
interface SectionRender {
  key: string;
  count: number;
  pinned: boolean;
  html: string;
}

function buildSectionsForOrder(
  status: StatusSummary,
  index: Map<string, IndexedEntry>,
  kbRoot: string | null,
  dismissedBanners: ReadonlySet<SectionKind>
): SectionRender[] {
  const conformCount =
    (status.conformPending.current?.requested.length ?? 0) +
    (status.conformPending.aspirational?.requested.length ?? 0);
  // Submodules is rendered OUTSIDE the accordion (renderSubmodulesPinned),
  // so it deliberately doesn't appear in this list.

  // Canonical order (used as tiebreaker after count-based sort).
  const sections: SectionRender[] = [
    {
      key: "code-drift",
      count: status.codeDrift.entries.length,
      pinned: false,
      html: renderCodeDriftCard(status, index, kbRoot, dismissedBanners),
    },
    {
      key: "kb-drift",
      count: status.kbDrift.entries.length,
      pinned: false,
      html: renderKbDriftCard(status, index, kbRoot, dismissedBanners),
    },
    {
      key: "standards-drift",
      count: status.standardsDrift.entries.length,
      pinned: false,
      html: renderStandardsDriftCard(status, index, kbRoot, dismissedBanners),
    },
    {
      key: "conform-pending",
      count: conformCount,
      pinned: false,
      html: renderConformCard(status, index, dismissedBanners),
    },
    {
      key: "promotions",
      count: status.promotions.length,
      pinned: false,
      html: renderPromotionsCard(status, index, dismissedBanners),
    },
    {
      key: "lint",
      count: status.lint.violations.length,
      pinned: false,
      html: renderLintCard(status, index, dismissedBanners),
    },
  ].filter((s) => s.html !== "");
  return sections;
}

function orderSections(sections: SectionRender[]): SectionRender[] {
  // Preserve canonical order as stable tiebreaker.
  const canonical = new Map(sections.map((s, i) => [s.key, i]));
  return [...sections].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aHas = a.count > 0;
    const bHas = b.count > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return (canonical.get(a.key) ?? 0) - (canonical.get(b.key) ?? 0);
  });
}

// Pick which section to open in the accordion. Honor the user's stored
// choice if it still has a card; otherwise default to the first non-empty
// section after ordering, falling back to the first card overall.
function pickOpenSection(
  ordered: SectionRender[],
  preferred: string | undefined
): string | null {
  if (ordered.length === 0) return null;
  if (preferred && ordered.some((s) => s.key === preferred)) return preferred;
  const firstWithItems = ordered.find((s) => s.count > 0);
  return (firstWithItems ?? ordered[0]).key;
}

// Decorate the chosen section's <section> root with data-open="true" so
// the accordion CSS can size it. Operates on raw HTML strings — cheap
// for our card count and avoids parsing.
function markOpenSection(html: string, key: string, open: string | null): string {
  if (!open || key !== open) return html;
  return html.replace(
    /<section\s+class="section-card"\s+data-section="([^"]+)"/,
    (_match, sec) => `<section class="section-card" data-section="${sec}" data-open="true"`
  );
}

function renderGroupedBody(
  status: StatusSummary,
  filter: DashboardFilter,
  index: Map<string, IndexedEntry>,
  kbRoot: string | null,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  if (filter.groupBy === "section") {
    const sections = buildSectionsForOrder(status, index, kbRoot, dismissedBanners);
    const ordered = orderSections(sections);
    const open = pickOpenSection(ordered, filter.openSection);
    return ordered.map((s) => markOpenSection(s.html, s.key, open)).join("");
  }
  const handles = buildEntryHandles(status);
  const groups = groupEntries(handles, filter.groupBy);
  return groups.map((g) => renderGenericGroupCard(g, status, index, kbRoot)).join("");
}

// ── Activity (drift-log timeline) ───────────────────────────────────────────

function renderActivityBody(status: StatusSummary, filter: DashboardFilter): string {
  let events = status.driftLogEvents;
  if (!filter.showSystemEvents) {
    events = events.filter((e) => !e.isSystem);
  }
  if (events.length === 0) {
    return `<section class="section-card" data-section="activity">
      <header><h2>Activity <span class="count">0</span></h2></header>
      <div class="body">
        <div class="placeholder">No drift-log events in the current + previous month.</div>
      </div>
    </section>`;
  }

  // Group accumulator. Group order matters: date / queueKey lexicographic
  // (newest first for dates, alpha for keys), eventType alpha.
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    let key: string;
    if (filter.activityGroupBy === "queueKey") key = e.queueKey || e.kbTarget || e.kbFile || "(unattributed)";
    else if (filter.activityGroupBy === "eventType") key = activityEventLabel(e.eventType);
    else key = e.date;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) =>
    filter.activityGroupBy === "date"
      ? a < b
        ? 1
        : a > b
        ? -1
        : 0 // newest dates first
      : a.localeCompare(b)
  );

  // Accordion behavior mirrors the Pending view: one activity group open
  // at a time so its body gets the full available height. With multiple
  // groups all open simultaneously in sidebar mode, flex-shrink chopped
  // each body so entry detail panels showed only partially.
  const groupCards = sortedKeys
    .map((k, i) => {
      const arr = groups.get(k)!;
      const rows = arr.map((e) => activityRow(e)).join("");
      const openAttr = i === 0 ? ' data-open="true"' : "";
      return `<section class="section-card activity-group" data-activity-group="${escapeAttr(k)}"${openAttr}>
        <header><h2>${escapeHtml(k)} <span class="count">${arr.length}</span></h2></header>
        <div class="body">${rows}</div>
      </section>`;
    })
    .join("");

  return groupCards;
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
  if (t === "conformed-applied") return "event-applied";
  if (t === "conformed-exempted" || t === "dismissed-conform" || t === "drift-dismissed")
    return "event-exempted";
  if (t === "conformed-promoted" || t === "closed-promotion") return "event-promoted";
  if (t === "drift-resolved") return "event-applied";
  if (t === "drift-acknowledged") return "event-acknowledged";
  return "event-other";
}

function activityRow(e: import("@instrumentality/shared").DriftLogEvent): string {
  const id = `${e.date}:${e.queueKey ?? e.kbTarget ?? e.kbFile ?? ""}:${e.eventType}`;
  const badgeClass = activityBadgeClass(e.eventType, e.isSystem);
  const subject = e.queueKey ?? e.kbTarget ?? e.kbFile ?? "(unattributed)";
  const reasonShort = e.reason ? ` — ${escapeHtml(e.reason.slice(0, 100))}${e.reason.length > 100 ? "…" : ""}` : "";
  const summary = `<div class="activity-summary">
    <span class="badge ${badgeClass}">${escapeHtml(activityEventLabel(e.eventType))}</span>
    <span class="activity-subject">${escapeHtml(subject)}</span>
    <span class="activity-date">${escapeHtml(e.date)}</span>
  </div>
  <div class="activity-line">${reasonShort || "<em>(no reason recorded)</em>"}</div>`;
  const detail = activityDetail(e);
  // Reuse .entry shell so existing click-to-expand JS works. No verdict
  // buttons / verdicts on activity rows — they're historical, not actionable.
  return `<div class="entry activity-entry"
    data-entry-section="activity"
    data-entry-id="${escapeAttr(id)}"
    data-entry-sev=""
    data-entry-text="${escapeAttr(`${subject} ${e.eventType} ${e.reason ?? ""}`)}">
    <div class="entry-summary">${summary}</div>
    <div class="entry-detail">${detail}</div>
  </div>`;
}

function activityDetail(e: import("@instrumentality/shared").DriftLogEvent): string {
  const parts: string[] = [];
  parts.push(`<div><strong>Event:</strong> <code>${escapeHtml(e.eventType)}</code></div>`);
  parts.push(`<div><strong>Date:</strong> ${escapeHtml(e.date)}</div>`);
  if (e.queueKey) parts.push(`<div><strong>Queue key:</strong> <code>${escapeHtml(e.queueKey)}</code></div>`);
  if (e.kbTarget) parts.push(`<div><strong>KB target:</strong> <code>${escapeHtml(e.kbTarget)}</code></div>`);
  if (e.kbFile) parts.push(`<div><strong>KB file:</strong> <code>${escapeHtml(e.kbFile)}</code></div>`);
  if (e.files && e.files.length > 0) {
    const lis = e.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("");
    parts.push(`<div><strong>Files:</strong><ul>${lis}</ul></div>`);
  }
  if (e.originatingFiles && e.originatingFiles.length > 0) {
    const lis = e.originatingFiles.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("");
    parts.push(`<div><strong>Originating files:</strong><ul>${lis}</ul></div>`);
  }
  if (e.reason) parts.push(`<div><strong>Reason:</strong> ${escapeHtml(e.reason)}</div>`);
  if (e.note) parts.push(`<div><strong>Note:</strong> ${escapeHtml(e.note)}</div>`);
  return `<div class="detail-meta">${parts.join("")}</div>`;
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
      const e = status.codeDrift.entries[i];
      return codeDriftRow(e, i, kbRoot, e.source === "working-tree");
    }
    case "kb-drift": {
      const i = status.kbDrift.entries.findIndex((e) => stableEntryId(e.kbFile, status.kbDrift.entries.indexOf(e)) === h.id);
      if (i < 0) return "";
      const e = status.kbDrift.entries[i];
      return kbDriftRow(e, i, kbRoot, e.source === "working-tree");
    }
    case "standards-drift": {
      const i = status.standardsDrift.entries.findIndex((e) => stableEntryId(e.queueKey, status.standardsDrift.entries.indexOf(e)) === h.id);
      if (i < 0) return "";
      const e = status.standardsDrift.entries[i];
      return standardsDriftRow(e, i, kbRoot, e.source === "working-tree");
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
    case "mapping-diagnostics":
      // Audit findings render as a panel-level card via renderPatternAuditCard,
      // not as individual entries in the unified handle stream. Return empty so
      // grouping queries don't break.
      return "";
  }
}

// ── Entry shell ─────────────────────────────────────────────────────────────

function entryShell(
  ref: EntryRef,
  sev: string | null,
  searchableText: string,
  summaryHtml: string,
  detailMetaHtml: string,
  hasStandard: boolean,
  hasStandardRule: boolean,
  diffableFiles: DiffableFile[],
  modeAttr?: string,
  verdictFiles?: string[],
  isUncommitted: boolean = false,
  openOverride?: { label: string; action: string }
): string {
  const sevAttr = sev ?? "";
  const modeHtml = modeAttr ? ` data-entry-mode="${escapeAttr(modeAttr)}"` : "";
  const bucketAttr = isUncommitted ? ` data-entry-bucket="uncommitted"` : "";
  const openButton = openOverride
    ? `<button class="btn btn-tiny" data-action="${escapeAttr(openOverride.action)}">${escapeHtml(openOverride.label)}</button>`
    : `<button class="btn btn-tiny" data-action="open">Open Source</button>`;
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
  // Verdict buttons resolve queue entries via downstream MCP tools. Those
  // tools target the **published** .md queue, which uncommitted-preview
  // entries aren't part of yet — hide the verdict row to avoid a confusing
  // "applied to nothing" code path. Send/Copy/Open are still useful (author
  // can ask the agent to help finish the change before publishing).
  const verdictDefs = isUncommitted ? [] : VERDICTS_BY_SECTION[ref.section] ?? [];
  const verdictBtns = verdictDefs
    .map((v) => {
      // applied → direct submit (no form). Others open the inline form.
      const action = v.needsForm ? "verdictPick" : "verdictSubmit";
      return `<button class="btn btn-tiny verdict-btn" data-action="${action}" data-verdict="${escapeAttr(
        v.verdict
      )}">${escapeHtml(v.label)}</button>`;
    })
    .join("");
  const verdictForm =
    verdictDefs.some((v) => v.needsForm)
      ? renderVerdictForm(verdictFiles ?? [])
      : "";
  return `<div class="entry"
    data-entry-section="${escapeAttr(ref.section)}"
    data-entry-id="${escapeAttr(ref.id)}"
    data-entry-sev="${escapeAttr(sevAttr)}"
    data-entry-text="${escapeAttr(searchableText)}"${modeHtml}${bucketAttr}>
    <div class="entry-summary">${summaryHtml}</div>
    <div class="entry-detail">
      ${detailMetaHtml}
      <div class="entry-actions">
        <button class="btn btn-primary btn-tiny" data-action="send">${escapeHtml(sendLabel)}</button>
        <button class="btn btn-tiny" data-action="copy">${escapeHtml(copyLabel)}</button>
        ${openButton}
        ${standardBtns}
      </div>
      ${verdictBtns ? `<div class="verdict-actions-row">${verdictBtns}</div>` : ""}
      ${verdictForm}
      ${diffSection}
      <details class="prompt-disclosure">
        <summary>Show prompt</summary>
        <pre class="entry-detail-prompt"></pre>
      </details>
    </div>
  </div>`;
}

// One inline form per entry. All possible fields are rendered up front;
// data-for-field attributes let the click handler show/hide based on the
// active verdict. Form state is ephemeral — webview JS only; rerender
// resets it (documented behavior, not a bug).
function renderVerdictForm(files: string[]): string {
  const fileItems = files
    .map(
      (p) =>
        `<li><label><input type="checkbox" name="vfile" value="${escapeAttr(
          p
        )}"> <code>${escapeHtml(p)}</code></label></li>`
    )
    .join("");
  return `<div class="verdict-form hidden" data-active-verdict="">
    <div class="verdict-form-title">
      <span class="verdict-active-label"></span>
    </div>
    <div class="verdict-field" data-for-field="filePaths">
      <label class="verdict-field-label" data-files-label></label>
      <ul class="verdict-file-list">${fileItems}</ul>
    </div>
    <div class="verdict-field" data-for-field="reason">
      <label>Reason <span class="verdict-required-marker">(required)</span></label>
      <textarea class="verdict-reason" rows="3" placeholder="Why?"></textarea>
    </div>
    <div class="verdict-field" data-for-field="note">
      <label>Note <span class="verdict-optional-marker">(optional)</span></label>
      <textarea class="verdict-note" rows="2" placeholder="Optional context for the senior reviewer"></textarea>
    </div>
    <div class="verdict-form-actions">
      <button class="btn btn-primary btn-tiny verdict-submit" data-action="verdictSubmit" disabled>Send to agent</button>
      <button class="btn btn-tiny" data-action="verdictCancel">Cancel</button>
    </div>
  </div>`;
}

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

// ── Section cards ───────────────────────────────────────────────────────────

function sectionShell(
  kind: SectionKind,
  title: string,
  count: number,
  badgeHtml: string,
  bodyHtml: string,
  hint?: string,
  bannerHtml?: string,
  educationDismissed: boolean = false
): string {
  const hintHtml = hint ? `<div class="group-hint">${escapeHtml(hint)}</div>` : "";
  const banner = bannerHtml ?? "";
  const eduBanner = educationBannerHtml(kind, educationDismissed);
  const helpIcon = educationDismissed
    ? `<button class="banner-question" data-action="showBanner" title="Show ${escapeAttr(SECTION_GUIDE[kind].label)} lifecycle">?</button>`
    : "";
  return `<section class="section-card" data-section="${escapeAttr(kind)}">
    <header><h2>${escapeHtml(title)} <span class="count">${count}</span> ${badgeHtml} ${helpIcon}</h2>${hintHtml}</header>
    ${eduBanner}
    ${banner}
    <div class="body">
      ${bodyHtml}
      <div class="visible-empty placeholder hidden">No entries match the current filter</div>
    </div>
  </section>`;
}

// Education banner: visible on first run, hidden after dismiss. The user
// can re-show transiently via the "?" icon (handled in webview JS — no
// roundtrip; rerender hides it again, by design).
function educationBannerHtml(kind: SectionKind, dismissed: boolean): string {
  const guide = SECTION_GUIDE[kind];
  const hiddenClass = dismissed ? " hidden" : "";
  return `<div class="banner education${hiddenClass}" data-banner-kind="${escapeAttr(kind)}">
    <div class="banner-content">
      <div class="banner-explainer">
        <strong>${escapeHtml(guide.label)}</strong> — ${escapeHtml(guide.what)}
        <em>${escapeHtml(guide.todo)}</em>
      </div>
      <pre class="banner-diagram">${escapeHtml(guide.lifecycleDiagram)}</pre>
    </div>
    <button class="btn btn-tiny" data-action="dismissBanner" data-banner-kind="${escapeAttr(kind)}">Got it</button>
  </div>`;
}

/**
 * Render a section body split into "Uncommitted preview" and "Published"
 * buckets. Each visible bucket gets a sub-header showing label + count + the
 * per-section hint (when uncommitted). When only one bucket has entries, the
 * sub-header is omitted to keep the card visually quiet.
 */
function renderBucketedBody<T extends { source?: "committed" | "working-tree" }>(
  entries: readonly T[],
  rowFn: (entry: T, index: number, bucket: "uncommitted" | "published") => string,
  emptyMessage: string,
  sectionKind: SectionKind
): string {
  if (entries.length === 0) {
    return `<div class="placeholder">${escapeHtml(emptyMessage)}</div>`;
  }
  const { uncommitted, published } = splitBySource(entries);
  // When everything sits in one bucket, render rows directly — keep the
  // card looking like it always has.
  if (uncommitted.length === 0) {
    return published.map((e, i) => rowFn(e, i, "published")).join("");
  }
  if (published.length === 0) {
    const hint = SECTION_GUIDE[sectionKind].uncommittedHint;
    const header = renderBucketHeader(UNCOMMITTED_LABEL, uncommitted.length, hint);
    return header + uncommitted.map((e, i) => rowFn(e, i, "uncommitted")).join("");
  }
  // Both buckets present — render uncommitted first (most actionable for
  // the author) then published.
  const uncommittedHeader = renderBucketHeader(
    UNCOMMITTED_LABEL,
    uncommitted.length,
    SECTION_GUIDE[sectionKind].uncommittedHint
  );
  const publishedHeader = renderBucketHeader(PUBLISHED_LABEL, published.length);
  return (
    uncommittedHeader +
    uncommitted.map((e, i) => rowFn(e, i, "uncommitted")).join("") +
    publishedHeader +
    published.map((e, i) => rowFn(e, i, "published")).join("")
  );
}

function renderBucketHeader(label: string, count: number, hint?: string): string {
  const hintHtml = hint ? `<div class="group-hint">${escapeHtml(hint)}</div>` : "";
  return `<div class="bucket-header"><strong>${escapeHtml(label)}</strong> <span class="count">${count}</span>${hintHtml}</div>`;
}

function renderCodeDriftCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  kbRoot: string | null,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const entries = status.codeDrift.entries;
  const baseline = status.codeDrift.baseline.sha;
  const baselineHtml = baseline
    ? `<span class="badge" title="baseline">${escapeHtml(baseline.slice(0, 7))}</span>`
    : "";
  const body = renderBucketedBody(
    entries,
    (e, i, bucket) => codeDriftRow(e, i, kbRoot, bucket === "uncommitted"),
    "No code drift",
    "code-drift"
  );
  return sectionShell(
    "code-drift",
    SECTION_GUIDE["code-drift"].label + "s",
    entries.length,
    baselineHtml,
    body,
    SECTION_GUIDE["code-drift"].what,
    undefined,
    dismissedBanners.has("code-drift")
  );
}

function codeDriftRow(e: CodeDriftEntry, i: number, kbRoot: string | null, isUncommitted: boolean = false): string {
  const id = stableEntryId(e.kbTarget, i);
  const ref = { section: "code-drift" as SectionKind, id };
  const filesPreview = e.codeFiles.slice(0, 3).map((f) => path.basename(f.path)).join(", ");
  const more = e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : "";
  const sharedBadge = e.hasShared ? `<span class="badge shared">shared</span>` : "";
  const previewBadge = isUncommitted ? `<span class="badge preview-mode" title="Uncommitted preview — not yet published">preview</span>` : "";
  const targetMissing = kbRoot
    ? !fs.existsSync(path.join(kbRoot, "knowledge", e.kbTarget))
    : false;
  const missingBadge = targetMissing
    ? `<span class="badge sev-warn" title="Target KB file does not exist — click Scaffold to create it">missing</span>`
    : "";
  const summary = `
    <div class="title">${escapeHtml(e.kbTarget)} ${sharedBadge} ${previewBadge} ${missingBadge}</div>
    <div class="meta">${e.codeFiles.length} file(s) — ${escapeHtml(filesPreview + more)}</div>`;
  const sev = targetMissing || e.hasShared ? "warn" : "info";
  const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
  const diffs = collectDiffableFromCodeDrift(e, (p) => resolveAbsFor(kbRoot, p));
  const openOverride = targetMissing
    ? { label: "Scaffold KB doc", action: "scaffold" }
    : undefined;
  return entryShell(ref, sev, text, summary, buildCodeDriftDetail(e, targetMissing), false, false, diffs, undefined, undefined, isUncommitted, openOverride);
}

function renderKbDriftCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  kbRoot: string | null,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const entries = status.kbDrift.entries;
  const body = renderBucketedBody(
    entries,
    (e, i, bucket) => kbDriftRow(e, i, kbRoot, bucket === "uncommitted"),
    "No KB drift",
    "kb-drift"
  );
  return sectionShell(
    "kb-drift",
    SECTION_GUIDE["kb-drift"].label + "s",
    entries.length,
    "",
    body,
    SECTION_GUIDE["kb-drift"].what,
    undefined,
    dismissedBanners.has("kb-drift")
  );
}

function kbDriftRow(e: KbDriftEntry, i: number, kbRoot: string | null, isUncommitted: boolean = false): string {
  const id = stableEntryId(e.kbFile, i);
  const ref = { section: "kb-drift" as SectionKind, id };
  const previewBadge = isUncommitted ? `<span class="badge preview-mode" title="Uncommitted preview — not yet published">preview</span>` : "";
  const summary = `
    <div class="title">${escapeHtml(e.kbFile)} ${e.unmapped ? `<span class="badge sev-warn">unmapped</span>` : ""} ${previewBadge}</div>
    <div class="meta">${e.codeAreas.length} code area(s)${e.refCount && e.refCount.count > 0 ? ` · ${e.refCount.count} reference(s)` : ""}</div>`;
  const sev = e.unmapped ? "warn" : "info";
  const text = e.kbFile + " " + e.codeAreas.join(" ");
  const diffs = collectDiffableFromKbDrift(e, (p) => resolveAbsFor(kbRoot, p));
  return entryShell(ref, sev, text, summary, buildKbDriftDetail(e), false, false, diffs, undefined, undefined, isUncommitted);
}

function renderStandardsDriftCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  kbRoot: string | null,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const entries = status.standardsDrift.entries;
  const body = renderBucketedBody(
    entries,
    (e, i, bucket) => standardsDriftRow(e, i, kbRoot, bucket === "uncommitted"),
    "No standards drift",
    "standards-drift"
  );
  return sectionShell(
    "standards-drift",
    SECTION_GUIDE["standards-drift"].label,
    entries.length,
    "",
    body,
    SECTION_GUIDE["standards-drift"].what,
    undefined,
    dismissedBanners.has("standards-drift")
  );
}

function standardsDriftRow(e: StandardsDriftEntry, i: number, kbRoot: string | null, isUncommitted: boolean = false): string {
  // Disambiguate current vs aspirational entries that share a queueKey:
  // each mode lives in its own queue file, but a (file, rule) pair can
  // appear in both at once. Folding mode into the id keeps them unique.
  const id = stableEntryId(`${e.mode}:${e.queueKey}`, i);
  const ref = { section: "standards-drift" as SectionKind, id };
  const sev = severityLabel(e.severity);
  const sevBadge = sev ? `<span class="badge ${severityClass(sev)}">${sev}</span>` : "";
  const advisoryBadge =
    e.mode === "aspirational"
      ? `<span class="badge advisory-mode" title="Advisory backlog — not PR-blocking">advisory</span>`
      : "";
  const previewBadge = isUncommitted ? `<span class="badge preview-mode" title="Uncommitted preview — not yet published">preview</span>` : "";
  const fileCount = Object.values(e.filesByParty).reduce((sum, files) => sum + files.length, 0);
  const ruleHint = e.resolvedRule?.title ? ` · ${escapeHtml(e.resolvedRule.title)}` : "";
  const summary = `
    <div class="title">${escapeHtml(e.queueKey)} ${sevBadge} ${advisoryBadge} ${previewBadge}</div>
    <div class="meta">${escapeHtml(e.standardId ?? "?")} ${e.standardKind ? `(${escapeHtml(e.standardKind)})` : ""} · ${fileCount} file(s)${ruleHint}</div>`;
  const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "") + " " + (e.resolvedRule?.title ?? "");
  const hasRule = !!(e.standardId && e.ruleId);
  const diffs = collectDiffableFromStandardsDrift(e, (p) => resolveAbsFor(kbRoot, p));
  // Flatten files across parties for the verdict form. Order preserves the
  // queue-file order so what the user sees in the form matches the entry
  // detail above.
  const verdictFiles: string[] = [];
  for (const arr of Object.values(e.filesByParty)) {
    for (const f of arr) verdictFiles.push(f.path);
  }
  return entryShell(
    ref,
    sev,
    text,
    summary,
    buildStandardsDriftDetail(e),
    !!e.standardId,
    hasRule,
    diffs,
    e.mode,
    verdictFiles,
    isUncommitted
  );
}

function renderConformCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const c = status.conformPending.current;
  const a = status.conformPending.aspirational;
  const total = (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
  const stale = c?.staleAgainstHead || a?.staleAgainstHead;
  const badge = stale ? `<span class="badge sev-warn">baseline stale</span>` : "";
  const rows: string[] = [];
  for (const p of [c, a]) {
    if (!p || p.requested.length === 0) continue;
    p.requested.forEach((r, i) => rows.push(conformRow(p, r, i)));
  }
  const body = rows.length === 0
    ? `<div class="placeholder">No conform pending</div>`
    : rows.join("");
  // Stale-baseline banner: more prominent than the header chip; carries a
  // re-run button. The button posts `rerunPhase1`; the host generates a
  // fresh Phase-1 detect prompt via shared/prompts and ships through the
  // existing sendPrompt backend (no direct MCP calls from the extension).
  let bannerHtml: string | undefined;
  if (stale) {
    const staleMode = c?.staleAgainstHead ? "current" : "aspirational";
    const staleSha = c?.staleAgainstHead
      ? c.head_sha_short
      : a?.head_sha_short ?? "";
    const headSha = status.currentHeadShort ?? "(unknown)";
    bannerHtml = `<div class="banner stale">
      <div class="banner-text">
        <strong>Pending session is stale.</strong>
        Baseline <code>${escapeHtml(staleSha)}</code> · HEAD <code>${escapeHtml(headSha)}</code>.
        Re-run Phase 1 before submitting judgments.
      </div>
      <button class="btn btn-tiny" data-action="rerunPhase1" data-mode="${escapeAttr(staleMode)}">Re-run Phase 1</button>
    </div>`;
  }
  return sectionShell(
    "conform-pending",
    SECTION_GUIDE["conform-pending"].label,
    total,
    badge,
    body,
    SECTION_GUIDE["conform-pending"].what,
    bannerHtml,
    dismissedBanners.has("conform-pending")
  );
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

function renderPromotionsCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const entries = status.promotions;
  const body = entries.length === 0
    ? `<div class="placeholder">No pending promotions</div>`
    : entries.map((e, i) => promotionRow(e, i)).join("");
  return sectionShell(
    "promotions",
    SECTION_GUIDE.promotions.label,
    entries.length,
    "",
    body,
    SECTION_GUIDE.promotions.what,
    undefined,
    dismissedBanners.has("promotions")
  );
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
  const verdictFiles = e.files.map((f) => f.path);
  return entryShell(
    ref,
    sev,
    text,
    summary,
    buildPromotionDetail(e),
    !!e.standardId,
    hasRule,
    [],
    undefined,
    verdictFiles
  );
}

function renderLintCard(
  status: StatusSummary,
  _idx: Map<string, IndexedEntry>,
  dismissedBanners: ReadonlySet<SectionKind>
): string {
  const v = status.lint.violations;
  const badge = !status.lint.ran ? `<span class="badge sev-info">unavailable</span>` : "";
  // F16: when the lint subprocess didn't run, point the user at the
  // `instrumentality.lint.command` override. The extension bundles a
  // standalone lint script and tries that automatically; this hint covers
  // the case where the bundled script can't spawn (no node on PATH, etc).
  const body = !status.lint.ran
    ? `<div class="placeholder">${escapeHtml(status.lint.error || "Lint subprocess unavailable in this workspace.")} Configure <code>instrumentality.lint.command</code> in settings to point at your own lint binary if the bundled standalone script can't run.</div>`
    : v.length === 0
    ? `<div class="placeholder">No lint issues</div>`
    : v.map((violation, i) => lintRow(violation, i)).join("");
  return sectionShell(
    "lint",
    SECTION_GUIDE.lint.label,
    v.length,
    badge,
    body,
    SECTION_GUIDE.lint.what,
    undefined,
    dismissedBanners.has("lint")
  );
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

// ── Pattern audit card ──────────────────────────────────────────────────────
//
// Panel-level "Mapping diagnostics" card. Surfaces findings from
// knowledge/_mcp/lib/pattern-audit.js about code_path_patterns vs current
// filesystem state. Only renders when there are findings AND beyond the
// "everything is unmapped" case (which is already obvious from empty queues).

function renderPatternAuditCard(status: StatusSummary): string {
  const audit = status.patternAudit;
  if (!audit || !audit.findings || audit.findings.length === 0) return "";

  // Suppress the card when the ONLY finding is "unmapped_kb_group" for a fresh
  // project — already obvious from the empty queues. Render whenever there's
  // any non-unmapped finding, or any unmapped finding alongside other signal.
  const hasActionable = audit.findings.some((f) => f.type !== "unmapped_kb_group");
  if (!hasActionable && audit.findings.length === 0) return "";

  const byType = new Map<string, number>();
  for (const f of audit.findings) byType.set(f.type, (byType.get(f.type) || 0) + 1);
  const summaryChips = [...byType.entries()]
    .map(([t, n]) => `<span class="badge sev-info">${escapeHtml(t)}: ${n}</span>`)
    .join(" ");

  const rows = audit.findings
    .map((f, i) => patternAuditFindingRow(f, i))
    .join("");

  return `<section class="section-card" data-section="mapping-diagnostics">
    <header><h2>Mapping diagnostics <span class="count">${audit.findings.length}</span></h2>
      <div class="hint">code_path_patterns vs current filesystem — surfaces orphan paths, ghost targets, convention violations, and unmapped KB folders.</div>
    </header>
    <div class="body">
      <div class="audit-summary">${summaryChips}</div>
      ${rows}
    </div>
  </section>`;
}

function patternAuditFindingRow(f: NonNullable<StatusSummary["patternAudit"]>["findings"][number], i: number): string {
  let title = "";
  let body = "";
  switch (f.type) {
    case "orphan_pattern":
      title = `Orphan pattern: <code>${escapeHtml(formatKbTarget(f.kb_target))}</code>${f.intent ? ` <span class="badge sev-info">intent: ${escapeHtml(f.intent)}</span>` : ""}${f.is_submodule_pattern ? ` <span class="badge sev-info">submodule</span>` : ""}`;
      body = `<div class="meta">paths match no source files:</div><ul>${f.paths.map(p => `<li><code>${escapeHtml(p)}</code></li>`).join("")}</ul>`;
      break;
    case "ghost_target":
      title = `Ghost target: <code>${escapeHtml(f.resolved_target)}</code>`;
      body = `<div class="meta">kb_target points at a KB file that does not exist. Either create the KB file or fix the pattern in <code>_rules.md</code>.</div>`;
      break;
    case "convention_violation":
      title = `Convention violation: <code>${escapeHtml(formatKbTarget(f.kb_target))}</code>`;
      body = `<div class="meta">intent <code>${escapeHtml(f.intent)}</code> conventionally targets <code>${escapeHtml(f.expected_folder)}</code> but this pattern points elsewhere.</div>`;
      break;
    case "unmapped_kb_group":
      title = `Unmapped KB folder: <code>${escapeHtml(f.folder)}</code> <span class="badge sev-info">${f.count} file(s)</span>`;
      body = `<div class="meta">No code_path_patterns entry targets these KB files. Code→KB drift detection is silent for them.</div><ul>${f.sample_files.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join("")}</ul>`;
      break;
    case "fanout_with_hardcoded":
      title = `Overbroad hardcoded pattern: <code>${escapeHtml(formatKbTarget(f.kb_target))}</code>`;
      body = `<div class="meta">${f.distinct_concepts} distinct file basenames map to this single KB file. Consider using a <code>{name}</code> template to fan out, or narrow the paths glob.</div>`;
      break;
  }
  const id = `audit-${i}`;
  const prompt = buildAuditFixPrompt(f);
  // Encode the prompt as base64 on a data attribute so it survives HTML
  // attribute escaping and any embedded backticks/quotes. The webview JS
  // decodes and dispatches a copyAuditPrompt action.
  const promptB64 = Buffer.from(prompt, "utf8").toString("base64");
  return `<div class="entry" data-audit-finding="${escapeAttr(f.type)}" data-entry-id="${escapeAttr(id)}">
    <div class="summary">${title}</div>
    <div class="detail">
      ${body}
      <div class="entry-actions">
        <button class="btn btn-tiny" data-action="copyAuditPrompt" data-prompt-b64="${promptB64}">Copy fix prompt</button>
      </div>
    </div>
  </div>`;
}

/**
 * Build a focused fix-prompt for an audit finding. Hardcoded (not loaded from
 * _templates/prompts/) to keep the extension independent of the MCP prompt
 * resolver — same trade-off the plan documented as a deliberate cut.
 */
function buildAuditFixPrompt(f: NonNullable<StatusSummary["patternAudit"]>["findings"][number]): string {
  const header = `The knowledge/_rules.md → code_path_patterns audit surfaced this finding:\n\n`;
  let body = "";
  switch (f.type) {
    case "orphan_pattern":
      body = `Type: orphan_pattern\n`
        + `Pattern: intent=${f.intent ?? "(none)"}, kb_target=${formatKbTarget(f.kb_target)}\n`
        + `Paths: ${JSON.stringify(f.paths)}\n`
        + `${f.is_submodule_pattern ? "Submodule pattern.\n" : ""}`
        + `\nThe paths globs above match zero files in the current repo. Decide:\n`
        + `1. If the code was moved/renamed, update the paths globs in knowledge/_rules.md to match the new location.\n`
        + `2. If the pattern is obsolete, remove it from knowledge/_rules.md.\n`
        + `3. If the paths are correct but the matching files were deleted, leave the pattern and acknowledge it's currently inactive.\n`
      break;
    case "ghost_target":
      body = `Type: ghost_target\n`
        + `Hardcoded kb_target: ${f.resolved_target}\n`
        + `\nThe pattern targets a KB file that does not exist. Either:\n`
        + `1. Create knowledge/${f.resolved_target} via kb_scaffold (if the concept is real but undocumented).\n`
        + `2. Fix the kb_target in knowledge/_rules.md (if this was a typo).\n`
        + `3. Remove the pattern entirely (if the concept is gone).\n`
      break;
    case "convention_violation":
      body = `Type: convention_violation\n`
        + `Pattern: intent=${f.intent}, kb_target=${formatKbTarget(f.kb_target)}\n`
        + `Expected folder for intent "${f.intent}": ${f.expected_folder}\n`
        + `\nThe convention table expects intent "${f.intent}" to target ${f.expected_folder}* but this pattern targets a different folder.\n`
        + `Either fix the kb_target in knowledge/_rules.md, or change the intent label if the mapping is intentional.\n`
      break;
    case "unmapped_kb_group":
      body = `Type: unmapped_kb_group\n`
        + `Folder: ${f.folder}\n`
        + `Count: ${f.count}\n`
        + `Sample files: ${JSON.stringify(f.sample_files)}\n`
        + `\nThese KB files are not targeted by any code_path_patterns entry — code→KB drift detection is silent for them.\n`
        + `Add a pattern to knowledge/_rules.md → code_path_patterns. Typical shape:\n`
        + `\n  - intent: <see knowledge/_mcp/presets/ for examples>\n`
        + `    kb_target: "${f.folder}{name}.md"\n`
        + `    paths:\n`
        + `      - "<glob covering the related source files>"\n`
        + `\nGrep the repo for files related to these KB documents and choose paths globs that catch them.\n`
      break;
    case "fanout_with_hardcoded":
      body = `Type: fanout_with_hardcoded\n`
        + `Pattern kb_target (hardcoded): ${formatKbTarget(f.kb_target)}\n`
        + `Distinct file basenames: ${f.distinct_concepts}\n`
        + `\nThis hardcoded kb_target catches ${f.distinct_concepts} distinct file basenames — one KB file is documenting many concepts.\n`
        + `Either switch the kb_target to a {name} template (so each concept gets its own KB file), or narrow the paths glob.\n`
      break;
  }
  return header + body;
}

// ── Submodules pinned card ─────────────────────────────────────────────────
//
// Submodules is rendered as a pinned status card ABOVE the accordion grid.
// It's structurally distinct because the git state it shows is an
// orient-yourself glance, not a work queue. The card collapses to a
// compact summary line (parent branch + colored alignment dots + the
// "would block" badge) so it stays useful even when minimized, but its
// open/close state is independent of the accordion's single-open rule.

function renderSubmodulesPinned(
  status: StatusSummary,
  filter: DashboardFilter
): string {
  const sub = status.submodules;
  if (!sub || sub.entries.length === 0) return "";

  const collapsed = filter.submodulesCollapsed === true;

  const parentBranchHtml = sub.parentBranch
    ? `parent on <code>${escapeHtml(sub.parentBranch)}</code>`
    : `<span class="sev-warn">parent HEAD detached</span>`;

  const blockHtml = sub.wouldBlock
    ? `<span class="badge sev-error" title="Pre-push hook will block. Submodules need to match the parent branch.">would block push</span>`
    : "";

  // Compact summary dots — one per submodule, colored by branch alignment.
  // Visible in both open and closed states so the user always has an
  // at-a-glance health read without expanding the panel.
  const dotsHtml = sub.entries
    .map((e) => {
      const align = classifyBranch(e, sub.parentBranch);
      const title = `${e.path} · ${e.branch ?? "detached"}`;
      return `<span class="submodule-dot-summary submodule-dot-${align}" title="${escapeAttr(title)}">●</span>`;
    })
    .join("");

  const sharedWarnHtml =
    sub.sharedPointerChanged.length > 0
      ? `<div class="submodule-shared-warn">⚠ Shared submodule pointer changed: ${sub.sharedPointerChanged
          .map((p) => `<code>${escapeHtml(p)}</code>`)
          .join(", ")} — affects all consumers.</div>`
      : "";

  const rows = sub.entries.map((e) => submoduleRow(e, sub.parentBranch)).join("");

  const pushBtnClass = sub.wouldBlock ? "btn-tiny btn-danger" : "btn-primary btn-tiny";
  const pushBtnLabel = sub.wouldBlock ? "Run push (will block)" : "Run push";
  const chevron = collapsed ? "▸" : "▾";
  const ariaExpanded = collapsed ? "false" : "true";

  // Always render the body; visibility is controlled by
  // `.submodules-pinned[data-collapsed="true"] .submodule-pinned-body { display: none }`.
  // Eliding the body when collapsed broke the expand path: the optimistic
  // click handler queries for `.submodule-pinned-body` and toggles its
  // display, but if the element was never rendered, the chevron flipped
  // while the body stayed missing — and the host doesn't re-render on
  // toggleSubmodules. Cost of the always-rendered branch is a few hundred
  // bytes of HTML per refresh.
  const bodyHtml = `<div class="submodule-pinned-body">
        ${sharedWarnHtml}
        <div class="submodule-list">${rows}</div>
        <div class="submodule-actions">
          <button class="btn ${pushBtnClass}" data-action="submodulePush">${escapeHtml(pushBtnLabel)}</button>
        </div>
      </div>`;

  return `<section class="submodules-pinned" data-collapsed="${collapsed}">
    <header class="submodules-pinned-header" aria-expanded="${ariaExpanded}">
      <span class="submodules-pinned-chevron">${chevron}</span>
      <span class="submodules-pinned-title">Submodules</span>
      <span class="count">${sub.entries.length}</span>
      <span class="submodules-pinned-dots">${dotsHtml}</span>
      <span class="submodules-pinned-meta">${parentBranchHtml}</span>
      ${blockHtml}
    </header>
    ${bodyHtml}
  </section>`;
}

// Branch-alignment state encodes what the branch relationship MEANS for the
// user, not just match/mismatch. Drives both the branch chip color and the
// row's left-border accent so the row is scannable at a glance.
type BranchAlignment = "aligned" | "blocking" | "advisory" | "detached";

function classifyBranch(e: SubmoduleEntry, parentBranch: string | null): BranchAlignment {
  if (!e.branch) return "detached";
  if (parentBranch && e.branch === parentBranch) return "aligned";
  // Different from parent. Owned = blocking (pre-push hook rejects);
  // shared = advisory (shared modules legitimately live on their own
  // branches and don't enforce alignment).
  return e.type === "owned" ? "blocking" : "advisory";
}

function submoduleRow(e: SubmoduleEntry, parentBranch: string | null): string {
  const align = classifyBranch(e, parentBranch);

  const typeBadge =
    e.type === "shared"
      ? `<span class="badge sev-info" title="kb-shared = true in .gitmodules">shared</span>`
      : `<span class="badge" title="owned by this superproject">owned</span>`;
  // F9: explicit detached badge alongside type so a checked-out-by-SHA
  // submodule is unmistakable. The classifyBranch return + CSS color the
  // row, but a badge survives screenshot scaling and matches §1.1's badge list.
  const detachedBadge = align === "detached"
    ? `<span class="badge sev-warn" title="Submodule HEAD is detached — no branch to compare against parent.">detached</span>`
    : "";

  const branchChipTitle =
    align === "aligned"
      ? "Same branch as parent — push will sail through."
      : align === "blocking"
      ? "Owned submodule on a different branch than parent — the pre-push hook will block this combination."
      : align === "advisory"
      ? "Shared submodule on its own branch — informational, not blocking."
      : "Detached HEAD — no branch to compare.";
  const branchHtml = e.branch
    ? `<code class="branch-chip branch-${align}" title="${escapeAttr(branchChipTitle)}">${escapeHtml(e.branch)}</code>`
    : `<span class="branch-chip branch-detached" title="${escapeAttr(branchChipTitle)}"><em>detached</em></span>`;

  const pointerDot = e.pointerChanged
    ? `<span class="submodule-dot pointer" title="Pointer changed vs upstream">●</span>`
    : "";

  let stateHtml = "";
  let actionsHtml = "";
  if (e.branchMismatch && parentBranch) {
    stateHtml = `<span class="badge sev-error" title="Submodule branch differs from parent — the pre-push hook will block this combination.">mismatch</span>`;
    actionsHtml = `<button class="btn btn-tiny btn-danger" data-action="submoduleSync" data-sub-path="${escapeAttr(
      e.path
    )}" data-parent-branch="${escapeAttr(parentBranch)}">Sync to <code>${escapeHtml(
      parentBranch
    )}</code></button>`;
  } else if (e.pointerChanged) {
    stateHtml = `<span class="badge sev-info" title="Pointer changed since upstream — will be included in the next push.">to push</span>`;
  } else {
    stateHtml = `<span class="badge" title="In sync with upstream.">clean</span>`;
  }

  return `<div class="submodule-row submodule-row-${align}">
    <div class="submodule-main">
      <div class="submodule-title">
        <code>${escapeHtml(e.path)}</code> ${typeBadge} ${detachedBadge} ${pointerDot}
      </div>
      <div class="submodule-meta">on ${branchHtml} ${stateHtml}</div>
    </div>
    <div class="submodule-row-actions">${actionsHtml}</div>
  </div>`;
}

// ── Hooks badge ─────────────────────────────────────────────────────────────

function renderHooksBadge(status: StatusSummary): string {
  const h = status.hooks;
  if (!h) return "";
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
    .map((f) => `${f.name}: ${f.managed ? "managed" : f.present ? "present (not managed)" : "missing"}`)
    .join("\n");
  return `<span class="badge ${sevClass} hooks-badge" title="${escapeAttr(tip)}">${escapeHtml(
    labels[h.health]
  )}</span>`;
}

