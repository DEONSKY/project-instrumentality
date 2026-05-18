/**
 * Public MCP tool catalog — what the Capabilities views in the VSCode
 * extension and Obsidian plugin render.
 *
 * The entries are generated from knowledge/_mcp/tools/*.js definitions plus
 * hand-authored prose in tool-catalog-prose.json. See
 * scripts/build-tool-catalog.cjs.
 */

import { GENERATED_TOOL_CATALOG } from "./tool-catalog.generated.js";

export type ToolCategory =
  | "sync"
  | "authoring"
  | "governance"
  | "introspection";

export type ToolSurface = "mcp" | "cli" | "extension";

export interface ToolKeyParam {
  name: string;
  type: string;
  required: boolean;
  hint: string;
}

export interface ToolCatalogEntry {
  name: string;
  category: ToolCategory;
  /** From MCP `definition.description` — what the agent sees. */
  shortDescription: string;
  /** Hand-authored, plain-English "use this when". */
  whenToUse: string;
  /** 2–3 natural-language prompts that route to this tool through an AI agent. */
  examplePrompts: string[];
  keyParams: ToolKeyParam[];
  surfaces: ToolSurface[];
}

export interface ToolCategoryMeta {
  id: ToolCategory;
  label: string;
  blurb: string;
}

export const TOOL_CATEGORIES: ToolCategoryMeta[] = [
  {
    id: "sync",
    label: "Sync",
    blurb: "Detect code↔KB misalignment and coordinate the sync state surfaced in this dashboard.",
  },
  {
    id: "authoring",
    label: "Authoring",
    blurb: "Write, scaffold, import, and tag KB content.",
  },
  {
    id: "governance",
    label: "Governance",
    blurb: "Conform code to standards, bootstrap, migrate, and upgrade the KB.",
  },
  {
    id: "introspection",
    label: "Introspection",
    blurb: "Read-only queries over the KB and its history.",
  },
];

export const TOOL_CATALOG: ToolCatalogEntry[] = GENERATED_TOOL_CATALOG;

export function toolsByCategory(category: ToolCategory): ToolCatalogEntry[] {
  return TOOL_CATALOG.filter((t) => t.category === category);
}

export function findTool(name: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}
