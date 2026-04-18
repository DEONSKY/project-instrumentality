# Knowledge Base Instructions

This project uses a structured Knowledge Base (KB) managed by the KB-MCP server. The KB is the **single source of truth** for project architecture, features, conventions, and standards.

## Before answering any question about the project

- **Always** call `kb_ask` with the user's question before providing an answer
- Do not answer from memory or general knowledge when KB documents exist
- If `kb_ask` returns no context, inform the user and offer to search with different keywords

## Before writing or modifying code

- Call `kb_get` with relevant keywords to load context about the feature/area you are working on
- Use `task_context` to get the most relevant files:
  - `kb_get({ keywords: [...], task_context: "creating" })` — when writing new code
  - `kb_get({ keywords: [...], task_context: "fixing" })` — when fixing bugs
  - `kb_get({ keywords: [...], task_context: "reviewing" })` — when reviewing code
- Follow the standards and conventions documented in the KB
- If a KB file specifies patterns, dependencies, or constraints, respect them

## After making code changes

- Run `kb_drift` to detect if your code changes diverge from KB documentation
- If the KB needs updating to reflect your changes, use `kb_write` to keep documentation in sync
- Do not leave code and KB in a contradictory state

## After creating or updating KB files

- Run `kb_autotag` on the file to extract searchable tags from its content
- Tags are critical for discoverability — files without tags are invisible to `kb_get` keyword search
- Example: `kb_autotag({ file_path: "features/user-auth.md" })`

## When creating new features or components

- Use `kb_scaffold` to create new KB documents from templates
- Check existing KB files for related features to maintain consistency
- Add `[[wikilinks]]` to reference related KB documents

## Before creating new KB files

- Check the KB structure: valid folders are defined in `_rules.md` under `depth_policy.overrides`
- Use `kb_scaffold` to create files — it enforces the correct folder and template
- Create **separate files per topic** — never combine multiple features/flows into one document
- Read 2-3 existing files in the target folder first to match the style and granularity
- Feature files describe **what** (fields, rules, constraints) — no code, no endpoints, no class names
- Flow files describe **who does what** — actor -> action -> outcome steps, no technical wiring
- Standard files describe **how** (architecture, patterns, code conventions)
- Match the `type` frontmatter field to the folder (features/ -> feature, flows/ -> flow, etc.)
- Fill ALL `{{placeholders}}` before saving — especially in `always_load` files
- Use `[[folder/file-id]]` wikilinks when referencing other KB documents

## KB Tool Reference

| Tool | Purpose |
|------|---------|
| `kb_ask` | Ask questions about the project — always try this first |
| `kb_get` | Load relevant KB files for context before coding |
| `kb_write` | Create or update KB documentation |
| `kb_drift` | Detect divergence between code and KB |
| `kb_scaffold` | Create new KB files from templates |
| `kb_reindex` | Rebuild the KB index after manual edits |
| `kb_autotag` | Auto-extract tags from KB content for better search |
| `kb_autorelate` | Discover relations between KB files |
| `kb_impact` | Analyze impact of a change across the KB |
| `kb_export` | Export KB content to various formats |
| `kb_lint` | Validate KB file structure (runs automatically) |

## Tool output policy

- If a tool result is truncated and saved to a file, you MUST read the full file before proceeding.
- Never write KB content without first following the fill prompt returned by `kb_scaffold`.
- When `kb_scaffold` returns `related_kb_files`, call `kb_get` to load them before filling the template.

## Key principle

When code and KB disagree, **present both values to the user and ask which is correct** before modifying either side. Never resolve a discrepancy silently.

- **KB drift** (KB changed, code didn't) → KB is likely correct; suggest updating the code.
- **Code drift** (code changed, KB didn't) → code is likely correct; suggest updating the KB.

In both cases, wait for explicit user confirmation before making changes.
