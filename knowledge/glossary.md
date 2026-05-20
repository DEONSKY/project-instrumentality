---
id: glossary
type: reference
aliases: [glossary, terminology, vocabulary]
cssclasses: [kb-reference]
app_scope: all
owner: kb-mcp
created: 2026-05-21
tags: [glossary, terminology, reference]
---

<!--
  GLOSSARY = canonical project terminology, one entry per term.
  Add a term here the first time it appears in any KB file with a non-obvious meaning.
  Use [[glossary#term]] to link from other docs when the term is load-bearing.
  Do NOT duplicate definitions across feature files — link here instead.
-->

## How to use this file

When a term in the KB is ambiguous, project-specific, or overloaded, define it here once and link to it from other docs with `[[glossary#term-name]]`. Keep entries short — one sentence of definition, optional second line of nuance.

## Terms

### Aspirational sweep

A retroactive run of `kb_conform` that scans the whole codebase against a tightened standard, writing entries to `sync/standards-backlog.md`. Advisory only — these entries surface when a developer next touches an affected file, not as a blocker.

### Baseline

The git ref used by `kb_drift` to compute the diff window. Resolved via graduated fallback: upstream tracking ref → `<remote>/<branch>` → closest parent branch via merge-base → skip with warning.

### Conformance

Whether code follows the architectural rules in `standards/`. Distinct from **drift** (whether the KB describes what the code actually does). Conformance is *non-functional*; drift is *functional*.

### Drift

A divergence between code and the KB. **Code drift** = code changed but KB still describes the old behaviour. **KB drift** = KB changed but code still implements the old spec. Both are tracked in `sync/`.

### Folder note

An Obsidian-plugin convention where a folder's overview page is named after the folder itself (`features/billing/billing.md`). Replaces the legacy `_group.md` convention.

### Group

A KB file with `type: group` that defines a domain boundary inside a type folder. Member files reference the group; the group file describes the domain. Not used at the top-level type folders.

### MCP

Model Context Protocol — the protocol KB-MCP speaks to agents like Claude Code, Cursor, Windsurf. No API key is exchanged; the server returns prompts and context, the agent reasons.

### Phase 1 / Phase 2

The two-phase MCP pattern. Phase 1: the server gathers context and returns a prompt. Phase 2: the agent submits the result, the server writes. Used by `kb_drift`, `kb_conform`, `kb_import`, `kb_scaffold`, `kb_export`, `kb_issue`, `kb_extract`, `kb_migrate`.

### Promotion

A `kb_conform` Phase 2 verdict that records intent to elevate a rule's reach (e.g. tighten its `applies_to.paths`) without modifying the standard itself. Senior-dev review via `kb_inventory.pending_promotions`.

### Queue file

A markdown file under `sync/` that tracks unresolved drift or conformance findings. Entries are added by Phase 1 detection and removed by Phase 2 resolution. Append-only audit lands in `sync/drift-log/YYYY-MM.md`.

### Rule (standards rule)

A single conformance check inside a standard's `rules:` YAML array. Has an `id`, `applies_to.paths`, a `detect` strategy (`llm`, `regex`, `ast-grep`), and severity. Exceptions are scoped per-rule, not per-standard.

### Standard

A file under `standards/<group>/` describing one architectural rule set. `<group>` is one of `code`, `contracts`, `knowledge`, `process`. Backed by a YAML rule list that `kb_conform` evaluates.

### Submodule (in this project)

A git submodule whose KB is either **owned** (its own `knowledge/` folder, drift detection runs there) or **shared** (covered by the parent's KB). `kb_sub status` distinguishes the two.

### Two-phase tool

See [[#Phase 1 / Phase 2]].

### Wikilink

`[[path/to/file]]` or `[[path/to/file#section]]` — the link format used throughout the KB. Resolved by `kb_get`, validated by reindex, and rendered by Obsidian. Always relative to `knowledge/`.

> [!info] Adding a term
> Append alphabetically. Use sentence case for the heading. Link to related terms with internal anchors (`[[#term-name]]`) — Obsidian and `kb_get` both follow them.
