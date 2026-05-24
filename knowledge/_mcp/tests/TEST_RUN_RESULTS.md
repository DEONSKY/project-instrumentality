# MANUAL_TEST_PLAN Scenario A — Interactive Co-Run Results

Live log. Untracked. Delete on cleanup (§A.18) or move out of repo when done.

- Date started: 2026-05-23
- Branch: `__test/extension-plan` (created from `kb-mcp-boundary-validation` @ `9840356`)
- MCP: local-source build (per user; version literal not surfaced by client)
- VS Code Instrumentality: v0.3.0
- Obsidian Instrumentality: v0.2.0 (later patched by user — see F1)

## Status by section

| Section | Status | Notes |
|---|---|---|
| §0 Pre-flight | PASS with notes | See findings F1–F6 below |
| §A.0 Targets | PASS with notes | Targets locked; F2 resolved on re-check; new F8/F9 from CONFIRM A.0 panel review |
| §A.1 | PASS | F4 (kb_status field-name shape); F10 (optional KB files absent — not blocking); F11 (rules_in_scope requires exact applies_to match) |
| §A.2 | PASS with notes | All 27 rows exercised. Findings: F13 (large responses), F14 (kb_impact false-negative), F15 (kb_extract submodule), F16 (lint not surfacing), F17 (drift target ambiguity), F18 (kb_conform ignores uncommitted), F19 (Activity tab disconnected from drift-log). MCP version confirmed 1.1.1 (row 27). |
| §A.3 | pending | |
| §A.4 | pending | |
| §A.5 | pending | |
| §A.6 | pending | |
| §A.7 | pending | |
| §A.8 | pending | |
| §A.9 | pending | |
| §A.10 | pending | |
| §A.11 | pending | |
| §A.12 | pending | |
| §A.13 | pending | |
| §A.14 | pending | |
| §A.15 | pending | |
| §A.16 | pending | |
| §A.17 | pending | |
| §A.18 | pending | |

## Findings

### F1 — Obsidian Mapping Diagnostics section did not render — RESOLVED
- Severity: bug (high — UI parity break with VS Code)
- Symptom: VS Code panel showed 9 mapping-diagnostics entries (matching `kb_drift.pattern_audit.findings`). Obsidian showed 0 / section absent.
- Resolution: User patched the Obsidian plugin source and reloaded. After reload both panels show 9 entries.
- Status: RESOLVED — re-verified by user during §0.

