---
description: Audit the KB-MCP system for legacy residue (obsolete conventions, ghost references, dead presets) and produce a fix plan. Read-only — no edits.
argument-hint: "[scope]  e.g. 'foundation' or 'tech-stack' or leave empty for a full sweep"
---

# Legacy-Residue Audit

You are auditing the KB-MCP system at [knowledge/_mcp/](knowledge/_mcp/) for **legacy residue** — assumptions, paths, types, and conventions from earlier iterations that the system still references but no longer reflects reality.

This is the failure mode you are hunting:

> The `foundation/` folder convention was migrated to `standards/code/`, but several call sites in the MCP still hardcoded `foundation/` — including `INTENT_FOLDER_CONVENTIONS`, the `init.js` fallback scaffold, the `kb-paths.js` REMOVED_TYPES hint, and `lint-standalone.js` depth policy. The MCP then surfaced `expected_folder: foundation/` to agents as if it were ground truth, causing one agent to *move* a canonical file into the obsolete folder. Hardcoded preset opinion was indistinguishable from project-declared convention.

Scope: $ARGUMENTS (if empty, run the full sweep below).

## Read-only contract

**This command is diagnostic only.** Do NOT edit files, do NOT run `git mv`, do NOT modify `_rules.md`. Produce a written report with concrete fix recommendations the user can approve before any change.

If you find yourself wanting to "just fix" something while auditing — stop, log the finding, move on. The whole point is to surface everything *before* anyone acts.

## What to check (categories)

For each finding, capture: **file:line**, the legacy string, the apparent successor (if any), and a one-line root cause.

### 1. Obsolete folder / path conventions
- Grep the MCP source (`knowledge/_mcp/**/*.{js,json,md,yaml}`, excluding `node_modules/`) for any hardcoded folder name that no longer matches the canonical layout. Start with whatever scope arg was given; otherwise sweep for: `foundation/`, `capabilities/`, and any folder name appearing in `REMOVED_TYPES` (in [knowledge/_mcp/lib/kb-paths.js](knowledge/_mcp/lib/kb-paths.js)).
- Cross-check the actual `knowledge/` top-level dirs against the `INTENT_FOLDER_CONVENTIONS` map values in [knowledge/_mcp/lib/pattern-audit.js](knowledge/_mcp/lib/pattern-audit.js). Any map value that doesn't correspond to a real folder is suspect.
- Cross-check `depth_policy.overrides` and `never_group` in [knowledge/_mcp/scripts/lint-standalone.js](knowledge/_mcp/scripts/lint-standalone.js) and [knowledge/_rules.md](knowledge/_rules.md) — both should mention only folders that exist.

### 2. Ghost kb_targets in code (not just _rules.md)
- For every hardcoded string literal in MCP source that looks like a KB path (`<folder>/<name>.md`), check whether the file exists in `knowledge/`. Flag the misses. (The `kb_drift` tool already covers `_rules.md`; this category covers hardcoded targets baked into JS, fallback scaffolds, templates, and test fixtures.)

### 3. Preset / scaffold drift
- Compare what [knowledge/_mcp/tools/init.js](knowledge/_mcp/tools/init.js) scaffolds (fallback `code_path_patterns`, preset selection) against the current canonical structure. Mismatches mean every newly initialized project starts wrong.
- Walk [knowledge/_mcp/presets/](knowledge/_mcp/presets/) and verify each preset's `kb_target` values point at folders that exist (or are at least named in `INTENT_FOLDER_CONVENTIONS`).

### 4. REMOVED_TYPES / DEPRECATED markers
- Any object literally called `REMOVED_TYPES`, `DEPRECATED_*`, `LEGACY_*`, or commented `// removed`, `// deprecated`, `// legacy`, `// old` is a flag to read. For each: is the hint string still accurate, or does it reference further-removed paths?

### 5. Test fixtures that snapshot obsolete state
- Files under [knowledge/_mcp/tests/fixtures/](knowledge/_mcp/tests/fixtures/) (especially `current/` and `baseline/`) are point-in-time snapshots. Grep them for any term in your scope arg (or for `foundation/`, `capabilities/`, etc. in the full sweep). Flag — but **do not regenerate** unless the user explicitly asks. Fixtures may be intentionally frozen.

### 6. Findings without provenance
- In [knowledge/_mcp/lib/pattern-audit.js](knowledge/_mcp/lib/pattern-audit.js), every `findings.push({...})` site emits a diagnostic to the agent. Each finding should carry a `source:` field (e.g. `'preset'`, `'_rules.md'`, `'_index.yaml'`) so the agent can tell preset opinion apart from project-declared rules. Flag any finding type missing `source:`.
- Mirror this for other diagnostic-producing tools: search for `findings.push`, `diagnostics.push`, `warnings.push`, `issues.push` across `knowledge/_mcp/**/*.js`. Any push without provenance is a future single-signal-anchoring trap.

### 7. Template prose vs. structural truth
- Files under [knowledge/_templates/](knowledge/_templates/) contain example/illustrative text. Grep for mentions of folder paths (`*/...md`). For each: is this prose load-bearing (something else parses it) or illustrative? If illustrative, flag any mention of an obsolete folder name — these are the exact bait that misled an agent before.

### 8. Imports / exports of removed symbols
- Run `grep -rn "require.*kb-paths\|require.*pattern-audit" knowledge/_mcp/` and verify every destructured symbol still exists in the exporter. A `const { foo } = require('./kb-paths')` where `foo` was deleted is silently `undefined`.

## How to report

Produce a single Markdown report with this structure:

```
# Legacy-Residue Audit — <scope>

## Summary
- N findings across M categories. K critical (false ground-truth surfaced to agents).

## Findings

### [CRITICAL|HIGH|MED|LOW] <one-line title>
**Where:** file:line
**What:** the offending string / construct
**Why it's wrong:** what changed and when, if known
**Successor:** the current canonical equivalent (if any)
**Fix:** specific edit (one line if possible)

(repeat per finding)

## Suggested fix plan
1. Grouped edits by file
2. Test impact (which tests need updating)
3. Data migration (folders to move/delete, _rules.md cleanup)
4. Order of operations (what depends on what)
5. Rollback notes
```

Severity rubric:
- **CRITICAL** — the MCP surfaces this as ground truth to agents (e.g. `expected_folder` in drift findings). One bad signal → wrong agent action.
- **HIGH** — affects newly initialized or scaffolded projects (presets, init fallback). Silent ongoing damage.
- **MED** — internal inconsistency that confuses readers but doesn't drive agent behavior.
- **LOW** — cosmetic / commentary drift.

## Anti-patterns to avoid in your own audit

- **Single-signal anchoring.** Do not call something "legacy" because *one* template mentions a newer name. Require ≥2 corroborating signals (file location + active mapping + presence in `_index.yaml` + count of references) before calling something obsolete.
- **Action creep.** This command is read-only. If you catch yourself drafting an Edit call, stop — log the finding instead.
- **Fixture rewriting.** Snapshots may be intentional. Flag, don't regenerate.

## When to stop and ask

Stop and ask the user (via AskUserQuestion, not a todo item) if:
- A "legacy" string has substantial active use — removing it could break consumers.
- You can't tell whether a folder is obsolete or just empty-by-design.
- A REMOVED_TYPES hint references a path that itself looks obsolete (cascading removal).
