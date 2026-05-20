---
id: integration-claude-code-mcp
type: integration
aliases: [claude-code, mcp-client, agent-integration]
cssclasses: [kb-integration]
app_scope: all
depends_on:
  - decisions/two-phase-mcp-tools.md
owner: kb-mcp
created: 2026-05-21
tags: [integration, mcp, claude-code, agent, transport]
---

<!--
  INTEGRATION FILES = interface contracts with external systems.
  Endpoint paths, auth, request/response shapes, rate limits — all in scope.
  Implementation details (our class names, internal services) are out of scope.
-->

## Overview

Service: Claude Code (Anthropic CLI / IDE extension)
Purpose: Host the KB-MCP server as an MCP provider so the in-editor agent can call `kb_*` tools without any extra credentials.
Auth: none (stdio transport, local process)
Base URL: not applicable — the server runs as a child process of Claude Code over stdio

## Endpoints used

MCP communication is JSON-RPC over stdio. The agent calls tools by name; the server returns structured JSON results.

| method | path | purpose | request | response |
| ------ | ---- | ------- | ------- | -------- |
| tools/list | (rpc) | Discover available `kb_*` tools | `{}` | `{ tools: [{ name, description, inputSchema }] }` |
| tools/call | (rpc) | Invoke a `kb_*` tool | `{ name, arguments }` | `{ content: [{ type: "text", text: "<json>" }], isError? }` |
| prompts/list | (rpc) | Discover prompt templates (Phase-1 prompts surface here) | `{}` | `{ prompts: [{ name, description, arguments }] }` |
| prompts/get | (rpc) | Fetch a filled prompt template | `{ name, arguments }` | `{ messages: [...] }` |

## Events emitted

KB-MCP does not push events to Claude Code; communication is request/response. Side effects observable to the agent:

| event | when | payload |
| ----- | ---- | ------- |
| Reindex written | After every `kb_write` | New `_index.yaml` content visible on next file read |
| Queue file appended | Phase 1 of `kb_drift` / `kb_conform` | New entries in `sync/*.md` discoverable via filesystem reads |
| Audit log entry | Phase 2 close | New row in `sync/drift-log/YYYY-MM.md` |

## Webhooks received

Not applicable — stdio transport is request/response. Git hooks (pre-push, post-merge) installed by `kb_init` invoke the server from outside the agent, but that path is local CLI, not webhook.

## Error mapping

| external error | our error code | handling |
| -------------- | -------------- | -------- |
| `JSON-RPC -32602` (invalid params) | `INPUT_VALIDATION` | Surface to agent; let it retry with corrected args |
| `JSON-RPC -32603` (internal error) | `SERVER_FAULT` | Surface stack trace; do not auto-retry |
| Tool returns `isError: true` | `TOOL_ERROR` | Body contains `error.code` and `error.message`; agent decides recovery |
| Process killed (timeout, oom) | `TRANSPORT_LOST` | Claude Code restarts the server on next call; in-flight state is lost (this is why queue files are markdown, not in-memory) |

> [!caution] Rate limits
> No HTTP rate limit applies — local stdio. Practical limits:
> - Each `kb_get` call walks the KB tree; on a 10k-file vault expect ~100–300ms per call.
> - `kb_conform` Phase 1 may evaluate many files; consider `app_scope` filter to narrow.
> - The agent's own model has rate limits; two-phase tools double the round-trip cost (see [[decisions/two-phase-mcp-tools]]).

## Configuration

Add to `.claude/mcp.json` (or run `kb_init` — it writes this automatically):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge/_mcp/server.js"]
    }
  }
}
```

The path must be absolute. Relative paths break when Claude Code launches the server from its own working directory.

> [!question] Open questions
> - [ ] Should the server expose a `tools/progress` channel for long-running operations (`kb_import` on large PDFs)?