### F2 — Obsidian reactivity to branch change vs file-write — RESOLVED
- Severity: was UX divergence; now consistent
- Original symptom: After branch switch, VS Code showed 6 kb-drifts + 9 mapping diagnostics; Obsidian showed 0/0.
- Re-check at §A.0: After Obsidian rebuild, both extensions show the same "Uncommitted preview 6" bucket count plus 9 mapping diagnostics. Live-compute parity restored.
- Likely cause of original symptom: was bundled with the F1 render bug (Obsidian build was missing `runner/` / `_templates/` content per the user's plan update in Appendix A.5). Once those were copied in, live-preview computation also started working.
- Status: RESOLVED.

### F6 — `kb_status` does not surface `pattern_audit`
- Severity: design clarification
- Symptom: `kb_drift` response contains `pattern_audit.findings: [9 entries]`. The same project's `kb_status` shows `patternAudit: null`. Extensions display 9 mapping-diagnostics entries — so they're reading from `kb_drift` or a side-channel, not `kb_status`.
- Re-check (clean, queue files reverted): `kb_status.patternAudit: null` persists even when underlying `kb_drift` would return 9 findings.
- Implication: §A.1 sanity asserts `kb_status` shape but does not include pattern audit. If a user runs only `kb_status`, mapping diagnostics are invisible from that tool.
- Status: needs design clarification — is `kb_status` supposed to summarize mapping diagnostics, or is `kb_drift` the only entry point?

### F3 — `kb_status` returns queue-file state, not live compute
- Severity: design clarification (may be intentional)
- Symptom: Immediately after branch switch, `kb_status` returned all-zero counts despite a real drift state. Calling `kb_drift` explicitly produced 6 entries and wrote them to `knowledge/sync/{code,kb}-drift.md`.
- Implication: Anyone using `kb_status` for "what is currently drifting?" gets stale data unless `kb_drift` has been called since the last commit / branch change. Plan implicitly assumes `kb_status` is fresh.
- Status: server-side behavior; needs re-verification only to confirm the property still holds (not expected to change with extension fix).

### F4 — `kb_status` field names don't match plan §A.1 assertions
- Severity: doc-vs-implementation drift
- Plan expects: `head_sha`, `hooks_state`, `code_drift.count`, `kb_drift.count`, `standards_drift.count`, `conform_pending.count`, `promotions.count`, `lint.errors`, `lint.warnings`
- Actual: `currentHeadShort`, `hooks.health`, `codeDrift.entries[]`, `kbDrift.entries[]`, `standardsDrift.entries[]`, `conformPending.{current,aspirational}`, `promotions[]`, `lint.violations[]`, `totals.{lintErrors,lintWarnings,drifts,conformPending,promotions,grand}`
- Either the plan's §A.1 assertion list needs updating, or the MCP response should be normalized. Data is present in both shapes.
- Status: server-side response shape; not affected by extension fix.

### F5 — `pattern_audit.unmapped_kb_group` count is environmentally sensitive
- Severity: documentation gap
- Symptom: `.obsidian/` unmapped count went from 2 → 24 between two `kb_drift` runs separated only by the user reloading the Obsidian plugin (which dropped `runner/node_modules/**/*.md` files into the vault).
- Implication: The plan asserts "9 mapping diagnostics" as a stable shape, but the per-entry `count` shifts with whatever lives in `.obsidian/`. Worth a note in §A.8 (Mapping diagnostics) so future runs know which numbers are stable vs environmental.
- Status: expected behavior; only the plan needs annotation.

## Pending re-checks (post-Obsidian-fix)
- [ ] F2 — Switch branches and observe whether Obsidian now auto-reacts (needs UI verification)
- [x] F3 — Re-checked cleanly after reverting queue files: `kb_status` shows zero entries despite the underlying commit `9840356` clearly diverging from baseline `12d3c38`. **Persists**. `kb_status` is strictly a queue-file aggregator. To see real drift state requires running `kb_drift` first.
- [x] F4 — Re-checked: field names still `currentHeadShort`, `hooks.health`, `codeDrift.entries`, `kbDrift.entries`, `lint.violations`, `totals.lintErrors/lintWarnings`. **Persists**.

## Targets (§A.0)

| Variable | Value |
|---|---|
| TARGET_CODE | `ms-linestop-admin-be/web-app/src/main/java/com/toyota/tme/linestop/admin/controller/health/HealthController.java` |
| TARGET_KB | `knowledge/specs/features/shift-handover.md` |
| PICK_A_DIR | `ms-linestop-admin-be/web-app/src/main/java/com/toyota/tme/linestop/admin/controller` |

- TARGET_CODE matches multiple `**/*Controller.java` and `**/controller/**` patterns in `_rules.md`; one of those patterns maps to `shift-handover.md` as KB target — so edits to TARGET_CODE will surface as code-drift entries referencing TARGET_KB (plus others).
- Pre-test submodule state for cleanup:
  - `ms-linestop-admin-be` HEAD = `96b6312ae91eb2bb6bdde83e70b6e932e9d1c200`, branch = `kb-mcp-boundary-validation`
  - Any commits made inside the submodule during §A.2 row 21 / §A.4 must be `git -C ms-linestop-admin-be reset --hard 96b6312`-ed during §A.18.

### F10 — Plan §A.1 assertions assume optional KB files exist — NEW
- Severity: plan portability nit (acknowledged by user as not blocking)
- Spec basis: §A.1 asserts `glossary.md` returned (unconditional) and `agent-rules.md`/`CLAUDE.md` returned (with "where applicable" caveat).
- Observed: Neither `knowledge/glossary.md` nor `knowledge/agent-rules.md` exist in this repo. `kb_get` returned only the always-load `global.md` for all keywords. `CLAUDE.md` lives at repo root and is structurally outside `kb_get`'s `knowledge/` scope.
- Resolution per user: These files should be optional by default. Plan wording should make the glossary assertion conditional like the agent one, OR plan should clarify they're expected-but-optional and the assertion is "if present, returned".
- Status: cosmetic — no test action required.

### F11 — `rules_in_scope` matches by exact applies_to path, not by code_path_patterns coverage — NEW
- Severity: plan ambiguity
- Spec basis: §A.1 line 3: "`<PICK_A_DIR>` is any directory in your project that is covered by a **code pattern in `knowledge/_rules.md`**...Assert `rules_in_scope` is a non-empty array."
- Observed: Using `ms-linestop-admin-be/.../controller` (covered by code_path_patterns like `**/*Controller.java`, `**/controller/**`) returned `rules_in_scope: []`. Going deeper to `.../controller/userdefinition` (matching `userdefinition/**` glob of user-definition-contract.md's parties.applies_to) also returned `[]`. Only passing an EXACT file path that matches a rule's own `applies_to.paths` (e.g. `.../feature/userdefinition/record/UserDefinitionRecord.java`) returned a rules_in_scope entry.
- Implication: `rules_in_scope` resolution is by exact rule-level applies_to match, not by code_path_patterns coverage and not by directory containment. Plan should clarify that PICK_A_DIR / working_paths must match a *rule's* applies_to, not a `_rules.md` code-pattern target.
- Status: open — plan wording fix needed; possibly also a `rules_in_scope` behavior question (should directory containment match rules whose applies_to is below the directory?).

### F8 — VS Code header does not display HEAD short SHA — NEW
- Severity: UI parity break
- Spec basis: §1.1 line 2: "Header: title · `HEAD: <short-sha>` · hooks badge..." applies to BOTH extensions.
- Observed: Obsidian header correctly shows `HEAD: 9840356`. VS Code header shows the branch name (`__test/extension-plan`) but no short-SHA element.
- Implication: Users on VS Code cannot quickly verify HEAD at-a-glance. Also breaks CONFIRM A.4.2 / A.3.2 verifications which read "HEAD short SHA updated in header".
- Status: open — UI fix needed in VS Code extension. Plan should clarify whether branch name + SHA both render, or one in place of the other.

### F9 — Detached submodule renders with no color — NEW
- Severity: UX gap
- Spec basis: §4 says "`advisory` and `detached` submodule alignment — covered by `kb_sub` unit tests; UI rendering uses identical mechanism to `aligned`/`blocking`."
- Observed: `ms-linestop-admin-fe` (`branch: null` per `kb_status`, i.e. detached HEAD) renders in both panels with no color/alignment indicator. Other owned submodules (mismatched branch) render red. Shared submodules also render red.
- Implication: The "identical mechanism" claim doesn't hold — detached needs its own color/badge (`detached`) like §1.1 line 9 lists as an entry-row badge.
- Status: open — either color-render for detached needs implementing, or §4 statement needs revising.

### F13 — Multiple tools return prompts that exceed MCP response token limit — NEW (expanded)
- Severity: tool usability bug
- Affected tools / sizes:
  - `kb_ask` `challenge:` → 66,504 chars (fail)
  - `kb_ask` `generate:` → 69,629 chars (fail)
  - `kb_ask` `query/brainstorm/onboard:` → ≈64K each (just under cap)
  - `kb_analyze` → 63,242 chars across 1,524 lines (fail; persisted)
  - `kb_conform` Phase 1 detect → 165,932 chars across 214 lines (fail; persisted)
- Implication: Several core kb_* tools that return agent-fillable prompts emit far too much embedded context. The agent has to fall back to reading the persisted file, breaking the streaming/inline UX. For `kb_conform` Phase 1 the prompt is 105KB alone — even a tight evaluation budget would help.
- Suggested fix: Cap the embedded context (truncate `kb_get` injected content per file), or paginate Phase 1 responses, or return only `requested_evaluations` and reference the prompt as a separate `prompt_path` for the agent to fetch.
- Status: open — server-side fix needed.

### F14 — `kb_impact` returned "No KB files matched" for a change clearly affecting documented KB — NEW
- Severity: needs investigation
- Symptom: Called `kb_impact({ change_description: "Renaming the field linestopMail to lineStopMail across UserDefinitionRecord, DTO, and FE consumption" })`. Returned `affected_files: []`, `message: "No KB files matched the change description."`
- Expected: `standards/contracts/user-definition-contract.md` explicitly references `UserDefinitionRecord` and `linestopMail` in its rules; should have matched.
- Possible explanations: (a) `kb_impact` uses literal keyword matching, not semantic, and `linestopMail` isn't tokenized the same way; (b) the depends_on graph doesn't connect this change to that contract file; (c) genuine matching bug.
- Status: open — needs investigation by kb-mcp maintainer. Re-test with a simpler description ("change to shift-handover feature") could help.

### F17 — Code-drift KB target ambiguous between specific and pattern-derived KB files — NEW
- Severity: design clarification / behavior question
- Spec basis: §1.2 entry actions table; §A.4 expectations.
- Observed: HealthController.java edit matched two `_rules.md` patterns:
  - `controller/health/**` → `specs/features/health.md` (specific, doesn't exist)
  - `**/*Controller.java` (and `**/controller/**`) → `specs/features/shift-handover.md` (general)
  Panel UI showed the code-drift entry under `specs/features/health.md` (the specific pattern, with "missing" badge). But `kb_drift` Phase 1 response listed the same change folded into the `shift-handover.md` kb-drift entry's `code_areas` field, with 0 code-drift entries returned.
- Implication: The UI's source-of-truth for code-drift→KB-target mapping may diverge from `kb_drift` tool output. Same code change is attributed to different KB targets depending on which view you trust.
- Status: open — needs design clarification on the precedence rule when a code file matches multiple patterns mapping to different KB targets.

### F18 — `kb_conform` Phase 1 ignores uncommitted files; no preview/published distinction — NEW (user-identified)
- Severity: UX gap (acknowledged by user)
- Spec basis: §1.1 line 8: "Bucket headers inside Drift sections: 'Uncommitted preview' (working tree) vs 'Published' (committed)."
- Observed: After writing scratch file `knowledge/specs/features/__test-only.md` (uncommitted, matches `validation-feature-doc-shape` rule's `applies_to.paths: [knowledge/specs/features/**]`), `kb_conform` Phase 1 evaluated 14 OTHER feature files but did NOT include `__test-only.md`. All evaluations were marked `source: "committed"`.
- Implication: User's working-tree edits aren't validated by `kb_conform` until commit, so issues only surface late. Conform should support a preview bucket like drift does, OR the plan should clarify that conform is committed-only.
- Status: open — server-side enhancement.

### F19 — Activity tab does not display drift-log events — NEW
- Severity: UI/data-flow gap (blocks §A.9.7 and §A.10.5 verification)
- Spec basis: §A.9.7 / §A.10.5: "all six events present in Activity tab" / "all four events present".
- Observed: After `kb_conform({applied: [...]})` succeeded and appended a `2026-05-23 · CONFORMED · applied` event to `knowledge/sync/drift-log/2026-05.md`, the Activity tab in both panels stayed empty. Pre-existing historic events from 2026-05-16 (`ACKNOWLEDGED`, `DISMISSED-CONFORM`) — already on disk in drift-log — are also not surfaced.
- Implication: Both panels are not reading drift-log into Activity. §A.9 and §A.10 round-trip verifications cannot complete without this. Either the panels read from a different file, or the drift-log subscription is broken.
- Status: open — UI fix needed.

### F16 — Lint errors reported by `kb_extract` do not surface in extension Lint sections — NEW
- Severity: UI/data-flow gap
- Symptom: `kb_extract` Phase 2 write of `standards/code/__test-extract.md` returned `lint_errors: 16` in its response. After auto-refresh, both extensions show the new file in KB Drift (correct), but Lint section remains empty in both panels.
- Implication: Lint issues only get displayed via certain trigger paths (likely `kb_status` with lint enabled, `kb_reindex`, or pre-commit hook), and `kb_extract`'s internal lint result is informational only — not persisted to whatever sync file the UI reads.
- Cross-check: prior `kb_status` calls returned `lint: { violations: [], ran: false }` — the `ran: false` flag suggests the lint subprocess may not be actually running even when not skipped.
- Status: open — needs §A.16 failure-paths re-test and / or maintainer triage.

### F15 — `kb_extract` does not traverse submodule paths, and `source=knowledge` `paths` filter is broken — NEW
- Severity: tool bug (blocks §A.2 row 10/11 on this consumer repo)
- Symptom A (code source): `kb_extract({source: "code", paths: ["ms-linestop-admin-be/.../controller/health/**"]})` returned `"No source files found"` even though `HealthController.java` exists at that path. All code in this repo lives in submodules; `kb_extract` source=code appears unable to traverse them.
- Symptom B (knowledge source): `kb_extract({source: "knowledge", paths: "features"})` returned `"No KB files found. Run kb_init first, or pass paths=\"features\" to specify a subfolder."` — but `paths: "features"` is what I passed. Tried `paths: "specs/features"` — same error. The `paths` parameter appears broken for `source=knowledge`.
- Implication: Plan §A.2 rows 10–11 (`kb_extract` P1 and P2) cannot be exercised in this consumer repo. Workaround would require a non-submodule code path or fixing tool.
- Status: open — kb_extract needs submodule support and a working `paths` filter for `source=knowledge`.

### F7 — Plan §A.18 cleanup doesn't account for submodule-resident code targets
- Severity: plan gap
- Symptom: All `_rules.md` code patterns in this repo point into submodules. The plan's §A.18 uses `git checkout -- <TARGET_CODE>` at the parent level, but for submodule-resident targets the parent's git only sees the submodule pointer, not the file. Cleanup needs `git -C <submodule> ...` commands, and the submodule's branch tip needs resetting if commits were made.
- Implication: Plan as written would leave the submodule in a modified state. Worth noting for any consumer repo with similar structure.
- Status: working around it with explicit submodule SHA capture / reset in §A.18.

## Working tree state during run
- Parent branch: `__test/extension-plan` @ `9840356`
- Submodules: still on `kb-mcp-boundary-validation` (not following parent — user accepted as expected)
- Stash @{0}: parent dirty state (modified submodule, untracked `MANUAL_TEST_PLAN.md`)
- Stash inside `ms-linestop-admin-be` @{0}: modified `ParameterAuditController.java`
- Queue files written by §0 `kb_drift`: `knowledge/sync/code-drift.md`, `knowledge/sync/kb-drift.md` (uncommitted; will revert in §A.18)
