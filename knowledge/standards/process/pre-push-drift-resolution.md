---
id: pre-push-drift-resolution
type: standard
kind: stack-local
app_scope: all
topic: pre-push-workflow
created: 2026-05-21
tags: [process, drift, pre-push, git-hooks, workflow]
rules:
  - id: empty-queues-before-push
    title: Both drift queues must be empty before `git push` is allowed to complete
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/lib/git-hooks.js"
        - ".git/hooks/pre-push"
    detect:
      kind: llm
      hint: |
        Confirm the pre-push hook calls `kb_drift` Phase 1, then checks both
        `sync/code-drift.md` and `sync/kb-drift.md` for new entries, and exits
        non-zero if either has open entries. Look for code paths that exit zero
        without checking both queues.
    fix_hint: |
      Read both queue files after Phase 1. Count open entries (status: open or
      empty). If count > 0, print the queue paths and exit non-zero.
    description: |
      The pre-push hook is the chokepoint for drift accountability. Letting a push
      through with open drift entries makes the queue a wishlist instead of a gate.
    why: |
      Documented in [[specs/flows/drift-resolution]] step 6. Skipping the check has
      historically caused weeks of accumulated drift because nobody felt the
      friction of the queue.
    examples: []
    exceptions: []

  - id: dismissed-requires-reason
    title: Phase 2 `dismissed` verdicts must include a reason captured in the audit log
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/tools/drift.js"
        - "knowledge/_mcp/tools/conform.js"
    detect:
      kind: llm
      hint: |
        Find Phase 2 close handlers for status=dismissed. Confirm they validate
        the `reason` argument is non-empty BEFORE removing the queue entry and
        writing the audit row.
    fix_hint: |
      Validate `reason` early. If empty, return an error envelope rather than
      writing a dismissal with no justification.
    description: |
      The drift-log is the only record of why an entry was closed. A dismissal
      without a reason is indistinguishable from an accidental close.
    why: |
      Aligned with [[data/validation/drift-entry-shape#dismissed_reason]]. Audits
      have surfaced cases where a dismissed entry's intent was lost within a quarter
      because the reason field was empty.
    examples: []
    exceptions: []

  - id: submodule-warning-not-skip
    title: Submodule remote mismatches must be warned about, not silently skipped
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/lib/submodule-sweep.js"
        - "knowledge/_mcp/tools/drift.js"
    detect:
      kind: llm
      hint: |
        Find any code path that returns early or continues a loop when a submodule's
        remote name doesn't match. Confirm a warning is printed (or returned in the
        Phase 1 response) before skipping.
    fix_hint: |
      Emit a warning that names the submodule path AND prints the fix command
      (`git config -f .gitmodules submodule.<name>.remote <correct>`). Then skip.
    description: |
      A silently skipped submodule looks identical in the queue to a submodule with
      no drift. The user has no signal that detection is incomplete.
    why: |
      This rule encodes the lesson from the production incident referenced in
      [[standards/code/baseline-resolution#never-default-to-head]] — silent skips
      are the highest-cost failure mode in drift tooling.
    examples: []
    exceptions: []
---
