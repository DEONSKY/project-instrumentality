---
id: drift-resolution
type: flow
aliases: [drift-resolution, drift-loop, phase-2-close]
cssclasses: [kb-flow]
app_scope: all
depends_on:
  - specs/features/bidirectional-drift-detection.md
  - decisions/two-phase-mcp-tools.md
owner: kb-mcp
created: 2026-05-21
tags: [drift, flow, phase, queue, audit]
---

<!--
  FLOW FILES = business process steps, not implementation traces.
  Describe who does what and when.
-->

## Description

The drift-resolution flow runs every time a developer prepares to push a branch. Phase 1 (detection) is automatic from the git pre-push hook; Phase 2 (resolution) is a deliberate developer action through the agent. The flow always ends with an entry in the audit log.

## Steps

1. Developer → `git push` → pre-push hook runs `kb_drift` Phase 1 with the resolved baseline.
2. `kb_drift` writes new entries to `sync/code-drift.md` (code→KB) and `sync/kb-drift.md` (KB→code).
3. If either queue file gained entries, the push is paused; the hook prints the queue paths and instructions.
4. Developer opens the queue in the agent → reviews each entry → submits a Phase 2 verdict (`summaries`, `reverted`, `kb_confirmed`, or `dismissed`).
5. `kb_drift` Phase 2 removes the entry from the queue and appends an audit row to `sync/drift-log/YYYY-MM.md` with the verdict and reason.
6. Developer re-runs `git push`. If the queue is empty, the hook allows the push through.

## States

| state | description | terminal |
| ----- | ----------- | -------- |
| open | Phase 1 wrote the entry; awaiting human verdict | no |
| summaries | KB was updated to match the new code reality | yes |
| reverted | The code change was a mistake; reverted in a follow-up commit | yes |
| kb_confirmed | KB change reviewed; existing code already matches | yes |
| dismissed | Intentional drift; reason captured in audit log | yes |

> [!important] Guards
> - Pre-push hook must be installed (`kb_init` writes it). Without the hook, drift is detectable but not blocking.
> - Baseline resolution must succeed. A `skip with warning` outcome means the queue is empty for a different reason than "no drift" — read the warning.
> - Phase 2 verdict must include a reason for `dismissed` (audit-trail requirement).

> [!warning] Edge cases
> - A renamed file/folder produces one linked entry, not two. Resolving the rename's entry closes both sides of the rename.
> - If the developer force-pushes around the hook, no detection runs and the queue stays at whatever Phase 1 last wrote.

> [!question] Open questions
> - [ ] Should the hook also fire on `git push --tags` even when no branch ref is pushed?

## Used by

- [[specs/features/bidirectional-drift-detection]]
- [[standards/process/pre-push-drift-resolution]]
