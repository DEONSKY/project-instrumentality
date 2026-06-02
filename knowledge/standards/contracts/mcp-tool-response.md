---
id: mcp-tool-response
type: standard
kind: stack-local
app_scope: all
topic: mcp-contract
created: 2026-05-21
tags: [mcp, contract, response, two-phase]
rules:
  - id: phase-1-prompt-field
    title: Two-phase tool Phase 1 responses must include a top-level `prompt` field
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/tools/drift.js"
        - "knowledge/_mcp/tools/conform.js"
        - "knowledge/_mcp/tools/scaffold.js"
        - "knowledge/_mcp/tools/import.js"
        - "knowledge/_mcp/tools/export.js"
        - "knowledge/_mcp/tools/issue.js"
        - "knowledge/_mcp/tools/extract.js"
        - "knowledge/_mcp/tools/migrate.js"
    detect:
      kind: llm
      hint: |
        Find every Phase 1 return path in two-phase tools (the branch taken when no
        `submit_*` argument is present). Verify the returned object includes a `prompt`
        field at the top level — not nested inside `data`, `result`, or `payload`.
    fix_hint: |
      Move the prompt to the top-level key `prompt`. Agents look for it there per
      [[integrations/claude-code-mcp]].
    description: |
      Two-phase tools rely on the agent reading `prompt` from a known location.
      Nesting it under `data.prompt` or `result.prompt` breaks every existing
      consumer and is not detectable until runtime.
    why: |
      The two-phase contract documented in [[decisions/two-phase-mcp-tools]] is a
      hard interface, not a convention. Agents do not introspect the response shape;
      they read `response.prompt` directly.
    examples: []
    exceptions: []

  - id: phase-2-gap-check
    title: Phase 2 must verify completeness against the Phase 1 `requested_*` payload
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/tools/conform.js"
    detect:
      kind: llm
      hint: |
        Find Phase 2 handlers that accept `submit_judgments` (or equivalent). Confirm
        each one cross-references the requested triples and returns `gaps[]` if any
        are missing — rather than silently advancing the queue.
    fix_hint: |
      Compute the set difference between `requested_evaluations` and `submit_judgments`.
      Return `{ gaps: [...] }` if non-empty. Do not write queue updates until gaps = [].
    description: |
      Phase 1.5 gap-checking is the reason two-phase exists. Silently accepting
      partial coverage defeats the contract.
    why: |
      Without gap checking, an agent that times out mid-evaluation can close the
      queue having only judged half the requested rules — and the remaining rules
      look "resolved" until the next sweep.
    examples: []
    exceptions: []

  - id: error-envelope-shape
    title: "Tool errors must use `{ isError: true, content: [...] }` not bare exceptions"
    severity: warn
    applies_to:
      paths:
        - "knowledge/_mcp/tools/**/*.js"
    detect:
      kind: regex
      pattern: 'throw\s+new\s+Error\('
    fix_hint: |
      Catch at the tool boundary and return `{ isError: true, content: [{ type: "text", text: msg }] }`.
      A bare throw becomes a JSON-RPC -32603, which the agent cannot inspect cleanly.
    description: |
      MCP errors should be surfaced as tool-level errors so the agent can pattern-match
      on the message rather than parsing an opaque transport error.
    why: |
      Per [[integrations/claude-code-mcp#error-mapping]], the agent's recovery logic
      branches on the error envelope. Bare throws collapse all failures into one
      bucket.
    examples: []
    exceptions:
      - paths:
          - "knowledge/_mcp/tools/init.js"
        reason: "init.js runs before the tool framework is ready; throws are appropriate"
---
