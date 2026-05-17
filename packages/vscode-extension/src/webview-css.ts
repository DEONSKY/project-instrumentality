export const CSS = `
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
.author-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 0.78em;
  color: var(--muted);
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,0.15));
}
.ack-badge {
  margin: 6px 0;
  padding: 6px 10px;
  border-radius: 4px;
  border-left: 3px solid var(--vscode-charts-blue, #4a90e2);
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,0.10));
  font-size: 0.88em;
  color: var(--muted);
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

/* ── Sidebar-mode overrides ──────────────────────────────────────────── */
body[data-mode="sidebar"] {
  padding: 8px;
}
body[data-mode="sidebar"] .pipeline-strip {
  margin-bottom: 10px;
  padding: 6px 8px;
  gap: 4px;
}
body[data-mode="sidebar"] .pipeline-cell {
  flex: 1 1 50px;
  min-width: 50px;
  padding: 4px 6px;
}
body[data-mode="sidebar"] .pipeline-cell .pipeline-count {
  font-size: 1.1em;
}
body[data-mode="sidebar"] .pipeline-cell .pipeline-label {
  font-size: 0.7em;
  margin-top: 2px;
}
body[data-mode="sidebar"] .pipeline-arrow {
  font-size: 0.85em;
}
body[data-mode="sidebar"] .filter-bar {
  padding: 6px 8px;
  gap: 6px;
  margin-bottom: 10px;
}
body[data-mode="sidebar"] .filter-bar input[type="search"] {
  flex: 1 1 100%;
  min-width: 0;
}
body[data-mode="sidebar"] .group-by {
  flex-wrap: wrap;
}
body[data-mode="sidebar"] .section-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Fill the viewport minus the pipeline strip + filter bar + body
   * padding (24px top/bottom). The accordion needs a bounded height to
   * give the open card real flex space and meaningful internal scroll. */
  height: calc(100vh - 24px - 24px);
  min-height: 0;
}
body[data-mode="sidebar"] .section-card > header {
  padding: 6px 10px;
  background: var(--vscode-sideBarSectionHeader-background, var(--bg));
  cursor: pointer;
  user-select: none;
}
body[data-mode="sidebar"] .section-card h2 {
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
body[data-mode="sidebar"] .section-card .body {
  padding: 2px 8px;
}

/* ── Accordion (sidebar only) ────────────────────────────────────────
 * Closed cards collapse to their header. The open card flex-grows into
 * remaining space and scrolls its body independently. Hover gives a
 * subtle affordance for "clickable" — the cursor: pointer above is the
 * primary signal. */
body[data-mode="sidebar"] .section-card {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
body[data-mode="sidebar"] .section-card > header:hover {
  background: var(--vscode-list-hoverBackground, var(--vscode-sideBarSectionHeader-background, var(--bg)));
}
body[data-mode="sidebar"] .section-card > .body,
body[data-mode="sidebar"] .section-card > .banner,
body[data-mode="sidebar"] .section-card > .group-hint {
  display: none;
}
/* Open card sizes to its content. It only shrinks (and its body scrolls)
 * when (closed headers + open content) exceeds the container height.
 * Result: a section with a few rows takes a few rows of space, not the
 * whole sidebar. */
body[data-mode="sidebar"] .section-card[data-open="true"] {
  flex: 0 1 auto;
  min-height: 0;
}
body[data-mode="sidebar"] .section-card[data-open="true"] > .body {
  display: block;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
body[data-mode="sidebar"] .section-card[data-open="true"] > .banner,
body[data-mode="sidebar"] .section-card[data-open="true"] > .group-hint {
  display: block;
}
/* Down-chevron when open, right-chevron when closed — small visual cue
 * that complements the cursor: pointer affordance. */
body[data-mode="sidebar"] .section-card > header h2::before {
  content: "▸";
  display: inline-block;
  font-size: 0.85em;
  margin-right: 6px;
  color: var(--muted);
  transition: transform 120ms ease;
}
body[data-mode="sidebar"] .section-card[data-open="true"] > header h2::before {
  transform: rotate(90deg);
}
body[data-mode="sidebar"] .group-hint {
  padding: 2px 10px 4px;
  font-size: 0.78em;
}
body[data-mode="sidebar"] .entry {
  padding: 6px 0;
}
body[data-mode="sidebar"] .entry .title {
  font-size: 0.88em;
  word-break: break-word;
}
body[data-mode="sidebar"] .entry .meta {
  font-size: 0.78em;
  word-break: break-word;
}
body[data-mode="sidebar"] .entry-detail {
  padding: 6px 4px 2px;
}
body[data-mode="sidebar"] .entry-actions {
  gap: 4px;
}
body[data-mode="sidebar"] .btn-tiny {
  padding: 2px 6px;
  font-size: 0.78em;
}
body[data-mode="sidebar"] pre {
  max-height: 250px;
  padding: 8px;
  font-size: 0.82em;
}

/* ── Phase 1 additions: mode chip, stale banner, suppression contract ── */

.badge.advisory-mode {
  background: var(--vscode-badge-background, var(--card-bg));
  color: var(--muted);
  border: 1px dashed var(--border);
}

.entry[data-entry-mode="aspirational"] {
  opacity: 0.72;
}
.entry[data-entry-mode="aspirational"]:hover,
.entry[data-entry-mode="aspirational"].open {
  opacity: 1;
}

.banner {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.92em;
}
.banner-text { flex: 1; }
.banner.stale {
  background: var(--vscode-inputValidation-warningBackground, rgba(181, 137, 0, 0.12));
  color: var(--vscode-inputValidation-warningForeground, var(--fg));
  border: 1px solid var(--vscode-inputValidation-warningBorder, var(--warn));
}
.banner.stale code {
  background: rgba(255, 255, 255, 0.08);
}

.suppression-contract {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 4px;
  background: var(--card-bg);
  font-size: 0.92em;
}
.suppression-contract .sc-title {
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  font-size: 0.78em;
  letter-spacing: 0.04em;
}
.suppression-contract .sc-row {
  margin: 3px 0;
}
.suppression-contract .sc-label {
  color: var(--muted);
  font-weight: 500;
  margin-right: 4px;
}
.suppression-contract .sc-actions {
  margin-top: 8px;
}

/* ── Phase 2 additions: education banner + "?" help icon ── */

.banner.education {
  background: var(--vscode-textBlockQuote-background, var(--card-bg));
  border: 1px solid var(--border);
  align-items: flex-start;
  flex-direction: row;
}
/* Sidebar mode forces display:block on the open section's banner via a
 * 4-class selector, which outweighs .banner.education.hidden. Match that
 * specificity here so the Got it button actually hides the banner in the
 * sidebar — not just the dashboard. */
.banner.education.hidden,
body[data-mode="sidebar"] .section-card[data-open="true"] > .banner.education.hidden {
  display: none;
}
.banner.education .banner-content {
  flex: 1;
}
.banner.education .banner-explainer {
  font-size: 0.92em;
  margin-bottom: 6px;
}
.banner.education .banner-explainer em {
  color: var(--muted);
  font-style: normal;
  margin-left: 6px;
}
.banner.education .banner-diagram {
  margin: 6px 0 0;
  font-size: 0.82em;
  line-height: 1.35;
  background: var(--bg);
  border: 1px solid var(--border);
  white-space: pre;
  overflow-x: auto;
  max-height: 220px;
}

.banner-question {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  margin-left: 6px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.78em;
  line-height: 1;
  vertical-align: middle;
  font: inherit;
  font-size: 11px;
}
.banner-question:hover {
  background: var(--card-bg);
  color: var(--fg);
}

/* ── Phase 3 additions: verdict buttons + inline form ── */

.verdict-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.verdict-btn {
  /* Distinguish from agent-driven buttons: dashed border, no fill. */
  background: transparent;
  border-style: dashed;
}
.verdict-btn:hover {
  background: var(--card-bg);
}

.verdict-form {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--card-bg);
}
.verdict-form.hidden { display: none; }
.verdict-form-title {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.verdict-field {
  margin: 8px 0;
}
.verdict-field.hidden { display: none; }
.verdict-field > label {
  display: block;
  font-size: 0.88em;
  color: var(--muted);
  margin-bottom: 4px;
}
.verdict-required-marker {
  color: var(--error);
}
.verdict-optional-marker {
  color: var(--muted);
  font-style: italic;
}
.verdict-file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 4px 8px;
  background: var(--bg);
}
.verdict-file-list li {
  margin: 3px 0;
}
.verdict-file-list label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88em;
  cursor: pointer;
}
.verdict-form textarea {
  width: 100%;
  font-family: var(--vscode-font-family);
  font-size: 0.9em;
  padding: 6px 8px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  resize: vertical;
}
.verdict-form textarea:focus {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
.verdict-form-actions {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.verdict-submit[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Phase 4 additions: view-mode tabs + activity timeline ── */

.view-mode-tabs {
  display: flex;
  gap: 2px;
  margin: 12px 0 4px;
  border-bottom: 1px solid var(--border);
}
.view-mode-tab {
  background: transparent;
  color: var(--muted);
  border: 1px solid transparent;
  border-bottom: none;
  padding: 6px 14px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  font: inherit;
  font-size: 0.92em;
  margin-bottom: -1px;
}
.view-mode-tab:hover {
  color: var(--fg);
}
.view-mode-tab.on {
  color: var(--fg);
  background: var(--card-bg);
  border-color: var(--border);
  border-bottom-color: var(--card-bg);
}

.activity-filter-bar {
  margin-bottom: 12px;
}
.activity-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.92em;
}

.activity-group {
  margin-bottom: 12px;
}
.activity-entry .entry-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.activity-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.activity-subject {
  font-weight: 500;
}
.activity-date {
  color: var(--muted);
  font-size: 0.85em;
  margin-left: auto;
}
.activity-line {
  color: var(--muted);
  font-size: 0.88em;
}
.activity-line em {
  font-style: italic;
  opacity: 0.7;
}

.badge.event-applied {
  background: var(--vscode-charts-green, #2e7d32);
  color: #fff;
}
.badge.event-exempted {
  background: var(--warn);
  color: #fff;
}
.badge.event-promoted {
  background: var(--info);
  color: #fff;
}
.badge.event-other {
  background: var(--card-bg);
  color: var(--fg);
  border: 1px solid var(--border);
}
.badge.event-auto {
  background: transparent;
  color: var(--muted);
  border: 1px dashed var(--border);
  opacity: 0.85;
}

/* ── Submodules card + hooks badge ─────────────────────────────────── */
.sidebar-ribbon {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.hooks-badge { cursor: help; }
.btn-danger {
  background: var(--error);
  color: #fff;
  border-color: var(--error);
}
.btn-danger:hover { filter: brightness(1.1); }
.submodule-shared-warn {
  padding: 6px 8px;
  margin: 6px 0;
  border-left: 3px solid var(--warn);
  background: var(--code-bg);
  font-size: 0.9em;
}

/* ── Pinned submodules card ──────────────────────────────────────────
 * Visually distinct from accordion cards so the user reads it as a
 * status surface, not a work queue: solid accent border, no chevron
 * column, header dots give at-a-glance health even when collapsed. */
.submodules-pinned {
  border: 1px solid var(--border);
  border-top: 2px solid var(--accent);
  border-radius: 4px;
  background: var(--card-bg);
  margin-bottom: 10px;
  overflow: hidden;
}
.submodules-pinned-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  background: var(--vscode-sideBarSectionHeader-background, var(--card-bg));
}
.submodules-pinned-header:hover {
  background: var(--vscode-list-hoverBackground, var(--card-bg));
}
.submodules-pinned-chevron {
  font-size: 0.85em;
  color: var(--muted);
  width: 0.9em;
  display: inline-block;
  text-align: center;
}
.submodules-pinned-title {
  font-weight: 600;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.submodules-pinned-header .count {
  color: var(--muted);
  font-size: 0.85em;
}
.submodules-pinned-dots {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;
}
.submodule-dot-summary {
  font-size: 0.95em;
  line-height: 1;
}
.submodule-dot-aligned  { color: var(--vscode-charts-green, #4caf50); }
.submodule-dot-blocking { color: var(--vscode-charts-red,   #e51400); }
.submodule-dot-advisory { color: var(--vscode-charts-blue,  #4a90e2); }
.submodule-dot-detached { color: var(--muted); }
.submodules-pinned-meta {
  margin-left: auto;
  font-size: 0.82em;
  color: var(--muted);
}
.submodule-pinned-body {
  padding: 4px 10px 8px;
  border-top: 1px solid var(--border);
}
.submodules-pinned[data-collapsed="true"] .submodule-pinned-body {
  display: none;
}
/* In sidebar mode, when expanded with many submodules, cap the body so
 * it doesn't push the accordion off-screen. The body scrolls internally
 * just like an open accordion card. */
body[data-mode="sidebar"] .submodule-pinned-body {
  max-height: 40vh;
  overflow-y: auto;
}
.submodule-list { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
.submodule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}
/* Left-border accent encodes branch alignment — same scheme as the
 * branch chip so the row's status is readable at a glance. Uses VSCode
 * chart palette so colors track the user's theme. */
.submodule-row-aligned  { border-left-color: var(--vscode-charts-green,  #4caf50); }
.submodule-row-blocking { border-left-color: var(--vscode-charts-red,    #e51400); }
.submodule-row-advisory { border-left-color: var(--vscode-charts-blue,   #4a90e2); }
.submodule-row-detached { border-left-color: var(--muted); }

.submodule-main { flex: 1 1 auto; min-width: 0; }
.submodule-title { display: flex; align-items: center; gap: 6px; font-size: 0.95em; }
.submodule-meta { color: var(--muted); font-size: 0.85em; margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.submodule-dot.pointer { color: var(--warn); font-size: 1.05em; line-height: 1; }
.submodule-row-actions { flex: 0 0 auto; }
.submodule-actions {
  display: flex;
  justify-content: flex-end;
  padding: 8px 0 4px;
}

/* Branch chip — same palette as the row accent. */
.branch-chip {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.88em;
  background: var(--code-bg);
  border: 1px solid transparent;
}
.branch-chip.branch-aligned {
  background: color-mix(in srgb, var(--vscode-charts-green, #4caf50) 22%, var(--code-bg));
  border-color: var(--vscode-charts-green, #4caf50);
  color: var(--fg);
}
.branch-chip.branch-blocking {
  background: color-mix(in srgb, var(--vscode-charts-red, #e51400) 22%, var(--code-bg));
  border-color: var(--vscode-charts-red, #e51400);
  color: var(--fg);
}
.branch-chip.branch-advisory {
  background: color-mix(in srgb, var(--vscode-charts-blue, #4a90e2) 22%, var(--code-bg));
  border-color: var(--vscode-charts-blue, #4a90e2);
  color: var(--fg);
}
.branch-chip.branch-detached {
  color: var(--muted);
  font-style: italic;
}
`;
