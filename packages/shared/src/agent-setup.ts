/**
 * Copy-pasteable MCP client configurations for the kb-mcp server.
 *
 * Each snippet uses a `${KB_ROOT}` placeholder that the Capabilities views
 * substitute with the actual workspace path before rendering. The structure
 * mirrors the standard MCP client config formats; agents and IDEs that
 * follow the protocol pick up the server via this single registration.
 */

export interface AgentClientSnippet {
  id: "claude-code" | "claude-desktop" | "cursor";
  label: string;
  /** Path or label of the config file the user pastes into. */
  configFile: string;
  /** What to do with the snippet. */
  instructions: string;
  /** Raw text to paste. May contain ${KB_ROOT}. */
  snippet: string;
}

export const AGENT_SETUP_SNIPPETS: AgentClientSnippet[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configFile: "~/.claude.json",
    instructions:
      "Add this entry under \"mcpServers\" in your ~/.claude.json (create the key if absent), then restart Claude Code.",
    snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    configFile:
      "~/Library/Application Support/Claude/claude_desktop_config.json (macOS) · %APPDATA%/Claude/claude_desktop_config.json (Windows)",
    instructions:
      "Add this entry under \"mcpServers\", then fully quit and relaunch Claude Desktop.",
    snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    configFile: "\${KB_ROOT}/.cursor/mcp.json",
    instructions:
      "Create .cursor/mcp.json in this project (or merge with the existing file) and reload Cursor.",
    snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`,
  },
];

export function renderSnippet(template: string, kbRoot: string | null): string {
  // Empty-string fallback keeps the rendered block syntactically valid JSON
  // for users browsing without a detected KB root.
  return template.split("${KB_ROOT}").join(kbRoot ?? "<path-to-your-kb-root>");
}
