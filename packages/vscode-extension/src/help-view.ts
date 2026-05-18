import * as vscode from "vscode";
import {
  TOOL_CATALOG,
  TOOL_CATEGORIES,
  AGENT_SETUP_SNIPPETS,
  renderSnippet,
  toolsByCategory,
  type ToolCatalogEntry,
  type ToolCategoryMeta,
} from "@instrumentality/shared";
import { CSS } from "./webview-css";

export interface HelpCallbacks {
  getKbRoot: () => string | null;
  copyToClipboard: (text: string, label?: string) => Promise<void>;
}

let panel: vscode.WebviewPanel | null = null;
let cb: HelpCallbacks | null = null;

/**
 * Open (or reveal) the Capabilities help panel. It documents every MCP tool
 * the kb-mcp server exposes plus copy-pasteable AI-agent client configs.
 * Triggered on-demand from the sidebar's "?" header button — the panel is
 * intentionally not pinned to the sidebar so it stays out of the way until
 * the user asks for it.
 */
export function openCapabilities(callbacks: HelpCallbacks): void {
  cb = callbacks;
  if (panel) {
    panel.reveal();
    rerender();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "instrumentality.help",
    "Instrumentality Capabilities",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.onDidReceiveMessage((msg) => void handleMessage(msg));
  panel.onDidDispose(() => {
    panel = null;
  });

  rerender();
}

function rerender(): void {
  if (!panel || !cb) return;
  panel.webview.html = renderHelpHtml(cb.getKbRoot());
}

async function handleMessage(msg: any): Promise<void> {
  if (!cb || !msg) return;
  if (msg.command === "copy" && typeof msg.text === "string") {
    await cb.copyToClipboard(msg.text, msg.label);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderToolCard(tool: ToolCatalogEntry): string {
  const required = tool.keyParams.filter((p) => p.required);
  const optional = tool.keyParams.filter((p) => !p.required);

  const paramRow = (p: { name: string; type: string; hint: string }) => `
    <li><code>${escapeHtml(p.name)}</code> <span class="param-type">${escapeHtml(p.type)}</span>
      ${p.hint ? `<div class="param-hint">${escapeHtml(p.hint)}</div>` : ""}
    </li>`;

  const prompts = tool.examplePrompts
    .map(
      (p) => `
    <li class="prompt-row">
      <span class="prompt-text">${escapeHtml(p)}</span>
      <button class="copy-btn" data-copy="${escapeHtml(p)}" data-label="prompt for ${escapeHtml(tool.name)}">Copy</button>
    </li>`
    )
    .join("");

  return `
  <details class="tool-card">
    <summary>
      <code class="tool-name">${escapeHtml(tool.name)}</code>
      <span class="tool-summary">${escapeHtml(tool.whenToUse)}</span>
    </summary>
    <div class="tool-body">
      <p class="tool-desc">${escapeHtml(tool.shortDescription)}</p>
      ${
        prompts
          ? `<div class="section-label">Example prompts</div>
             <ul class="prompt-list">${prompts}</ul>`
          : ""
      }
      ${
        required.length
          ? `<div class="section-label">Required params</div>
             <ul class="param-list">${required.map(paramRow).join("")}</ul>`
          : ""
      }
      ${
        optional.length
          ? `<details class="optional-params">
              <summary>Optional params (${optional.length})</summary>
              <ul class="param-list">${optional.map(paramRow).join("")}</ul>
            </details>`
          : ""
      }
    </div>
  </details>`;
}

function renderCategorySection(cat: ToolCategoryMeta): string {
  const tools = toolsByCategory(cat.id);
  if (tools.length === 0) return "";
  return `
  <details class="category-card" open>
    <summary>
      <span class="cat-label">${escapeHtml(cat.label)}</span>
      <span class="cat-count">${tools.length}</span>
    </summary>
    <p class="cat-blurb">${escapeHtml(cat.blurb)}</p>
    ${tools.map(renderToolCard).join("")}
  </details>`;
}

function renderAgentSetup(kbRoot: string | null): string {
  const blocks = AGENT_SETUP_SNIPPETS.map((s) => {
    const text = renderSnippet(s.snippet, kbRoot);
    return `
    <details class="agent-card">
      <summary><span class="cat-label">${escapeHtml(s.label)}</span></summary>
      <div class="agent-body">
        <div class="agent-meta">Config: <code>${escapeHtml(s.configFile)}</code></div>
        <div class="agent-meta">${escapeHtml(s.instructions)}</div>
        <pre class="snippet">${escapeHtml(text)}</pre>
        <button class="copy-btn" data-copy="${escapeHtml(text)}" data-label="${escapeHtml(s.label)} config">Copy snippet</button>
      </div>
    </details>`;
  }).join("");

  return `
  <details class="category-card">
    <summary>
      <span class="cat-label">Connect an AI agent</span>
      <span class="cat-count">${AGENT_SETUP_SNIPPETS.length}</span>
    </summary>
    <p class="cat-blurb">Register kb-mcp with your AI client so its agent can invoke these tools.</p>
    ${blocks}
  </details>`;
}

const HELP_CSS = `
.help-intro {
  color: var(--muted);
  margin: 0 0 16px;
  max-width: 900px;
}
.surfaces-note {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 20px;
  font-size: 0.92em;
  color: var(--muted);
  max-width: 900px;
}
.surfaces-note strong { color: var(--fg); }

details { margin: 0; }
details > summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
}
details > summary::-webkit-details-marker { display: none; }
details > summary::before {
  content: "▸";
  display: inline-block;
  width: 1em;
  color: var(--muted);
  font-size: 0.85em;
}
details[open] > summary::before { content: "▾"; }

.category-card {
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--card-bg);
  padding: 10px 14px;
  margin-bottom: 10px;
  max-width: 900px;
}
.category-card > summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.cat-label { font-weight: 600; }
.cat-count {
  color: var(--muted);
  font-size: 0.85em;
}
.cat-blurb {
  color: var(--muted);
  margin: 4px 0 10px 1em;
  font-size: 0.9em;
}

.tool-card {
  border-top: 1px solid var(--border);
  padding: 8px 0;
  margin-left: 1em;
}
.tool-card > summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.tool-name {
  font-weight: 600;
  color: var(--accent);
}
.tool-summary {
  color: var(--fg);
  font-size: 0.95em;
}
.tool-body {
  margin: 6px 0 0 1.5em;
}
.tool-desc {
  color: var(--muted);
  margin: 6px 0 10px;
  font-size: 0.9em;
}
.section-label {
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 10px 0 4px;
}
.prompt-list, .param-list {
  margin: 0;
  padding-left: 18px;
}
.prompt-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.prompt-text {
  flex: 1;
  font-style: italic;
}
.copy-btn {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.85em;
}
.copy-btn:hover { background: var(--vscode-list-hoverBackground, rgba(127,127,127,0.1)); }

.param-type {
  color: var(--muted);
  font-size: 0.85em;
}
.param-hint {
  color: var(--muted);
  font-size: 0.85em;
  margin-top: 1px;
}
.optional-params {
  margin-top: 8px;
}
.optional-params > summary {
  color: var(--muted);
  font-size: 0.9em;
}

.agent-card {
  border-top: 1px solid var(--border);
  padding: 8px 0;
  margin-left: 1em;
}
.agent-body { margin: 6px 0 0 1.5em; }
.agent-meta {
  color: var(--muted);
  font-size: 0.9em;
  margin-bottom: 4px;
}
.snippet {
  margin: 6px 0;
}
`;

export function renderHelpHtml(kbRoot: string | null): string {
  const categories = TOOL_CATEGORIES.map(renderCategorySection).join("");
  const agents = renderAgentSetup(kbRoot);

  const total = TOOL_CATALOG.length;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${CSS}${HELP_CSS}</style>
</head>
<body>
  <h1>Capabilities</h1>
  <p class="help-intro">All MCP tools the kb-mcp server exposes — and the natural-language prompts that route to each. ${total} tools across ${TOOL_CATEGORIES.length} categories.</p>
  <div class="surfaces-note">
    <strong>Two surfaces, one set of tools.</strong> This extension already invokes the read-only tools directly via subprocess for the dashboard. The MCP server (registered in the configs at the bottom) is what lets AI agents in Claude Code, Claude Desktop, and Cursor call the same tools by name.
  </div>
  ${categories}
  ${agents}
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains('copy-btn')) {
        e.preventDefault();
        const text = target.getAttribute('data-copy') || '';
        const label = target.getAttribute('data-label') || 'text';
        vscode.postMessage({ command: 'copy', text, label });
      }
    });
  </script>
</body>
</html>`;
}
