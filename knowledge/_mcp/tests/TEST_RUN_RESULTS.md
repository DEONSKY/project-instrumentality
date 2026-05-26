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
| §A.3 | PASS with notes | All 6 sub-confirms exercised. Hooks (pre-commit/pre-push/post-merge/post-checkout) fire correctly. Findings: F20 (pre-push submodule guard blocked full auto-commit chain; plan didn't mention this precondition). pre-commit is WARN-not-BLOCK on lint errors. |
| §A.4 | PASS with notes | Preview→Published transition tested. Findings: F23 (plan assumes non-submodule code; 2-state model doesn't fit submodule case), F24 (bucket semantics are queue-file based, not git-commit based — plan §1.1 wording misleading). |
| §A.5 | PASS with notes | Aspirational sweep on admin-be.controller-delegates-to-service. 16 evaluations → 1 fail (HealthController) → dismissed. Findings: F25 (resolution verbs default to mode=current; aspirational backlog needs explicit mode arg). Plan A.5.1 expectation about immediate backlog population was wrong (same Phase 1→1.5→backlog flow as current). |
| §A.6 | PARTIAL | A.6.1–A.6.3 PASS (search, severity, group-by); A.6.4–A.6.6 BLOCKED at the time by F19 (Activity empty) — verifiable now that F19 fixed but not re-tested. Findings: F26 RESOLVED (empty section headers now hide on filter). Severity not shown per-entry — by design per §1.1 entry-badge list. |
| §A.7 | PASS with notes | A.7.1 banner+Got-it dismiss ✓, A.7.2 "?" re-show ✓, A.7.4 filter persists across reload. Findings: F27 RESOLVED (Obsidian grouping parity). Verdict-form draft persistence is "best-effort" per plan; not deeply tested. |
| §A.8 | PASS | Adding orphan pattern → 2 mapping-diagnostics entries (orphan_pattern + ghost_target) rather than 1 — better-than-spec detection. Removing pattern → entries cleared. |
| §A.9 | PASS | All 6 verbs exercised: Apply (admin-fe), Exempt (__test-fail), Promote (__test-fail-2), Dismiss (__test-fail-3), Acknowledge (kb-drift __test-only via kb_drift.acknowledge), Close promotion. Required ~10 commits to recreate fail entries between verbs. Activity tab shows all 6 events (F19 fixed). |
| §A.10 | PARTIAL | 4 verbs called: summaries ✓, reverted ✓, kb_confirmed ✓, dismissed ✓. Activity tab shows only 3 of 4 events — summaries event not visible in Activity OR drift-log for today. Recording as F28. |
| §A.11 | PARTIAL | A.11.1/2/5 pass; A.11.3/4 fail in VS Code (F29/F30); A.11.6 fails in Obsidian for standards-drift entries (F31); A.11.7 minor copy issue in Obsidian (F32); A.11.3 minor YAML editing limitation in Obsidian (F33). |
| §A.12 | PASS | Copy Prompt parity verified across all entry kinds (Code Drift target-missing, KB Drift, Standards Drift, Standards Backlog, Promotion, Lint, Mapping Diagnostic). Skipped "Code Drift target-exists" — couldn't generate one in this repo. |
| §A.13 | PARTIAL | A.13.1-A.13.4 pass (Capabilities panel, copy prompts, MCP snippets, Obsidian Info tab parity). A.13.5 fail: F35 (VS Code Publish Drift Queue command missing entirely). A.13.6 fail: F34 (Obsidian Publish button silently does nothing). |
| §A.14 | PASS | All 3 backends (clipboard, terminal, command) work as documented. Reverted to clipboard after. |
| §A.15 | PASS | A.15.1 verified: notifications.enabled toast appears with View button focusing sidebar. refreshIntervalSeconds + lint.command not retested (FYI per plan). |
| §A.16 | PASS with notes | A.16.1 pass on VS Code; F36 (Obsidian shows subset of lint entries, timing unclear). A.16.2 lint clears after fix. A.16.3: kb_write does not hard-reject illegal depth — depth surfaces as lint warn instead. Per user, this is acceptable behavior; plan wording could be loosened. |
| §A.17 | SKIPPED | MCP-down resilience test skipped per user — low priority. |
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

### F8 — VS Code header does not display HEAD short SHA — RESOLVED
- Severity: was UI parity break; resolved by user fix.
- Status: RESOLVED — VS Code header now shows the short SHA matching Obsidian.

### F9 — Detached submodule renders with no color — RESOLVED
- Severity: was UX gap; resolved by user fix.
- Status: RESOLVED — detached submodule now renders with distinct color/badge.

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

### F19 — Activity tab does not display drift-log events — RESOLVED
- Severity: was UI/data-flow gap (blocked §A.9.7 / §A.10.5); resolved by user fix.
- Status: RESOLVED — Activity tab now lists historical drift-log events. §A.9 and §A.10 round-trip verifications unblocked.

### F16 — Lint errors reported by `kb_extract` do not surface in extension Lint sections — RESOLVED
- Severity: was UI/data-flow gap; resolved by user fix.
- Status: RESOLVED — Lint section now displays entries (verified after user fix).

### F15 — `kb_extract` does not traverse submodule paths, and `source=knowledge` `paths` filter is broken — NEW
- Severity: tool bug (blocks §A.2 row 10/11 on this consumer repo)
- Symptom A (code source): `kb_extract({source: "code", paths: ["ms-linestop-admin-be/.../controller/health/**"]})` returned `"No source files found"` even though `HealthController.java` exists at that path. All code in this repo lives in submodules; `kb_extract` source=code appears unable to traverse them.
- Symptom B (knowledge source): `kb_extract({source: "knowledge", paths: "features"})` returned `"No KB files found. Run kb_init first, or pass paths=\"features\" to specify a subfolder."` — but `paths: "features"` is what I passed. Tried `paths: "specs/features"` — same error. The `paths` parameter appears broken for `source=knowledge`.
- Implication: Plan §A.2 rows 10–11 (`kb_extract` P1 and P2) cannot be exercised in this consumer repo. Workaround would require a non-submodule code path or fixing tool.
- Status: open — kb_extract needs submodule support and a working `paths` filter for `source=knowledge`.

### F26 — Accordion section headers remain visible when filter empties them — RESOLVED
- Severity: was minor UX nit; resolved by user fix.
- Status: RESOLVED — empty section headers now hide when search filter has no matches in that section.

### F27 — Obsidian grouping by Standard hid kb-drift entries while VS Code showed them — RESOLVED
- Severity: was cross-extension parity break; resolved by user fix.
- Status: RESOLVED — Obsidian now shows the same entries as VS Code under "no standard" group.

### F20 — Plan §A.3.2 doesn't mention submodule branch-guard precondition — NEW
- Severity: plan documentation gap
- Spec basis: §A.3.2: "pre-push runs kb_drift P1, writes to sync/code-drift.md, auto-commits chore(kb): update drift queue".
- Observed: On this repo (parent branch `__test/extension-plan`, submodules on `kb-mcp-boundary-validation`), pre-push hook blocked the push with "Submodule branch mismatch — push blocked." before reaching the kb_drift / auto-commit phase. This is the submodule branch guard at the top of the hook.
- Implication: Plan §A.3.2 expected behavior is only reachable when submodules are aligned with parent branch. For repos where submodules don't follow parent branch, the full auto-commit chain is untestable without aligning them.
- Also: per the hook source, the auto-commit only fires on **protected branches** (default main|master). On feature branches, pre-push runs detection in readonly mode — no fs writes, no auto-commit. Plan §A.3.2 conflates both code paths.
- Status: open — plan wording fix.

### F21 — VS Code reactive refresh appears slower than Obsidian (soft observation)
- Severity: uncertain — observation, not confirmed bug
- Symptom: After post-merge hook fired in §A.3.3, user noted VS Code may have needed manual refresh while Obsidian updated reactively. User uncertain.
- Status: observation only — not blocking. Could be timing-dependent.

### F23 — Plan §A.4 assumes non-submodule code; submodule case has 3 transitions
- Severity: plan documentation gap
- Spec basis: §A.4 specifies 2 states (preview → published) via 1 commit.
- Observed: For submodule-resident TARGET_CODE, the actual flow needs THREE git ops to fully transition: (1) edit in submodule, (2) commit in submodule, (3) commit submodule pointer bump in parent. Plan's 2-step model can't be applied directly.
- Status: open — plan should cover the submodule variant or scope itself to non-submodule code.

### F24 — Bucket semantics are queue-file based, not git-commit based — NEW
- Severity: plan-vs-implementation semantic mismatch
- Spec basis: §1.1 line 8: "Bucket headers inside Drift sections: 'Uncommitted preview' (working tree) vs 'Published' (committed)."
- Observed: A plain `git commit` of a KB or code file does NOT transition the preview entry to Published. The entry only moves to Published once `kb_drift` writes the entry to the queue file. Multiple sections (§A.2 row 22, §A.4.2) hit this — committing didn't change bucket placement; running `kb_drift` did.
- Refined definition: **Uncommitted preview** = drift detected by live-compute, not yet persisted to `sync/code-drift.md` or `sync/kb-drift.md`. **Published** = drift entry exists in the queue file (regardless of whether the queue file itself is committed to git).
- Implication: Plan §1.1 wording is misleading. Plan should redefine the buckets in terms of queue-file persistence, not git-commit state.
- Status: open — plan wording fix.

### F25 — kb_conform resolution verbs default to mode=current — NEW (minor)
- Severity: usability quirk (mitigated by good error message)
- Symptom: Calling `kb_conform({dismissed: [...]})` without `mode: "aspirational"` to close a backlog entry returned "No pending evaluations found for mode 'current'. Did you mean mode: 'aspirational'?" The error hint is helpful but the API requires explicit mode.
- Status: open — could be improved with automatic mode detection from queue_key, but not blocking.

### F28 — summaries event not surfaced in Activity tab / drift-log — NEW
- Severity: UI gap
- Spec basis: §A.10 specifies 4 events visible in Activity tab.
- Observed: After running `kb_drift({summaries: [{kb_target, summary}]})` in A.10.1, response showed `closed: [...]` and `filesChanged.written: [drift-log/2026-05.md]`. But Activity tab only shows 3 events (reverted, kb_confirmed, dismissed) for today; summaries event missing. Inspection of drift-log/2026-05.md shows only 3 entries dated 2026-05-26 — the summaries-only event isn't there.
- Possible cause: summaries verb may consolidate with subsequent close events on same kb_target (we ran summaries then reverted on health.md, both close the same target). Or the drift-log entry format may not generate an Activity tab card.
- Status: open — needs maintainer triage on whether summaries should emit its own event.

### F29 — VS Code "Edit Rule" button returns "entry not found (try refreshing)" — NEW
- Severity: UI bug
- Spec basis: §1.2 entry actions table: Standards Drift entries get "Edit Rule" button. §A.11.3: clicking should open standard file AND scroll to rule block.
- Observed: VS Code Edit Rule on `admin-be.controller-delegates-to-service` entry → error toast: "Instrumentality: entry not found (try refreshing)". Refresh doesn't fix. Obsidian's same button works (opens file but doesn't scroll to rule block, see F33).
- Status: open — VS Code UI fix needed.

### F30 — VS Code "Refine with Agent" button returns "entry not found (try refreshing)" — NEW
- Severity: UI bug (same root cause as F29 likely)
- Spec basis: §1.2 entry actions; §A.11.4: clicking should put `kb_write` prompt for the standard into clipboard.
- Observed: VS Code Refine with Agent on standards-drift entry → "entry not found (try refreshing)". Obsidian works and copies a well-formed prompt with rule context, triggering files, drift reason, existing rule body, and task instructions.
- Status: open — likely same fix as F29.

### F31 — Obsidian "Show diff" on standards-drift entries fails with "bad revision" — NEW
- Severity: UI bug
- Spec basis: §A.11.6: expanding Show diff disclosure should load diff content matching `git diff <since>..HEAD`.
- Observed: Obsidian Show diff on `admin-be.controller-delegates-to-service` entry shows error: `error: Command failed: git diff --no-color 13e665e^ -- ... HealthController.java\nfatal: bad revision 13e665e`. The base SHA `13e665e` is invalid in the `git -C` context (likely passed without the right repo prefix for submodule files). VS Code works correctly for the same entry.
- Diff works on non-standards entries (code-drift, kb-drift) for both extensions.
- Status: open — Obsidian's diff command construction for standards-drift entries uses wrong base resolution.

### F32 — Obsidian "Show prompt" disclosure doesn't support direct text copy — NEW (minor)
- Severity: minor UX
- Symptom: Show prompt disclosure renders the prompt text but the user cannot select-and-copy directly from the rendered text. Workaround: use the Copy Prompt button (works).
- Status: open — minor selectability fix.

### F33 — Obsidian Edit Rule doesn't preserve custom YAML rule format — NEW (minor)
- Severity: minor UX
- Symptom: User reports that editing rules in Obsidian via Edit Rule doesn't gracefully handle the rules block's YAML structure (which uses a specific schema). Details limited.
- Status: open — needs reproduction + maintainer triage.

### F34 — Obsidian "Publish" header button silently does nothing — NEW
- Severity: UI bug
- Spec basis: §A.13.6: "Obsidian: click header 'Publish' button — same publish behaviour observed (as VS Code Publish Drift Queue command — auto-commit appears in git log)."
- Observed: Obsidian's Publish button is visible in the header. Clicking it produces no toast, no error, no commit, no observable effect. Compare to VS Code where the publish command is missing entirely (F35).
- Status: open — Obsidian publish handler needs implementation/wiring.

### F35 — VS Code "Publish Drift Queue" command not registered — NEW
- Severity: UI bug
- Spec basis: §1.3: VS Code commands list includes `instrumentality.publishDrift`. §A.13.5: Command Palette → "Instrumentality: Publish Drift Queue" should run pipeline and auto-commit.
- Observed: User searched Command Palette for "Publish" / "Instrumentality: Publish" — no matches. The command appears not to be registered with VS Code at all.
- Status: open — VS Code extension needs to register the publishDrift command.

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
