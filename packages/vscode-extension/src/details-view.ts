import * as vscode from "vscode";
import * as path from "node:path";
import {
  buildCodeDriftDetail,
  buildKbDriftDetail,
  buildStandardsDriftDetail,
  buildPromotionDetail,
  buildConformDetail,
  buildLintDetail,
  buildStandaloneDetail,
  collectDiffableFromCodeDrift,
  collectDiffableFromKbDrift,
  collectDiffableFromStandardsDrift,
  type DetailDescriptor,
  type DiffableFile,
  type SectionKind,
} from "./details-html";
import {
  getActionPrompt,
  type StatusSummary,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type ConformRequest,
  type LintViolation,
  type PromptInput,
} from "@instrumentality/shared";

export interface DetailsAction {
  type: "send" | "copy" | "open" | "openStandard" | "editRule" | "refineStandard";
  ref: { section: SectionKind; id: string };
}

export interface ShowFileDiffPayload {
  absPath: string;
  sinceCommit: string;
  latestCommit?: string;
}

export interface DetailsCallbacks {
  onAction: (action: DetailsAction) => Promise<void>;
  onShowFileDiff: (payload: ShowFileDiffPayload) => Promise<void>;
}

/**
 * Side webview view in the Instrumentality activity-bar container.
 * Renders the rich detail panel for the entry currently selected in
 * the tree, so users see standard/rule context without opening the
 * full dashboard.
 */
export class DetailsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private current: DetailDescriptor | null = null;

  constructor(private readonly cb: DetailsCallbacks) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.onDidDispose(() => {
      this.view = null;
    });
    view.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.rerender();
  }

  /** Show details for an entry. Pass null to clear. */
  show(descriptor: DetailDescriptor | null): void {
    this.current = descriptor;
    this.rerender();
  }

  /** Re-render with the current descriptor (e.g. after a refresh changed prompt). */
  refresh(descriptor: DetailDescriptor | null): void {
    this.current = descriptor;
    this.rerender();
  }

  private async handleMessage(msg: any): Promise<void> {
    if (!msg || !msg.command) return;
    if (msg.command === "openSettings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "instrumentality"
      );
      return;
    }
    if (msg.command === "showFileDiff") {
      await this.cb.onShowFileDiff({
        absPath: String(msg.absPath ?? ""),
        sinceCommit: String(msg.sinceCommit ?? ""),
        latestCommit: msg.latestCommit ? String(msg.latestCommit) : undefined,
      });
      return;
    }
    if (!this.current) return;
    const ref = { section: this.current.section, id: this.current.id };
    switch (msg.command) {
      case "send":
      case "copy":
      case "open":
      case "openStandard":
      case "editRule":
      case "refineStandard":
        await this.cb.onAction({ type: msg.command, ref });
        return;
    }
  }

  private rerender(): void {
    if (!this.view) return;
    this.view.webview.html = this.renderHtml();
  }

  private renderHtml(): string {
    const body = this.current
      ? buildStandaloneDetail(this.current)
      : `<div class="empty">Select an entry in the tree to see details.</div>`;
    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>${CSS}</style>
</head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-action");
      if (!action) return;
      if (action === "showFileDiff") {
        vscode.postMessage({
          command: "showFileDiff",
          absPath: target.getAttribute("data-diff-path") || "",
          sinceCommit: target.getAttribute("data-diff-since") || "",
          latestCommit: target.getAttribute("data-diff-latest") || "",
        });
        return;
      }
      vscode.postMessage({ command: action });
    });
  </script>
