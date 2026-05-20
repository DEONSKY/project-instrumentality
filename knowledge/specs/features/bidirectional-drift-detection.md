---
id: bidirectional-drift-detection
type: feature
aliases: [drift-detection, kb-drift, bidirectional-drift]
cssclasses: [kb-feature]
app_scope: all
depends_on:
  - decisions/two-phase-mcp-tools.md
  - data/schema/drift-queue.md
  - data/validation/drift-entry-shape.md
owner: kb-mcp
created: 2026-05-21
tags: [drift, sync, queue, phase, baseline]
---

<!--
  FEATURE FILES = business rules, field definitions, and requirements.
  This file describes WHAT bidirectional drift detection does for the user,
  not HOW the JS implements it.
-->

## Description

Bidirectional drift detection surfaces divergences between source code and the KB in both directions. When code changes without a matching KB update, the change is recorded as **code drift** (the KB may now be stale). When a KB file changes without the implementation following, it is recorded as **KB drift** (the code may now be stale). Both queues live as markdown under `sync/` so developers can resolve them with normal git-tracked edits.

## Fields

| field | label | type | required | default | validation | notes |
| ----- | ----- | ---- | -------- | ------- | ---------- | ----- |
| baseline_ref | Baseline git ref | string | yes | upstream → remote/branch → merge-base | [[data/validation/drift-entry-shape#baseline_ref]] | Resolved via graduated fallback |
| direction | Drift direction | enum(code→kb, kb→code) | yes | — | [[data/validation/drift-entry-shape#direction]] | One queue file per direction |
| entry_status | Entry lifecycle | enum(open, summaries, reverted, kb_confirmed, dismissed) | yes | open | [[data/validation/drift-entry-shape#entry_status]] | Phase 2 resolution types |
| rename_link | Linked rename annotation | string | no | — | — | Code rename: `← renamed from <path>`. KB rename: lists wikilinks needing update. |

## Business rules

- A single git diff window (baseline → HEAD) feeds both directions. Detection always runs in pairs — never one direction alone.
- File and folder renames are treated as one linked operation. A code rename annotates its drift entry with `← renamed from <old path>`; a KB rename surfaces every `[[wikilink]]` that now points at the old path, with a count and a file list.
- Stale `_rules.md` patterns (old path still matched, new path doesn't) are returned as `stale_patterns[]` warnings rather than silent skips.
- Submodules whose remote name differs from the parent are detected and warned explicitly — never compared against the wrong remote, never silently skipped.
- Phase 2 resolutions are not free-form. Code-drift entries close with one of `summaries` (KB now updated), `reverted` (the code change was a mistake), or `dismissed`. KB-drift entries close with `kb_confirmed` after a developer reviews the implementation.

> [!warning] Edge cases
> - **No upstream, no remote/branch, no merge-base**: detection skips with a warning rather than guessing. Empty queue ≠ no drift; it means baseline resolution failed.
> - **Submodule with mismatched remote name**: a fix command is printed so the user can correct `.gitmodules` rather than disabling drift for that submodule.
> - **Multi-level branch divergence (main→dev→feature)**: merge-base is computed across all remote branches so the closest parent is chosen, not literal `main`.

> [!question] Open questions
> - [ ] Should `dismissed` entries be re-surfaced if the same paths drift again, or are they permanently silenced?

## Used by

- [[specs/flows/drift-resolution]]
- [[standards/process/pre-push-drift-resolution]]
