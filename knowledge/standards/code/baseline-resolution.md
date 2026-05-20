---
id: baseline-resolution
type: standard
kind: stack-local
app_scope: all
topic: drift-baseline
created: 2026-05-21
tags: [drift, baseline, git, fallback]
rules:
  - id: graduated-fallback-order
    title: Baseline must resolve via the documented graduated fallback chain
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/lib/git-ops.js"
        - "knowledge/_mcp/tools/drift.js"
    detect:
      kind: llm
      hint: |
        Look for any baseline-resolution code path that picks a fallback in a different
        order than: (1) upstream tracking ref, (2) <remote>/<branch>, (3) closest parent
        branch via merge-base across all remote branches, (4) skip with explicit warning.
        Flag any silent skip (no warning emitted).
    fix_hint: |
      Reorder fallbacks to match the documented chain. Ensure a skip ALWAYS emits a
      warning that names which fallback failed.
    description: |
      Baseline resolution is the foundation of every drift detection run. If the
      baseline is wrong, the diff window is wrong, and every queue entry written
      from that run is suspect. The fallback chain is documented in the user-facing
      README and in [[specs/features/bidirectional-drift-detection]] — code must
      match documentation, in that order, with explicit warnings on skip.
    why: |
      A silent skip produces an empty queue, which looks identical to "no drift."
      Users have shipped broken PRs because the hook was silently skipping a
      submodule with a mismatched remote. Every skip MUST emit a warning that
      names the resolution step that failed.
    examples: []
    exceptions: []

  - id: never-default-to-head
    title: Baseline must never default to the literal string "HEAD"
    severity: error
    applies_to:
      paths:
        - "knowledge/_mcp/**/*.js"
    detect:
      kind: regex
      pattern: 'baseline\s*=\s*["\x27]HEAD["\x27]'
    fix_hint: |
      Resolve baseline to a concrete ref (upstream, remote/branch, or merge-base).
      If none are available, throw — do not fall back to HEAD.
    description: |
      "HEAD" as a baseline means "diff the current commit against itself," producing
      no entries. This is indistinguishable from a clean run. Treat it as an error.
    why: |
      Caught in production: a refactor introduced `baseline = baseline || "HEAD"`,
      which made every drift run pass silently for two weeks until a customer noticed
      their KB was stale.
    examples: []
    exceptions: []
---