</body>
</html>`;
  }
}

/** Build a DetailDescriptor for any entry in the current StatusSummary. */
export function descriptorFor(
  _status: StatusSummary,
  ref: { section: SectionKind; id: string },
  resolveById: (section: SectionKind, id: string) => ResolvedRow | null,
  kbRoot: string | null
): DetailDescriptor | null {
  const row = resolveById(ref.section, ref.id);
  if (!row) return null;
  return rowToDescriptor(row, ref, kbRoot);
}

export interface ResolvedRow {
  promptInput: PromptInput;
  sourceFile?: string;
  standardId?: string | null;
  ruleId?: string | null;
  // Per-section payload
  payload:
    | { kind: "code-drift"; entry: CodeDriftEntry }
    | { kind: "kb-drift"; entry: KbDriftEntry }
    | { kind: "standards-drift"; entry: StandardsDriftEntry }
    | {
        kind: "conform-pending";
        pending: ConformPending & { staleAgainstHead?: boolean };
        request: ConformRequest;
      }
    | { kind: "promotion"; entry: PromotionEntry }
    | { kind: "lint"; entry: LintViolation };
}

function rowToDescriptor(
  row: ResolvedRow,
  ref: { section: SectionKind; id: string },
  kbRoot: string | null
): DetailDescriptor {
  const prompt = getActionPrompt(row.promptInput);
  const resolveAbs = (p: string): string =>
    path.isAbsolute(p) ? p : kbRoot ? path.join(kbRoot, p) : p;
  const base = {
    section: ref.section,
    id: ref.id,
    sourceFile: row.sourceFile,
    standardId: row.standardId ?? null,
    ruleId: row.ruleId ?? null,
    prompt,
    promptInput: row.promptInput,
  };
  switch (row.payload.kind) {
    case "code-drift": {
      const e = row.payload.entry;
      return {
        ...base,
        title: e.kbTarget,
        subtitle: `${e.codeFiles.length} file(s)${e.hasShared ? " · shared module" : ""}`,
        severity: e.hasShared ? "warn" : "info",
        metaHtml: buildCodeDriftDetail(e),
        hasStandardRule: false,
        diffableFiles: collectDiffableFromCodeDrift(e, resolveAbs),
      };
    }
    case "kb-drift": {
      const e = row.payload.entry;
      return {
        ...base,
        title: e.kbFile,
        subtitle: `${e.codeAreas.length} code area(s)${e.unmapped ? " · unmapped" : ""}`,
        severity: e.unmapped ? "warn" : "info",
        metaHtml: buildKbDriftDetail(e),
        hasStandardRule: false,
        diffableFiles: collectDiffableFromKbDrift(e, resolveAbs),
      };
    }
    case "standards-drift": {
      const e = row.payload.entry;
      const fileCount = Object.values(e.filesByParty).reduce((n, fs) => n + fs.length, 0);
      return {
        ...base,
        title: e.queueKey,
        subtitle: `${e.standardId ?? "?"}${e.standardKind ? ` (${e.standardKind})` : ""} · ${fileCount} file(s)`,
        severity: coerceSev(e.severity),
        metaHtml: buildStandardsDriftDetail(e),
        hasStandardRule: !!(e.standardId && e.ruleId),
        diffableFiles: collectDiffableFromStandardsDrift(e, resolveAbs),
      };
    }
    case "conform-pending": {
      const { pending, request } = row.payload;
      return {
        ...base,
        title: request.file,
        subtitle: `${request.standard_id} · ${request.rule_ids.join(", ")} (${pending.mode} @ ${pending.head_sha_short})`,
        severity: pending.staleAgainstHead ? "warn" : "info",
        metaHtml: buildConformDetail(pending, request),
        hasStandardRule: !!(request.standard_id && request.rule_ids.length > 0),
        diffableFiles: [],
      };
    }
    case "promotion": {
      const e = row.payload.entry;
      return {
        ...base,
        title: e.queueKey,
        subtitle: `${e.files.length} file(s) · ${e.standardId ?? "?"}`,
        severity: coerceSev(e.severity),
        metaHtml: buildPromotionDetail(e),
        hasStandardRule: !!(e.standardId && e.ruleId),
        diffableFiles: [],
      };
    }
    case "lint": {
      const v = row.payload.entry;
      return {
        ...base,
        title: v.file,
        subtitle: v.message,
        severity: v.severity,
        metaHtml: buildLintDetail(v),
        hasStandardRule: false,
        diffableFiles: [],
      };
    }
  }
}

// Re-export so consumers can build diffable lists from raw entries.
export type { DiffableFile };

function coerceSev(s: string | null): "error" | "warn" | "info" | null {
  if (s === "error" || s === "warn" || s === "info") return s;
  return null;
}

// Compact CSS variant — webview views are narrow.
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
}
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--fg);
  background: var(--bg);
  margin: 0;
  padding: 12px;
  line-height: 1.45;
}
code {
  font-family: var(--vscode-editor-font-family);
  background: var(--code-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.92em;
}
pre {
  font-family: var(--vscode-editor-font-family);
  background: var(--code-bg);
  padding: 8px;
  border-radius: 3px;
  white-space: pre-wrap;
  margin: 6px 0 0;
  max-height: 240px;
  overflow: auto;
  font-size: 0.85em;
}
.empty {
  color: var(--muted);
  font-style: italic;
  text-align: center;
  padding: 24px 8px;
}
.entry-detail { padding: 0; }
.detail-header { margin-bottom: 8px; }
.detail-title-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.detail-title {
  font-family: var(--vscode-editor-font-family);
  font-weight: 600;
  word-break: break-all;
}
.detail-subtitle { color: var(--muted); font-size: 0.86em; margin-top: 2px; }
.detail-meta { font-size: 0.88em; }
.detail-meta > div { margin-bottom: 4px; }
.detail-meta ul { margin: 4px 0 6px 16px; padding: 0; }
.detail-meta li { margin: 1px 0; word-break: break-all; }
.entry-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 10px 0 8px;
}
.btn {
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--fg));
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85em;
}
.btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--card-bg)); }
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-tiny { padding: 3px 8px; font-size: 0.82em; }
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
.badge.sev-error { background: var(--error); color: #fff; }
.badge.sev-warn  { background: var(--warn);  color: #000; }
.badge.sev-info  { background: var(--info);  color: #fff; }
.rule-block {
  background: var(--code-bg);
  border-left: 3px solid var(--accent);
  padding: 8px 10px;
  margin: 8px 0;
  border-radius: 3px;
}
.rule-block .rule-row { margin: 2px 0; font-size: 0.88em; }
.rule-block .rule-label { color: var(--muted); margin-right: 4px; font-weight: 500; }
.rule-block .rule-title { font-weight: 600; }
.rule-block .rule-aside { color: var(--muted); font-size: 0.84em; }
.rule-row.warn-note {
  margin-top: 6px;
  color: var(--warn);
  font-size: 0.86em;
}
.prompt-disclosure {
  margin-top: 10px;
  font-size: 0.86em;
  color: var(--muted);
}
.prompt-disclosure summary {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.prompt-disclosure summary:hover { color: var(--fg); }
.prompt-disclosure[open] summary { color: var(--fg); margin-bottom: 4px; }

.section-guide {
  background: var(--code-bg);
  border-radius: 3px;
  padding: 8px 10px;
  margin-bottom: 10px;
  font-size: 0.86em;
}
.section-guide-kind {
  font-weight: 600;
  color: var(--accent);
  font-size: 0.92em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.section-guide-what { color: var(--fg); margin: 3px 0; }
.section-guide-todo { color: var(--muted); font-style: italic; }

.diff-actions { margin: 10px 0; }
.diff-actions .btn { font-family: var(--vscode-editor-font-family); }
.diff-disclosure { color: var(--muted); }
.diff-disclosure summary {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
  font-size: 0.86em;
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
  gap: 6px;
  padding: 3px 0;
  font-size: 0.86em;
}
.diff-list li code { flex: 1; word-break: break-all; }
`;

