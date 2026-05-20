---
id: decision-two-phase-mcp-tools
type: decision
aliases: [two-phase-tools, phase-1-phase-2-pattern]
cssclasses: [kb-decision]
app_scope: all
depends_on: []
owner: kb-mcp
created: 2026-05-21
tags: [architecture, mcp, prompt, agent, decision]
status: accepted
---

<!--
  DECISION FILES = architectural records, not implementation guides.
  Document the context, the choice made, alternatives, and trade-offs.
-->

## Context

The KB-MCP server is invoked by agents (Claude Code, Cursor) that have their own LLM. The server has no API key and no model of its own — every reasoning step happens on the agent side. Many KB operations (drift detection, conformance evaluation, scaffolding, importing documents) need *both* deterministic file-system work (reading the repo, gathering context, computing diffs) *and* generative reasoning (deciding whether a code change broke a KB invariant, filling a template from a one-line description).

If the server tried to do reasoning itself, it would need API keys and a model — defeating the "no API keys required" promise. If the server only ever returned data, the agent would have to do all the boring deterministic work in prompt loops, which is slow, expensive, and error-prone.

A pattern was needed that splits the deterministic and reasoning halves cleanly while keeping the whole interaction inside a normal MCP tool call.

## Decision

KB-MCP tools that need agent reasoning are implemented as **two-phase tools**:

- **Phase 1** (no `submit_*` argument): the server does deterministic work — reads files, gathers context, computes the diff window, runs cheap pre-filters — then returns a `prompt` field plus a structured `requested_*` payload describing what it needs the agent to think about.
- **Phase 2** (agent calls the same tool again with `submit_*`): the server validates the submitted reasoning against the Phase 1 payload, writes any resulting files, advances queues, and returns a confirmation.

The pattern is mandatory for tools whose output requires judgment that cannot be expressed as a deterministic rule. It is *not* used for tools that are purely deterministic (`kb_get`, `kb_write`, `kb_inventory`, `kb_export json`, `kb_autotag`).

## Alternatives considered

### Server-side LLM calls

Have the MCP server hold an Anthropic API key and call the model itself. **Not chosen** — it would require every user to provision and rotate an API key, double-bill them (their agent already calls a model), and prevent the server from running in fully air-gapped environments. It also conflates KB infrastructure with model choice; teams using Cursor want Cursor's model picker, not ours.

### One-phase tools that return raw context

Skip Phase 2 entirely. The agent reads the Phase 1 response, does the reasoning, then calls a separate `kb_write` to persist. **Not chosen** — without a Phase 2 verification step, the server cannot check that the agent's output covers every requested triple. `kb_conform` in particular relies on Phase 1.5 gap-checking; a one-phase pattern would silently accept partial coverage.

### Streaming / callback tools

The server opens a long-running stream and the agent pushes updates. **Not chosen** — MCP's request/response model does not have first-class streaming for tool calls, and the pattern would break the "agent is in control" invariant. Two discrete tool calls are also easier to inspect in transcripts and replay during debugging.

> [!info] Consequences
>
> **Positive:**
> - No API key required for KB-MCP itself; the agent's existing model handles all reasoning.
> - Phase 1.5 gap-checking is possible because the server remembers what it asked for.
> - Tool calls remain individually inspectable in agent transcripts — Phase 1 and Phase 2 each leave a separate record.
> - Deterministic pre-filters (regex, ast-grep, exception checks) avoid LLM round-trips entirely when they're sufficient.
>
> **Negative / trade-offs:**
> - Every two-phase tool is two MCP calls minimum, which adds latency for small operations.
> - The agent must be aware of the pattern and pass Phase 2 arguments correctly. Documentation cost is real.
> - Mid-conversation context loss between Phase 1 and Phase 2 can drop work; queue files mitigate this for the bigger flows but ephemeral tools (`kb_scaffold`, `kb_import` classic mode) remain vulnerable.
