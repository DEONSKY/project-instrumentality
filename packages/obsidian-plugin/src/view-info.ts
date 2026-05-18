import { Notice } from "obsidian";
import {
  TOOL_CATALOG,
  TOOL_CATEGORIES,
  AGENT_SETUP_SNIPPETS,
  renderSnippet,
  toolsByCategory,
  type ToolCatalogEntry,
  type ToolCategoryMeta,
} from "@instrumentality/shared";

/**
 * Render the "Info" tab — capabilities of the kb-mcp server.
 *
 * Uses native <details>/<summary> elements for collapse behavior so we
 * don't need any extra state management; the browser remembers per-DOM-
 * node open state between renders within the same view lifetime.
 */
export function renderInfoBody(parent: HTMLElement, kbRoot: string | null): void {
  const wrap = parent.createDiv({ cls: "instrumentality-info" });

  wrap.createEl("p", {
    cls: "instrumentality-info-intro",
    text: "All MCP tools the kb-mcp server exposes — and the natural-language prompts that route to each.",
  });

  const note = wrap.createDiv({ cls: "instrumentality-info-note" });
  note.createEl("strong", { text: "Two surfaces, one set of tools. " });
  note.createSpan({
    text:
      "This plugin already invokes the read-only tools directly via subprocess for the dashboard. The MCP server (registered via the configs below) is what lets AI agents in Claude Code, Claude Desktop, and Cursor call the same tools by name.",
  });

  // Top-level collapsible: hides everything by default.
  const root = wrap.createEl("details", { cls: "instrumentality-info-root" });
  const rootSummary = root.createEl("summary");
  rootSummary.createEl("strong", { text: "Show capabilities" });
  rootSummary.createSpan({
    cls: "instrumentality-info-count",
    text: ` — ${TOOL_CATALOG.length} MCP tools`,
  });

  const body = root.createDiv({ cls: "instrumentality-info-body" });

  for (const cat of TOOL_CATEGORIES) {
    renderCategory(body, cat);
  }

  renderAgentSetup(body, kbRoot);
}

function renderCategory(parent: HTMLElement, cat: ToolCategoryMeta): void {
  const tools = toolsByCategory(cat.id);
  if (tools.length === 0) return;

  const card = parent.createEl("details", { cls: "instrumentality-info-category" });
  const summary = card.createEl("summary");
  summary.createSpan({ cls: "instrumentality-info-cat-label", text: cat.label });
  summary.createSpan({
    cls: "instrumentality-info-cat-count",
    text: ` (${tools.length})`,
  });

  card.createEl("p", { cls: "instrumentality-info-cat-blurb", text: cat.blurb });

  for (const tool of tools) {
    renderTool(card, tool);
  }
}

function renderTool(parent: HTMLElement, tool: ToolCatalogEntry): void {
  const card = parent.createEl("details", { cls: "instrumentality-info-tool" });
  const summary = card.createEl("summary");
  summary.createEl("code", {
    cls: "instrumentality-info-tool-name",
    text: tool.name,
  });
  summary.createSpan({
    cls: "instrumentality-info-tool-summary",
    text: tool.whenToUse,
  });

  const body = card.createDiv({ cls: "instrumentality-info-tool-body" });

  body.createEl("p", {
    cls: "instrumentality-info-tool-desc",
    text: tool.shortDescription,
  });

  if (tool.examplePrompts.length > 0) {
    body.createDiv({
      cls: "instrumentality-info-section-label",
      text: "Example prompts",
    });
    const list = body.createEl("ul", { cls: "instrumentality-info-prompt-list" });
    for (const prompt of tool.examplePrompts) {
      const row = list.createEl("li", { cls: "instrumentality-info-prompt-row" });
      row.createSpan({
        cls: "instrumentality-info-prompt-text",
        text: prompt,
      });
      const btn = row.createEl("button", {
        cls: "instrumentality-info-copy",
        text: "Copy",
      });
      btn.addEventListener("click", () => {
        void copyToClipboard(prompt, `prompt for ${tool.name}`);
      });
    }
  }

  const required = tool.keyParams.filter((p) => p.required);
  const optional = tool.keyParams.filter((p) => !p.required);

  if (required.length > 0) {
    body.createDiv({
      cls: "instrumentality-info-section-label",
      text: "Required params",
    });
    renderParamList(body, required);
  }

  if (optional.length > 0) {
    const opt = body.createEl("details", {
      cls: "instrumentality-info-optional",
    });
    opt.createEl("summary", { text: `Optional params (${optional.length})` });
    renderParamList(opt, optional);
  }
}

function renderParamList(
  parent: HTMLElement,
  params: ToolCatalogEntry["keyParams"]
): void {
  const list = parent.createEl("ul", { cls: "instrumentality-info-param-list" });
  for (const p of params) {
    const li = list.createEl("li");
    li.createEl("code", { text: p.name });
    li.createSpan({ cls: "instrumentality-info-param-type", text: ` ${p.type}` });
    if (p.hint) {
      li.createDiv({ cls: "instrumentality-info-param-hint", text: p.hint });
    }
  }
}

function renderAgentSetup(parent: HTMLElement, kbRoot: string | null): void {
  const card = parent.createEl("details", {
    cls: "instrumentality-info-category instrumentality-info-agents",
  });
  const summary = card.createEl("summary");
  summary.createSpan({
    cls: "instrumentality-info-cat-label",
    text: "Connect an AI agent",
  });
  summary.createSpan({
    cls: "instrumentality-info-cat-count",
    text: ` (${AGENT_SETUP_SNIPPETS.length})`,
  });

  card.createEl("p", {
    cls: "instrumentality-info-cat-blurb",
    text: "Register kb-mcp with your AI client so its agent can invoke these tools.",
  });

  for (const s of AGENT_SETUP_SNIPPETS) {
    const text = renderSnippet(s.snippet, kbRoot);
    const block = card.createEl("details", { cls: "instrumentality-info-agent" });
    const sum = block.createEl("summary");
    sum.createSpan({ cls: "instrumentality-info-cat-label", text: s.label });
    const body = block.createDiv({ cls: "instrumentality-info-tool-body" });

    const cfg = body.createDiv({ cls: "instrumentality-info-param-hint" });
    cfg.appendText("Config: ");
    cfg.createEl("code", { text: s.configFile });

    body.createDiv({
      cls: "instrumentality-info-param-hint",
      text: s.instructions,
    });

    body.createEl("pre", { cls: "instrumentality-info-snippet", text });
    const btn = body.createEl("button", {
      cls: "instrumentality-info-copy",
      text: "Copy snippet",
    });
    btn.addEventListener("click", () => {
      void copyToClipboard(text, `${s.label} config`);
    });
  }
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    new Notice(`Copied ${label} to clipboard.`);
  } catch (err: any) {
    new Notice(`Copy failed: ${err?.message ?? err}`);
  }
}
