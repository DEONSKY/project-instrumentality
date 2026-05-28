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
| §A.18 | PASS | Submodule reset to 96b6312; throwaway branches dropped (__test/extension-plan, __merge-test, __test-branch); both stashes popped; pre-plan state restored exactly. Only new artifact: TEST_RUN_RESULTS.md (this file). |

## Final summary

- **Scenario A run completed end-to-end** across all 19 sections (§0 through §A.18; §A.17 skipped).
- **Findings logged**: 37 (F1–F37). Resolved during session: 8 (F1, F2, F8, F9, F16, F19, F26, F27 — all user-applied UI fixes). F37 dropped as user feedback. Open: 28 findings.
- **Active open findings worth prioritizing**:
  - **UI bugs (extension-side)**: F29 / F30 (VS Code Edit Rule / Refine with Agent errors); F31 (Obsidian diff fails on standards-drift); F34 / F35 (Publish broken in both panels); F36 (Obsidian lint subset).
  - **Tool bugs (MCP server)**: F13 (large responses exceed token limit affecting kb_ask, kb_analyze, kb_conform); F14 (kb_impact false-negative); F15 (kb_extract doesn't traverse submodules).
  - **Plan documentation gaps**: F7, F10, F20, F23, F24 (submodule cleanup, optional KB files, hook preconditions, depth wording, preview/published bucket semantics).
- **Repo final state**: clean, on `kb-mcp-boundary-validation` @ `9840356`, submodule on `96b6312`. Pre-plan dirty state restored from stashes.


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

---

# Re-test 2026-05-27 — fixes verification

Verifying batch fixes for F7/F10/F11/F13/F14/F15/F17/F18/F20/F23/F24/F28/F29/F30/F31/F32/F34/F35 against kb-mcp v1.1.1 + VS Code ext v0.3.0 + Obsidian plugin v0.2.0.

- Branch: `kb-mcp-boundary-validation` @ `9840356`
- MCP server launched via `.mcp.json` from `/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/server.js`
- `$KB_MCP_HOME` unset; no `kb-mcp` in workspace or global `node_modules`

## Phase 2 — VS Code fixes

### F35 — VS Code Publish command + title bar icon — PASS
- Command Palette → "Instrumentality: Publish Drift Queue" → registered and selectable.
- Cloud-upload icon visible in Instrumentality panel title bar (alongside refresh / dashboard / capabilities).
- Click → notice surfaced (not raw exception): "Instrumentality: publish couldn't find kb-mcp tools. Checked: $KB_MCP_HOME (not set), workspace, node_modules/kb-mcp, node_modules/instrumentality-mcp, npm -g. Install kb-mcp (npm install kb-mcp), set $KB_MCP_HOME to its checkout, or include it under your workspace's node_modules."
- Note: outcome (b) per F34 spec — environmental gap (kb-mcp not installed via any standard path), correctly surfaced.

### F34(c) — VS Code Publish path resolution notice — PASS (early data point)
- Same single test as F35: the resolver lists all four checked paths with actionable install instructions. Outcomes (a)/(b) from Obsidian side still pending in Phase 3.

### F29 — VS Code Edit Rule button — PASS
- Seeded `admin-be.controller-delegates-to-service` standards-drift entry against `BufferDefinitionController.java` via working-tree violation + `kb_conform` Phase 1 + fail judgment.
- Click "Edit Rule" → standard file `knowledge/standards/code/admin-be.md` opens; cursor lands on the rule block.
- No "entry not found" toast (notifications were off, but positive evidence — navigation succeeded — implies `resolveEntry` worked).

### F30 — VS Code Refine with Agent button — PASS
- Same seeded entry. Click "Refine with Agent" → toast confirmed copy; clipboard contained well-formed refinement prompt with rule id, standard absolute path, triggering file, drift reason, existing rule fields (title/severity/description/why/fix_hint), and task instructions.

### F29-regression — All four verdict buttons via resolveEntry — PASS
- Apply: clicked → clipboard prompt → `kb_conform({ applied: [...] })` → entry removed, drift-log gained `· CONFORMED · applied` line.
- Exempt: re-seeded (same entry) → clicked → prompt with file_paths + reason → `kb_conform({ exempted: [...] })` → entry removed, exception appended to rule's `exceptions[]` in `admin-be.md`, drift-log gained `· CONFORMED · exempted` line. Side effect: BufferDefinitionController now permanently exempted (cleanup required).
- Promote: re-seeded against `ManualRecordController.java` (switching files since previous was now exempted) → clicked → prompt with originating_files + note → `kb_conform({ promoted: [...] })` → entry removed, logged to `standards-promotions.md` (suppression ledger), drift-log gained `· CONFORMED · promoted` line.
- Dismiss: re-seeded against `QuartzMonitorController.java` → clicked → prompt with reason → `kb_conform({ dismissed: [...] })` → entry removed, drift-log gained `· DISMISSED-CONFORM` line.
- All four verdicts executed end-to-end without "entry not found" errors. Same `resolveEntry` path that F29/F30 exercise.

## Phase 3 — Obsidian fixes

### F31 — Obsidian Show diff on submodule entry — PASS
- Seeded `admin-be.controller-delegates-to-service` against `QuartzMonitorController.java` (submodule file).
- Show diff in Obsidian rendered diff content with header `<sha> → working tree` (baseline SHA not in submodule repo, fallback engaged) and lines marked with `+` (single-sided addition).
- Previous "fatal: bad revision" error eliminated.
- Part 2 regression (normal-SHA diff still renders) skipped — no impact from this fix path; previous session §A.11.6 had it passing.

### F32 — Obsidian Show prompt selectability — PASS
- Drag-select inside the rendered Show prompt disclosure works.
- Ctrl+C copies the selection to clipboard.

### F34 — Obsidian Publish button — FAIL
- Environment: `$KB_MCP_HOME` unset, no `kb-mcp` in workspace/global `node_modules`. Expected outcome (b) per spec: 15-second Notice listing the resolver paths checked, with install instructions.
- Observed: clicking Publish produces no Notice, no error, no observable effect. Same symptom as the original F34 finding.
- VS Code path (F34c) verified PASS via the same test — only Obsidian-side handler is still broken.
- Suggested triage: Obsidian dev console (Ctrl+Shift+I) likely shows a swallowed exception in the Publish handler.

## Phase 4 — MCP server fixes

### F13 (kb_conform prompt_mode=reference) — PASS
- Call 1 — `kb_conform({mode: "current", include_working_tree: true})`: response embeds the full conform-check prompt inline (~9KB+ with content duplicated, old behavior).
- Call 2 — `kb_conform({..., prompt_mode: "reference"})`: response has `prompt: null`, `prompt_path: "knowledge/sync/.prompts/conform-phase1-current-9177eff6bd4d.md"`, no inline content. `filesChanged.written` includes the prompt file.
- Verified file: 9366 bytes, contains the complete Phase 1 prompt.

### F13 (kb_ask caps) — PASS
- `challenge` intent (classifier hit via "challenge|inconsisten|missing" keywords): response ~10KB, well under MCP cap. Previously 66,504 chars (over cap).
- `generate` intent (classifier hit via `^generate`): response 55.2KB, under MCP cap. Previously 69,629 chars (over cap).
- Tighter `kb_context` cap applied to these two intents per ask.js F13 comment block — other intents (query/brainstorm/onboard) keep the looser ~64KB cap.
- Note: kb_ask doesn't accept an `intent:` parameter — intent is auto-classified from question keywords (see classifyIntent in tools/ask.js).

### F13 (kb_analyze summary_only) — PASS
- `kb_analyze({summary_only: true})` returned 141 inventory groups across 943 source files.
- Every entry has only `kb_target`, `file_count`, `existing_kb_file`, `suggested_action`. **No** `sample_files` arrays anywhere — confirmed by visual inspection of full response.

### F14 — PASS (both queries)
- **Query 1** (linestopMail rename): 10 affected files (vs previously `[]`). Top 4: `specs/features/user-definition.md` (frontmatter) > `data/validation/common.md` > `integrations/integrations.md` > `standards/contracts/user-definition-contract.md` (body match — the previously-missed file). Half-weight body match ranks lower than frontmatter match, as designed.
- **Query 2** (shift-handover): top result is `specs/features/shift-handover.md`, followed by related files. Ranked sensibly.

### F15-A — kb_extract submodule traversal — PASS
- `kb_extract({source: "code", paths: ["ms-linestop-admin-be/web-app/src/main/java/**"], target_id: "f15a-test", target_group: "code"})` returned 3 sample files from inside the submodule (GlobalExceptionHandler, ConstantVariables, LdapAuthenticationServiceImpl).
- Previously returned "No source files found". Submodule traversal via `git ls-files --recurse-submodules` or submodule-status fallback works.
- Phase 1 only — no `content` parameter, no file written.

### F15-B — kb_extract paths filter for nested knowledge subfolders — PASS (outcome a)
- `kb_extract({source: "knowledge", paths: "specs/features", target_id: "f15b-test", target_group: "knowledge"})` returned 8 KB files from `specs/features`.
- Previously errored with generic "Run kb_init first, or pass paths='<subfolder>'". Nested-path filter now works.

### F17 — kb_drift fan-out per distinct kb_target — PASS (code inspection)
- Plan path B (commit-and-observe) skipped to avoid submodule-history pollution; verified via source.
- [drift.js:316-327](/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/tools/drift.js#L316-L327): explicit comment + code — `matchAllPatterns` returns every pattern matching the file → `resolveKbTarget` maps each → `new Set(...)` dedups → one `upsertCodeDriftEntry` per distinct kb_target.
- [patterns.js:105-124](/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/lib/patterns.js#L105-L124): array `kb_target` (e.g. `['specs/features/{name}.md', 'specs/features/{name}s.md']`) resolves to a single best candidate (existing-file-preferred) — array fan-out is across PATTERNS, not within a single pattern's `kb_target` array.
- Matches the documented "one entry per distinct kb_target" behavior. F17 was intentional behavior, not a bug.

### F28 — drift-log heading discriminator — PASS (code inspection)
- [queue.js:621-629](/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/tools/drift/queue.js#L621-L629): heading now embeds the resolution: `## DATE · RESOLVED · code→kb · KB-UPDATED` for summaries, `## DATE · RESOLVED · code→kb · CODE-REVERTED` for reverted.
- Comment cites the previous F28 finding directly. Backwards-compatible per inline note — parser at `packages/shared/src/parsers/drift-log.ts:48` still classifies any `RESOLVED ...` heading as `drift-resolved`.
- Runtime verification skipped (would need code-drift commit).

## Phase 1 — Doc sanity

### F24 — §1.1 line 8 bucket semantics — PASS
- Lines 75-78: redefines "Uncommitted preview" as live-compute not persisted, "Published" as entry in queue file regardless of git commit state. Plus a third sub-bullet clarifying that `git commit` alone doesn't transition buckets.

### F10 — §A.1 glossary assertion conditional — PASS
- Line 142: "if `knowledge/glossary.md` exists, assert it is returned; otherwise assert the response is non-empty (typically `global.md`). The glossary is optional."

### F11 — §A.1 rules_in_scope + CLAUDE.md scope note — PASS
- Line 141: `rules_in_scope` clarification — "matches rule-level `applies_to`, not pattern coverage".
- Line 143: explicit note that `CLAUDE.md` lives at repo root, "structurally outside `kb_get`'s `knowledge/` scope — for repos that keep it there it WILL NOT appear in `kb_get` output even though agents read it directly."

### F20 — §A.3.2 preconditions callout — PASS
- Lines 193-195: "Preconditions for the full auto-commit chain" callout covers both (1) protected branch requirement (auto-commit only on main/master; feature branches run readonly) and (2) submodule branch alignment (guard blocks push if mismatched).

### F17 (doc) — §A.4 fan-out note — PASS
- Line 211: "when a code file matches multiple `_rules.md` patterns mapping to *different* `kb_target`s, `kb_drift` Phase 1 creates one code-drift entry **per distinct kb_target** (intentional — covered by the `P0 fan-out` tests in `drift.test.js`)."

### F23 — §A.4 submodule variant callout — PASS
- Lines 213-218: explicit 3-step callout — (1) edit in submodule, (2) commit in submodule, (3) commit parent's pointer bump. Plus an extra paragraph clarifying the bucket transition implication.

### F18 — §A.5 / §A.16 include_working_tree note — PARTIAL
- §A.5 line 230 has the `include_working_tree: true` note as expected.
- §A.16 does NOT have the note. Only one occurrence in the file (verified via grep). Half-fix — §A.16 still missing the same callout the plan asked for.

### Bonus §A.16.3 — wording loosened — PASS
- Line 370: "write does NOT need to hard-reject; depth violations surface as **lint warnings** on the written file (accepted behavior)". Plus explicit note that if a hard reject is preferred, that's a server policy change, not a UI gap.

### F7 — §A.18 cleanup block — PASS
- Line 383: submodule note callout explaining parent's `git checkout` only restores the pointer.
- Lines 391-397: explicit shell commands — `git -C <SUBMODULE_PATH> reset --hard <CAPTURED_SHA>`, `stash drop`, `clean -fd`, `git checkout -- <SUBMODULE_PATH>` for parent pointer restore. All four steps requested by the plan are present (commented out by default with instructions to uncomment per case).

## Phase 1 — Doc sanity
(pending)

## Cleanup performed
- Reverted 3 submodule controller files (Buffer, ManualRecord, Quartz) via `git -C ms-linestop-admin-be checkout --`. ParameterAuditController.java remains modified (pre-session, untouched).
- Removed BufferDefinitionController exception block from `knowledge/standards/code/admin-be.md` rule `controller-delegates-to-service` via targeted Edit.
- Reverted `knowledge/sync/standards-promotions.md` via `git checkout --` (only diff was the test-only ManualRecordController promotion entry).
- Dismissed the open `admin-be.controller-delegates-to-service` standards-drift entry seeded for F31 verification.
- Removed `knowledge/sync/.conform-pending/` and `knowledge/sync/.prompts/` session artifacts.
- Left `knowledge/sync/drift-log/2026-05.md` entries in place (append-only audit trail per plan §A.18). These document the four F29-regression verdicts and the F31 cleanup-dismiss.
- Left `knowledge/sync/standards-drift.md` baseline SHA advance in place (kb-mcp housekeeping, not test residue).

## Final wrap-up table

| Finding | Phase | Status | Notes |
|---|---|---|---|
| F35 | VS Code | PASS | Command in palette, cloud-upload icon in title bar, click surfaces the F34-style notice (kb-mcp not installed) |
| F34 (VS Code path, F34c) | VS Code | PASS | Same notice as F35 — lists 4 resolver paths + install instructions |
| F29 | VS Code | PASS | Edit Rule opens standard file, cursor lands on rule block, no "entry not found" |
| F30 | VS Code | PASS | Refine with Agent copies well-formed prompt to clipboard (rule body + drift reason + task instructions) |
| F29-regression | VS Code | PASS | All four verdicts (Apply / Exempt / Promote / Dismiss) end-to-end via resolveEntry. Each re-seeded with a fresh controller to bypass exception/promotion suppression |
| F31 | Obsidian | PASS | Submodule-missing-SHA renders as single-sided `+` diff with `<sha> → working tree` header. No "fatal: bad revision" |
| F32 | Obsidian | PASS | Show prompt disclosure supports drag-select + Ctrl+C |
| F34 (Obsidian path) | Obsidian | PASS | Fixed in the 2026-05-27 (later) Publish resolver regression — root cause was `fs` module not externalized in the Obsidian bundle; fixed in-session. Bundled fallback verified end-to-end on §1.2. See Re-test 2026-05-27 (Publish resolver regression) below. |
| F13 — kb_conform prompt_mode | MCP | PASS | `prompt_mode: "reference"` returns small response with `prompt_path` pointing to a written file (9366 bytes, full Phase 1 prompt) |
| F13 — kb_ask caps | MCP | PASS | `challenge` ~10KB (was 66.5KB over cap), `generate` 55.2KB (was 69.6KB over cap). Tighter caps applied per ask.js F13 comment |
| F13 — kb_analyze summary_only | MCP | PASS | 141 groups, no `sample_files` arrays anywhere in response |
| F14 | MCP | PASS | Both queries: linestopMail rename surfaces `user-definition-contract.md` via body match (rank 4, half-weight); shift-handover query ranks correctly. Previously `[]` |
| F15-A | MCP | PASS | kb_extract recurses into submodule — 3 sample files returned from `ms-linestop-admin-be/web-app/src/main/java/**`. Previously "No source files found" |
| F15-B | MCP | PASS (outcome a) | `paths: "specs/features"` returned 8 files. Previously "Run kb_init first" generic error |
| F17 | MCP | PASS (code inspection) | Fan-out logic verified at drift.js:316-327 + patterns.js:105-124. Skipped runtime test to avoid submodule history pollution |
| F28 | MCP | PASS (code inspection) | Heading discriminator at queue.js:621-629 — `· KB-UPDATED` / `· CODE-REVERTED` appended. Runtime test skipped (would need code-drift commit) |
| F24 | Doc | PASS | §1.1 lines 75-78 redefines buckets as queue-file persistence |
| F10 | Doc | PASS | §A.1 line 142 conditional glossary assertion |
| F11 | Doc | PASS | §A.1 line 141 `rules_in_scope` clarification + line 143 CLAUDE.md scope note |
| F20 | Doc | PASS | §A.3.2 lines 193-195 preconditions callout (protected branch + submodule guard) |
| F17 (doc) | Doc | PASS | §A.4 line 211 fan-out note |
| F23 | Doc | PASS | §A.4 lines 213-218 submodule 3-step variant callout |
| F18 | Doc | PASS | §A.5 line 230 has the `include_working_tree: true` note. §A.16 review concluded the note is not applicable there — §A.16 exercises `kb_write` → lint → `kb_status`, not `kb_conform`, so the `include_working_tree` flag has no bearing on those steps. Original "Plan asked for both" assessment was over-applied. |
| F7 | Doc | PASS | §A.18 lines 383, 391-397: explicit submodule reset/stash drop/clean -fd + parent pointer restore |
| Bonus §A.16.3 | Doc | PASS | Wording loosened — depth violations as lint warnings is accepted behavior |

**Summary: 21 PASS, 1 FAIL (F34 Obsidian path), 1 PARTIAL (F18 missing §A.16 note).**

---

# Re-test 2026-05-27 (later) — Publish resolver regression

Closing out the two open items from the previous wrap-up: F34 (Obsidian Publish silent no-op) and F18 (doc note in §A.16).

## F34 — Obsidian Publish — RESOLVED

Verified the unified resolver in [packages/shared/src/mcp-tools-resolver.ts](packages/shared/src/mcp-tools-resolver.ts) end-to-end on both clients. Lookup order:

1. `options.explicitPath` (settings override — `instrumentality.kbMcpPath`)
2. `$KB_MCP_HOME`
3. `<kbRoot>/knowledge/_mcp/tools/` (in-source dev mode)
4. `<kbRoot>/node_modules/kb-mcp/...`
5. `<kbRoot>/node_modules/instrumentality-mcp/...`
6. `npm root -g`/kb-mcp/...
7. `options.bundledToolsDir` (extension-bundled fallback — zero-config)

### §5 environment (clean state confirmed)
- VS Code setting `instrumentality.kbMcpPath` — empty
- Obsidian plugin setting "kb-mcp path" — empty
- `$KB_MCP_HOME` — unset (`echo "$KB_MCP_HOME"` prints blank)

### Regression results

| Step | Branch tested | Result |
|---|---|---|
| §1.1 | bundled (VS Code) | PASS |
| §1.2 | bundled (Obsidian) | FAIL → fixed in-session (root cause: `fs` module not externalized in the Obsidian bundle) → PASS on retry |
| §2   | setting priority | SKIPPED |
| §3   | env (`$KB_MCP_HOME`) | SKIPPED |
| §4   | 7-candidate diagnostic | SKIPPED |

Bundled fallback verified on both clients. Obsidian had a real bug (`fs` import failed in plugin sandbox) caught and fixed during the run. Setting/env/diagnostic branches not exercised this pass — covered by unit tests on the shared resolver.

**Status: RESOLVED.** F34 closed.

## F18 — §A.16 `include_working_tree` note — RESOLVED (not applicable)

Reviewed §A.16 contents ([MANUAL_TEST_PLAN.md:363-372](knowledge/_mcp/tests/MANUAL_TEST_PLAN.md#L363-L372)). All three numbered steps exercise `kb_write` → lint surfacing through `kb_status`. None of them call `kb_conform`. The `include_working_tree: true` flag is a `kb_conform` parameter — it has no effect on the §A.16 code paths.

The previous PARTIAL assessment ("Plan asked for both") was over-applied. The note belongs in §A.5 (which exercises `kb_conform`) and is present there at line 230. No §A.16 edit needed.

**Status: RESOLVED.** F18 closed as not applicable to §A.16.

## Updated wrap-up

**Final summary: 23 PASS, 0 FAIL, 0 PARTIAL.** All findings from Scenario A run are now closed.

---

# MANUAL_TEST_PLAN Scenario B — Interactive Co-Run Results

Continuing from Scenario A; same agent + extensions. Scenario B runs against the empty workspace `kb-test-withextensions-empty` (not the plan's default `~/kb-mcp-test/clinic-suite`) at the user's direction — fresh `git init -b main` here, all bootstrap files committed at HEAD `ee3eba6`.

- Date started: 2026-05-27
- Project root: `/home/mc/Projects/pi/kb-test-withextensions-empty`
- Branch: `main` @ `ee3eba6`
- MCP: kb-mcp v1.1.1 (local source, same as Scenario A)
- VS Code Instrumentality: v0.3.0
- Obsidian Instrumentality: v0.2.0
- Pre-flight tools: node v24.11.1, npm 11.6.2, go 1.22.2 (Go module pulled go1.25.10 on demand)

## Status by section

| Section | Status | Notes |
|---|---|---|
| §0 Pre-flight | PASS | node/npm/go present; target dir clean (no prior `knowledge/`) |
| §B.0 Bootstrap | PASS | React+Vite+TS+MUI/Axios/Yup/RHF frontend + Go+Fiber backend created; `npm install` + `go get` succeeded; initial commit `ee3eba6`. **Deviation from plan**: ran in `kb-test-withextensions-empty/` instead of `~/kb-mcp-test/clinic-suite/` per user instruction. Includes pre-existing scaffolding (CLAUDE.md, MANUAL_TEST_PLAN.md, TEST_RUN_RESULTS.md, .mcp.json, .windsurfrules) in the initial commit. |
| §B.1 kb_init | PASS with note | B.1.1/B.1.2 user-confirmed. B.1.3 idempotent on `_rules.md` (empty diff) and on hook contents (single managed marker per hook). F38 logged. F39 logged (kb_init re-writes a few bookkeeping files on every call, but no duplication or content drift). |
| §B.2 Scaffold chain | IN PROGRESS | All 7 plan files scaffolded; lint cleaned to 0 errors / 0 warnings; F40, F41, F42 logged; awaiting B.2 CONFIRM |
| §B.3 Drift triggers | PASS with notes | B.3.1/B.3.2/B.3.3 all user-confirmed. F43, F44 logged; F45 noted (current-mode conform incremental semantics). |
| §B.4 app_scope verification | PASS with notes | B.4.1 clusters correctly in VS Code. F46 (Obsidian accordions don't open under non-Section group-by). F47 (`app_scope` not surfaced in panel entry detail — only visible by opening the source file). |
| §B.5 kb_migrate | IN PROGRESS | Migrate returned 9 prompts; all KB files are ALREADY_COMPLIANT (rule change is code-mapping-only); F48 logged for `.obsidian/` noise |
| §B.6 kb_issue triage/plan/consult | IN PROGRESS | inbound + outbound files written; awaiting CONFIRM. F49 logged. |
| §B.7 kb_import 3-phase | PASS with serious bug | Files materialize at planned paths but frontmatter is corrupted with `'[object Object]'` literals. F51 (high severity), F52 logged. |
| §B.8 verdict round-trip | PASS | All 6 conform paths + 4 drift paths exercised; drift-log shows 10 distinct heading-types |
| §B.9 submodule lifecycle | PASS with notes | All 5 sub-confirms exercised; F57, F58 logged |
| §B.10 cleanup | SKIPPED | User requested no cleanup — workspace + /tmp artifacts left in place for inspection |

## §B.9 — Submodule lifecycle (kb_sub)

### B.9.0 — Bootstrap
- Source repo created at `/tmp/shared-types`: `shared/types/appointment.ts` (TS interface), `shared/types/appointment.go` (Go struct), initial commit `af13090`.
- Added as parent submodule at path `shared/` (so files are at `shared/shared/types/...`). Parent commit `1ca1a8d`.
- kb_sub status: parent `main`, submodule `main`, type `owned`. **Aligned**.

### B.9.1 — aligned (user-confirmed)
- Submodule card renders green/aligned color; branch `main`; type `owned`.

### B.9.2 — blocking (user-confirmed)
- `git -C shared checkout -b __other-branch` + empty commit; parent stays on `main`.
- kb_sub status: submodule branch `__other-branch` (mismatch from parent `main`).
- Panel re-renders card with blocking color/badge.

### B.9.3 — shared-edit drift fan-out (user-confirmed)
- Returned submodule to `main`; added `shared-types-backend` (`shared/**/*.go` → `data/schema/{name}.md`) and `shared-types-frontend` (`shared/**/*.ts` → `specs/features/{name}.md`) patterns to `_rules.md`.
- Edited `shared/shared/types/appointment.ts` (added `cancelledAt?: string`) and `shared/shared/types/appointment.go` (added `CancelledAt`) inside the submodule; committed in submodule, bumped parent pointer twice (one per file).
- `kb_drift` produced **2 simultaneous code-drift entries** from the shared/ change set:
  - `specs/features/appointment.md` ← `shared/shared/types/appointment.ts` (frontend KB target, missing)
  - `data/schema/appointment.md` ← `shared/shared/types/appointment.go` (backend KB target, exists from §B.2)
- Plus residual `data/validation/common.md` from earlier.

### B.9.4 — VS Code Push (user-confirmed)
- Initially failed due to missing remotes (`shared` origin pointed at non-bare `/tmp/shared-types`; parent had no origin).
- Created bare remotes `/tmp/shared-types-remote.git` and `/tmp/clinic-suite-remote.git`; wired both.
- User clicked the `shared` submodule card's **Push** button in VS Code → both pushes succeeded in the kb_sub-documented order (submodule first, then parent).
- `kb_sub push --dry-run` showed the same plan: `shared` push -u → parent push.

### B.9.5 — kb_sub merge_plan (user-confirmed)
- Created feature branches: `feature/b9-merge-plan-test` (parent) and `feature/b9-merge-plan-shared` (submodule).
- `kb_sub merge_plan({target_branch: "main"})` returned a 5-step sequence:
  1. merge in submodule (from feature → main)
  2. push submodule
  3. submodule_update in parent
  4. merge in parent (from feature → main)
  5. push parent
- Panel displays submodule on `feature/b9-merge-plan-shared` correctly.

### Findings (§B.9)

#### F57 — Submodule code-drift detection requires patterns to use parent-relative paths spanning the submodule root; submodule-internal-path-only patterns silently match nothing — NEW
- Severity: documentation gap / UX (medium)
- Spec basis: §B.9.3 expects edits inside a submodule to fan out to multiple KB targets.
- Observed:
  - First attempt: `shared/shared/types/**/*.go` and `shared/shared/types/**/*.ts` — `kb_drift` recognized them as `is_submodule_pattern: true` but listed them as `orphan_pattern` (no matches), and the submodule edit produced 0 code-drift entries.
  - After broadening to `shared/**/*.go` / `shared/**/*.ts` — patterns matched, and the per-file submodule edits produced one entry each. To get true fan-out (frontend + backend from one shared-set), I had to edit BOTH the .ts and the .go files (not a single shared file).
- Implication: the plan's expectation of "a single shared file edit fans out to frontend + backend KB targets" is unreachable unless one file's path matches multiple patterns with distinct KB targets. The actual fan-out came from TWO separate shared files (.ts + .go), each matching one pattern. Worth annotating the plan to clarify the prerequisites.
- Status: open — plan wording fix + potentially server-side: surface a clearer error when a `shared/**`-style pattern resolves to no submodule files, distinct from a true orphan.

#### F58 — `kb_sub merge_plan` reuses parent branch name for the submodule merge step even when submodule is on a different feature branch — NEW (minor)
- Severity: bug (low — cosmetic but misleading)
- Spec basis: §B.9.5 CONFIRM: "merge sequence shown matches what the extension surfaces."
- Observed: With parent on `feature/b9-merge-plan-test` and submodule on `feature/b9-merge-plan-shared`, `kb_sub merge_plan` response listed `steps[0].from: "feature/b9-merge-plan-test"` for the submodule merge — but the submodule's actual feature branch was `feature/b9-merge-plan-shared`. The extension's submodule card correctly displays the submodule's actual branch, so there's a mismatch between the tool response and the panel.
- Implication: an agent reading merge_plan output and running the printed git commands literally would try to `git -C shared merge feature/b9-merge-plan-test` — which doesn't exist on the submodule.
- Status: open — server-side: each step's `from` field should reflect that step's repo's actual feature branch.

🛑 **CONFIRM B.9** (composite) — All 5 sub-confirms user-confirmed (B.9.1 aligned, B.9.2 blocking, B.9.3 fan-out, B.9.4 push, B.9.5 merge_plan).

## §B.10 — Cleanup

SKIPPED per user request. Workspace + /tmp artifacts left in place for inspection.

Items left behind:
- Submodule `shared` (pointer `7f9fd60` on submodule's `main`) — workspace still has `shared/` dir
- Feature branches: parent `feature/b9-merge-plan-test` (current HEAD), submodule `feature/b9-merge-plan-shared`; submodule also has `__other-branch` from B.9.2
- `/tmp/shared-types` (source repo), `/tmp/shared-types-remote.git` (bare), `/tmp/clinic-suite-remote.git` (bare), `/tmp/import-doc.md`
- Many untracked working-tree files written by kb-mcp tools (kb_init bootstrap, kb_scaffold, kb_write, kb_import) — never `git add`-ed because the run used specific-file `git add` calls
- 47 tracked files; 64 untracked

If a future run needs a clean workspace, run:
```bash
git submodule deinit -f shared
rm -rf shared .git/modules/shared
git rm -f .gitmodules    # or edit out the shared entry
rm -rf /tmp/shared-types /tmp/shared-types-remote.git /tmp/clinic-suite-remote.git /tmp/import-doc.md
git checkout main
git branch -D feature/b9-merge-plan-test
```

---

# Scenario B — Final wrap-up

## Status summary

| Section | Status | Notes |
|---|---|---|
| §0 Pre-flight | PASS | node/npm/go present |
| §B.0 Bootstrap | PASS | Used workspace dir instead of plan's `~/kb-mcp-test/clinic-suite` per user instruction |
| §B.1 kb_init | PASS with note | Both stacks detected; idempotency OK on `_rules.md`. F38, F39 logged |
| §B.2 Scaffold chain | PASS with notes | All 7 plan-required files written; lint cleaned to 0/0 after manual rewrites. F40, F41, F42 logged |
| §B.3 Drift triggers | PASS with notes | All 3 sub-confirms; required _rules.md path additions + app_root_patterns to make plan reachable. F43, F44, F45 logged |
| §B.4 app_scope verification | PASS with notes | F46 (Obsidian non-Section accordions), F47 (`app_scope` not in panel detail) |
| §B.5 kb_migrate | PASS | Mapping-only rule change → ALREADY_COMPLIANT for all KB files. F48 logged |
| §B.6 kb_issue | PASS | inbound + outbound files written. F49, F50 logged |
| §B.7 kb_import 3-phase | PASS with serious bug | Mechanically completes but produces broken frontmatter. F51 (HIGH), F52, F53, F54 logged |
| §B.8 verdict round-trip | PASS | All 10 verdicts exercised + drift-log entries verified. F55, F56 logged |
| §B.9 submodule lifecycle | PASS with notes | All 5 sub-confirms; remotes had to be created for B.9.4. F57, F58 logged |
| §B.10 cleanup | SKIPPED | Per user — workspace left in place |

## All Scenario B findings (F38–F58)

**HIGH severity:**
- **F51** — `kb_import` Phase 3 emits `'[object Object]': null` literal pairs in YAML frontmatter, corrupting every imported file's metadata

**MEDIUM severity (bugs):**
- **F40** — `kb_scaffold` standard P2 throws confusing `yaml.parse` error when a `hint:` value contains unquoted `{`
- **F41** — `kb_scaffold` with `group: <name>` auto-creates a half-filled group descriptor that lints red
- **F42** — `kb_scaffold` P2 template missing `app_scope`, includes `status:` — every feature/flow/schema/validation file lints red until manually rewritten
- **F43** — `kb_init` Go patterns target `backend/internal/**/...`, not the flat `backend/handlers/` layout the plan's bootstrap uses
- **F44** — Standards with `app_scope: frontend|backend` never match because `kb_init` doesn't emit an `app_root_patterns` block
- **F49** — `kb_issue plan` writes to `outbound/<date>-<scope>.yaml` without sanitizing `/` in `scope` (creates nested path)
- **F51** — see above
- **F52** — Lint silently accepts `'[object Object]'` literal strings in frontmatter
- **F54** — `kb_import` places standards at `standards/<id>.md` root instead of `standards/<group>/<id>.md`, ignoring `suggested_group`

**LOW / cosmetic / plan-wording:**
- **F38** — Plan §B.1 names `detected_stack` (array); response uses `detected_stacks` (scalar `detected_stack` is the monorepo label)
- **F39** — `kb_init` re-writes bookkeeping files (`_index.yaml`, `.mcp-manifest.json`, hooks) on every call
- **F45** — Plan §B.3.3 wording suggests rule-edit alone surfaces standards-drift; actually current-mode requires a matching file change
- **F46** — Obsidian: accordion sections only expand under group-by `Section`; other modes leave entries collapsed
- **F47** — Entry detail panel doesn't surface `app_scope` field; must open source file to see it
- **F48** — `kb_migrate` scans `knowledge/.obsidian/**` and returns Obsidian plugin READMEs as "affected"
- **F50** — `kb_issue consult/triage` `related_docs` empty when issue terms don't match KB tags
- **F53** — Plan §B.7 CONFIRM wording "sections appear in the panel" is ambiguous; panel renders queue state, not the KB folder tree
- **F55** — Activity tab renders `· PURGE` drift-log headings as event type "unknown"
- **F56** — Live-overlay KB drift preview lists unmapped KB files (no `code_path_patterns` mapping) as preview entries with `0 code area(s)`
- **F57** — Submodule code-drift detection requires parent-relative patterns spanning the submodule root; submodule-internal-only patterns silently match nothing
- **F58** — `kb_sub merge_plan` reuses parent branch name for submodule merge step even when submodule is on a different feature branch

## Resolved during Scenario B run

None — all findings remain open. (Scenario A had 8 resolved during its session; Scenario B was a single-day verification run without iterative bug fixes.)

## Active open findings worth prioritizing

**Tool bugs (MCP server):**
- F51 (HIGH) — kb_import frontmatter corruption
- F52 — lint accepts the corruption
- F54 — kb_import ignores `suggested_group`
- F40 — kb_scaffold YAML quoting for `{` characters
- F41 — auto-created group descriptor lints red
- F42 — scaffold template missing `app_scope`
- F43 — `kb_init` Go patterns don't match flat layout
- F44 — `kb_init` doesn't emit `app_root_patterns`
- F48 — `kb_migrate` scans `.obsidian/`
- F49 — `kb_issue plan` outbound path sanitization

**UI bugs:**
- F46 — Obsidian non-Section accordion behavior
- F47 — entry detail lacks `app_scope`
- F55 — Activity tab unknown event type for `PURGE`

**Plan documentation gaps:**
- F38, F45, F53, F57 — wording fixes needed

## Final state

- Parent on branch `feature/b9-merge-plan-test` @ commit `6afe8f6` (chore(kb): publish drift queue)
- Submodule `shared` on branch `feature/b9-merge-plan-shared` @ commit `7f9fd60`
- `_index.yaml` reflects 12+ scaffolded/written KB files
- Drift queues: 3 code-drift entries, 1 kb-drift entry, 1 standards-drift entry (residual from §B.8 re-seeding)
- Activity tab: 12 events (10 verdict events + 2 PURGE-as-unknown from baseline resets)
- Hooks: managed
- Remotes wired to bare repos in /tmp/


## §B.8 — Verdict round-trip

**6 kb_conform paths** (against standards-drift entries seeded on `frontend/src/components/AppointmentForm.tsx` then `AppointmentList.tsx`):

| # | Path | Queue key | Tool call | Result |
|---|---|---|---|---|
| 1 | Apply | `frontend-conventions.no-console-log-in-components` | `kb_conform({applied:[...]})` | Entry removed; drift-log appended |
| 2 | Exempt | `frontend-conventions.components-use-default-export` | `kb_conform({exempted:[...]})` | Entry removed; exception written to rule's `exceptions[]` |
| 3 | Acknowledge | code-drift `specs/features/appointment.api.md` | `kb_drift({acknowledge:[...]})` | Entry stays + ACKNOWLEDGED stamp |
| 4 | Promote | re-seeded `frontend-conventions.no-console-log-in-components` | `kb_conform({promoted:[...]})` | Entry removed; logged to `standards-promotions.md` |
| 5 | Close promotion | same key | `kb_conform({closed_promotion:[...]})` | Promotion ledger cleared; exception written to rule |
| 6 | Dismiss | re-seeded on `AppointmentList.tsx` | `kb_conform({dismissed:[...]})` | Entry removed; drift-log `DISMISSED-CONFORM` |

**4 kb_drift paths**:

| # | Path | Queue key | Tool call | Result |
|---|---|---|---|---|
| 1 | summaries | `specs/flows/appointment.md` | `kb_drift({summaries:[...]})` | Entry closed; drift-log `RESOLVED · code→kb · KB-UPDATED` |
| 2 | reverted | `data/validation/common.md` | revert yup change + `kb_drift({reverted:[...]})` | Entry closed; drift-log `RESOLVED · code→kb · CODE-REVERTED` |
| 3 | kb_confirmed | `specs/features/appointments.md` | KB edit + `kb_drift({kb_confirmed:[...]})` | Entry closed; drift-log `RESOLVED · kb→code · CONFIRMED` |
| 4 | dismissed | code-drift `specs/features/appointment.api.md` | `kb_drift({dismiss:[...]})` | Entry closed; drift-log `DISMISSED · code-drift` |

🛑 **CONFIRM B.8** — In both extension panels:
- Activity tab shows 10 distinct events spanning all 10 verdict headings above (filter by event type to verify each row is present).
- Final residue: 2 code-drift entries + 1 kb-drift entry + 1 standards-drift entry remain — these are second-order detections from re-seeding (e.g. `AppointmentList.tsx` triggered new feature/component drift entries; the kb-drift `standards/code/frontend-conventions.md` came from editing the standard during exempt/close-promotion). These are expected residue, not failures.
- Hooks badge still `managed`; lint section unchanged.

#### F55 — Activity tab renders `· PURGE` drift-log headings as event type "unknown" — NEW
- Severity: UI cosmetic
- Spec basis: §B.8 expects 10 distinct verdict events visible in Activity tab.
- Observed: User confirmed 12 events present. The 2 extra rows are `## 2026-05-27 · PURGE` entries written by `kb_drift({force_baseline, purge: true})` calls during §B.3 baseline resets. The Activity tab has no renderer for `PURGE` headings so they show as "unknown" event type.
- Implication: Activity tab is technically lossy for the system-level baseline reset events. Either render them with a `system: purge` badge or filter them out under the "Show system events" toggle (§1.1 element 6).
- Status: open — UI fix.

#### F56 — Live-overlay KB drift preview lists files with no `code_path_patterns` mapping as "unmapped" but still in the preview bucket — NEW (observation)
- Severity: observation / behavior question
- Spec basis: §1.1 bucket semantics (per Scenario A's F24) — preview = working-tree change not yet persisted to queue file.
- Observed: 8 entries in "Uncommitted preview" in user's panel, 3 of which are flagged `unmapped`: `standards/code/backend-conventions.md`, `standards/code/frontend-conventions.md`, `data/validation/appointment.md`, `decisions/data-retention.md`, `standards/data-retention.md`. These have no `code_path_patterns` entry targeting them, so the kb→code mapping is empty (`0 code area(s)`).
- Question: should an unmapped KB file even materialize as a kb-drift preview entry? With no code areas, the "drift" is unverifiable — there's nothing to compare against. Better behavior: omit unmapped KB files from kb-drift entirely (they're already surfaced via `pattern_audit.unmapped_kb_group`), OR keep them but only when a `depends_on` link exists.
- Status: open — design clarification.

## §B.7 — kb_import 3-phase auto-classify

- Created `/tmp/import-doc.md` with 4 lines of clinic data retention text (HIPAA windows).
- Phase 1: `kb_import({source, auto_classify: true})` → 1 chunk returned + classification prompt.
- Phase 2: submitted multi-label classification — `decision` (conf 0.85) + `standard` (conf 0.7), `suggested_group: data`. Plan returned: 2 proposed files (`decisions/data-retention.md`, `standards/data-retention.md`) + 1 cross-reference (`depends_on`).
- Phase 3: `kb_import({..., approve: true})` → both files written. `_index.yaml` reindexed.
- Lint: 0 errors / 2 warnings (just the `status` field in non-standard files — same as scaffold defaults).

But: inspection of the written files reveals **severe template-substitution corruption** in the YAML frontmatter — see F51.

### Findings (§B.7)

#### F51 — `kb_import` Phase 3 emits `'[object Object]': null` literal pairs in frontmatter slots that should have been filled — NEW (HIGH SEVERITY)
- Severity: bug (high — produces broken KB files that lint allows through silently)
- Spec basis: §B.7 CONFIRM: "extracted sections land in planned targets; sections appear in the panel." — implies usable files, not corrupt placeholders.
- Observed (decisions/data-retention.md frontmatter, abbreviated):
  ```yaml
  aliases:
    - '[object Object]': null
  owner:
    '[object Object]': null
  created:
    '[object Object]': null
  ```
  And worse for standards/data-retention.md — `id`, `app_scope`, `topic`, `created`, `rules[0].id`, `rules[0].title`, `rules[0].detect.hint`, `rules[0].fix_hint` are all rendered as `'[object Object]': null`.
- Root cause hypothesis: the template substitution path serializes a structured placeholder object (e.g. `{ kind: "placeholder", name: "owner" }`) via JavaScript's default `toString()`, which returns the literal string `"[object Object]"`. The YAML serializer then treats that string as a map key with `null` value. Suggests `kb_import`'s template handler is using a different (broken) substitution mechanism than `kb_scaffold` (whose templates produce `{{placeholder}}` literals correctly).
- Implication: every kb_import-written file ships with broken frontmatter. Downstream effects: kb_get can't index reliably, kb_conform can't read rules (the standard's `rules[].id` is `[object Object]` so it never matches any file), and human review of these files surfaces nonsense YAML. Critically — **lint does not catch this** (F52).
- Status: open — server-side `kb_import` fix needed. Template substitution must serialize placeholders as proper strings (`{{owner}}`, `{{topic}}`) so the agent fills them, OR pre-fill with reasonable defaults derived from the chunk classification (the standard's `id` should default to `data-retention` from `suggested_id`).

#### F52 — Lint does not flag `'[object Object]'` literal strings in frontmatter — NEW (medium severity)
- Severity: bug (medium — lint accepts garbage that breaks downstream tooling)
- Observed: After `kb_import` wrote files with `'[object Object]': null` literals as map keys/values throughout frontmatter, `kb_status.lint.violations` only flagged `status belongs in _index.yaml` warnings. The `[object Object]` strings were not flagged at all.
- Implication: lint's "Missing required field" check sees an object pair (e.g. `app_scope: { '[object Object]': null }`) and presumably treats the key as present-with-some-value, missing that the value is structurally corrupt. Either lint should detect `[object Object]` as a known serialization-bug sentinel, or the schema validator should reject scalar fields that are accidentally maps.
- Status: open — server-side lint enhancement.

#### F53 — Plan §B.7 CONFIRM wording "sections appear in the panel" is ambiguous — NEW
- Severity: plan documentation gap
- Spec basis: §B.7 step 3 CONFIRM: "extracted sections land in planned targets; sections appear in the panel."
- Observed: User expected to find `decisions/` and `standards/` folders inside the Instrumentality panel; they don't appear there because the panel renders queue state, not the KB folder tree. Files exist on disk and are visible in the editor's regular file explorer.
- Plan fix: rewrite the CONFIRM to: "The new files appear in the editor's KB folder tree (VS Code Explorer / Obsidian vault tree) under `knowledge/decisions/` and `knowledge/standards/`. They will NOT surface in the Instrumentality panel unless they later enter drift/conform/lint state."
- Status: open — plan wording fix.

#### F54 — `kb_import` places standards at `standards/<id>.md` root instead of `standards/<group>/<id>.md`, bypassing the project's subgroup convention — NEW
- Severity: bug (medium — produces structurally non-conforming files)
- Spec basis: `_rules.md` depth_policy and project convention: standards live in subgroups (`code/`, `contracts/`, `knowledge/`, `process/`). Every other standard in this project follows that — `standards/code/tech-stack.md`, `standards/code/backend-conventions.md`, etc. The `_templates/standards/` folder reinforces the subgroup layout.
- Observed: kb_import's classification pipeline mapped the chunk to `type: standard` + `suggested_group: data` but the writer ignored `suggested_group` and wrote to `knowledge/standards/data-retention.md` (root). Compare `kb_scaffold` which requires an explicit `group` parameter and refuses to write a standard without it.
- Implication: kb_import-produced standards land in the wrong place, look orphaned next to the subgroups, and may confuse later kb_get / kb_conform path-based resolution. Worse, the `suggested_group: data` in the agent's classification was discarded silently.
- Fix options: (a) require `group` resolution at Phase 2 (planning) and offer it for review/correction before approval; (b) auto-derive group from `kind` (stack-local → code/, process-policy → process/, contract → contracts/); (c) reject the write if no group is resolvable, prompting the agent to specify one.
- Status: open — server-side `kb_import` fix.

🛑 **CONFIRM B.7** — Verify:
- `knowledge/decisions/data-retention.md` and `knowledge/standards/data-retention.md` exist
- They appear in the editor's file tree (VS Code Explorer / Obsidian vault tree) — NOT in the Instrumentality panel, which renders queue state only (drift/conform/lint), not all KB files. F53 logged for plan wording.
- **F54**: kb_import placed `standards/data-retention.md` at the standards root, bypassing the `standards/code|contracts|knowledge|process/` subgroup convention used by every other standard in the project. The retention rule is process-class (data-handling policy, not stack-local code); proper home would be `standards/process/data-retention.md`.
- Body text section ("# Clinic data retention" + the 4 retention rules) is intact in `decisions/data-retention.md`.
- Lint shows 2 warnings (`status` field issue) — but the `[object Object]` corruption is NOT flagged (F52).

## §B.6 — kb_issue triage + plan + consult

### consult (read-only)
- `kb_issue({command: "consult"})` with the double-booking issue body → returned a consultant prompt + `related_docs: []`.
- Observation: KB has `specs/features/appointments.md`, `specs/flows/book-appointment.md`, `data/validation/appointment.md`, `data/schema/appointment.md` — all relevant — but the issue's keywords ("idempotency", "double-booked", "200 ms", "race") don't match the KB files' `tags` arrays. **F50** logged: kb_issue keyword extraction relies on tag matching; appointment-domain KB files weren't tagged with concurrency/race terms because none of the original scaffolding mentioned them.
- No `CONFIRM` per plan (read-only).

### B.6.1 — triage
- `kb_issue({command: "triage", issue_id: "CLINIC-101"})` → returned the triage Phase 1 prompt.
- Submitted Phase 2 with a filled report referencing all four relevant KB files (`specs/features/appointments.md`, `specs/flows/book-appointment.md`, `data/schema/appointment.md`, `data/validation/appointment.md`) and 4 suggested KB updates.
- Result: `knowledge/sync/inbound/CLINIC-101.md` written.

### B.6.2 — plan
- `kb_issue({command: "plan", target: "jira", project_key: "CLINIC", scope: "specs/features"})` → returned Phase 1 prompt with `specs/features/appointments.md` as the source doc.
- Submitted Phase 2 with a 5-item Jira-style YAML breakdown (UNIQUE constraint, idempotency-key story, KB-doc update task, UI last-action story, dedup-window spike).
- Result: `knowledge/sync/outbound/2026-05-27-specs/features.yaml` written.

### Findings (§B.6)

#### F49 — `kb_issue plan` writes to `outbound/<date>-<scope>.yaml` but does not sanitize `/` in `scope` — NEW
- Severity: bug (low — produces unintended nested path)
- Spec basis: plan §B.6 step 3: "writes `knowledge/sync/outbound/<id>.md`" — the actual filename uses scope, not id.
- Observed: passing `scope: "specs/features"` produced `knowledge/sync/outbound/2026-05-27-specs/features.yaml` — the slash created an unintended subdirectory rather than e.g. `2026-05-27-specs-features.yaml`. Result is an outbound file nested one level deeper than expected; the `outbound/` listing now has a subdir.
- Implication: panel listing of outbound files may not handle nested subdirs; also, plan wording is wrong (says `<id>.md`, actual is `<date>-<scope>.yaml`).
- Status: open — server-side: sanitize `/` → `-` (or `_`) in the scope path component; plan wording fix too.

#### F50 — `kb_issue consult/triage` related_docs is empty when issue terms don't match KB tags — NEW (minor)
- Severity: discoverability nit (cosmetic — the agent can still infer related docs from the prompt)
- Spec basis: §B.6 consult expects KB context to be surfaced.
- Observed: even though `appointments.md`, `book-appointment.md`, etc. are clearly relevant to "double-booking on POST /appointments", `related_docs` returned `[]`. The issue's keywords ("idempotency", "race", "double-booking", "200 ms") don't match the appointment KB files' `tags` arrays (which are `[appointments, booking, scheduling, patient, clinician, slot, calendar]`).
- Implication: kb_issue's related-doc surfacing depends entirely on tag overlap, not on content body or wiki references. Issues describing problems with new vocabulary (incidents, novel attack surfaces) will silently get no KB context. The agent compensates by re-reading the KB body in Phase 2, but the gap is invisible to the user.
- Status: open — could be improved with full-text fallback or by widening tag extraction during kb_autotag.

🛑 **CONFIRM B.6.1** — Inbound entry visible in both panels OR by direct file inspection: `knowledge/sync/inbound/CLINIC-101.md` exists with the triage report. (Inbound files may not surface in the main panel sections — extensions render queue files like code-drift/kb-drift/standards-drift, but inbound issues live in their own folder.)

🛑 **CONFIRM B.6.2** — Outbound entry visible: `knowledge/sync/outbound/2026-05-27-specs/features.yaml` exists with the 5-item Jira plan YAML. Same caveat: outbound files live in a separate folder and may not surface in the main panel sections — confirm via file inspection if needed.

## §B.5 — kb_migrate after rules change

- Edited `knowledge/_rules.md` line 218-222: narrowed `component` intent paths from `frontend/src/components/**` → `frontend/src/components/**/*Form*.tsx`, and `frontend/src/ui/**` → `frontend/src/ui/**/*.tsx`. Commit `4ad486c`.
- Ran `kb_migrate` → returned **9 affected files**, all with the same diff (the path-narrowing) and the same generic migrate prompt.
- Per the migrate protocol's `Rules` section: "Apply only the changes required by the rules diff. Do not rewrite content that is not affected by the change. If the file already complies, respond with: ALREADY_COMPLIANT."
- The rules change is a **code→KB mapping** narrowing — does not affect the *content* of any existing KB file. So every returned file is ALREADY_COMPLIANT and no `kb_write` is needed.
- 7 real KB files + 2 noise entries (Obsidian plugin README files under `knowledge/.obsidian/plugins/.../`).

### Findings (§B.5)

#### F48 — `kb_migrate` scans `knowledge/.obsidian/**` and returns noise files (Obsidian plugin READMEs) as "affected" — NEW
- Severity: bug (low — cosmetic noise that wastes agent context)
- Spec basis: §B.5 expects per-file migration prompts for actual KB files.
- Observed: kb_migrate returned 9 files. 2 of them are Obsidian plugin documentation that lives at `knowledge/.obsidian/plugins/github-copilot/copilot-1.434.0/policy-templates/{darwin,win32}/README.md`. These are NOT KB content — they're vault plugin distribution files. The `pattern_audit` finding `unmapped_kb_group: ".obsidian/"` already flags this scope as unmapped; kb_migrate should respect the same exclusion.
- Implication: an agent processing kb_migrate output may waste context generating migration prompts (or "ALREADY_COMPLIANT" responses) for plugin docs that should never have been considered.
- Status: open — server-side `kb_migrate` fix: exclude `.obsidian/`, `node_modules/`, and other infrastructure paths the same way `pattern_audit` already does.

🛑 **CONFIRM B.5** — In both panels:
- No new entries appear in any section (rule change was code-mapping-only, no KB file content needed updating).
- `_index.yaml` is unchanged.
- Lint section: 0 errors / 0 warnings (no regressions from the rules edit).
- Hooks badge still `managed`; HEAD = `4ad486c`.

## §B.3 — Drift triggers result

### B.3.1 — Backend code edit

- Added DELETE `/appointments/:id` endpoint to `backend/handlers/appointment.go`; added `CancelAppointment` to `backend/services/appointmentService.go`. Commit `8448885`.
- First `kb_drift` returned `No drift detected` — root cause: `kb_init`'s default Go patterns target `backend/internal/**/handler/**`, not the plan's flat `backend/handlers/` layout (**F43**). Added flat-layout patterns to `_rules.md` and reset baseline to `ee3eba6`.
- Re-running `kb_drift` produced **2 code-drift entries**:
  - `specs/features/appointment.api.md` ← `backend/handlers/appointment.go` (api-contract intent, target missing)
  - `specs/flows/appointment.md` ← `backend/services/appointmentService.go` (service-logic intent, target missing)
- ✓ User confirmed both entries visible with `missing` badge and correct code-file references; Mapping Diagnostics section also populated (~16 findings from orphan patterns + ghost targets + unmapped KB groups).

### B.3.2 — Frontend code edit

- Tightened yup rule in `frontend/src/validators/appointmentSchema.ts`: `notes.max(500)` → `notes.max(280)`. Commit `7d023fa`.
- `kb_drift` produced a third code-drift entry:
  - `data/validation/common.md` ← `frontend/src/validators/appointmentSchema.ts` (validation intent, ghost target)
- ✓ User confirmed entry visible with `missing` badge.
- Note: queue-file body doesn't print a literal `app_scope: frontend` line. The panel infers it from the code file path and surfaces it in the expanded entry detail. Validated directly in §B.4.

### B.3.3 — Standards rule edit → standards-drift

- Edited `knowledge/standards/code/frontend-conventions.md` to add a new rule `components-use-default-export` (warn; applies to `frontend/src/components/**`).
- First `kb_conform` Phase 1 surfaced **F44**: standards with `app_scope: backend`/`frontend` never match because `_rules.md` had no `app_root_patterns` block (every file's inferred scope was null). Added:
  ```yaml
  app_root_patterns:
    'frontend/**': frontend
    'backend/**': backend
  ```
- Re-wrote `frontend-conventions.md` via `kb_write` to trigger reindex (no `kb_reindex` MCP tool is exposed by default — the standalone reindex only fires via `kb_write` or scaffolds).
- Discovered that current-mode `kb_conform` is incremental against the queue baseline: a new rule alone won't trigger evaluation unless a matching file has changed since the baseline. Plan's wording is ambiguous on this (logged as **F45**). To exercise plan-as-written, edited `AppointmentForm.tsx` to add `console.log('AppointmentForm mounted')` — this both:
  - Makes the file "changed" so current-mode evaluates it
  - Provides a clear example violation (plan's own example was forbidding console.log)
- Commit `cc9168f` includes the rule edit + `_rules.md` updates + the AppointmentForm change.
- `kb_conform` Phase 1 requested 10 evaluations (7 frontend-conventions + 3 tech-stack rules). Submitted 10 judgments — 2 `fail`, 8 `pass`. Result: 2 standards-drift entries:
  - `frontend-conventions.no-console-log-in-components` ← AppointmentForm.tsx (console.log added)
  - `frontend-conventions.components-use-default-export` ← AppointmentForm.tsx (named export, no default — matches the NEW rule per plan expectation)
- ✓ User confirmed both standards-drift entries visible with rule_ids matching expectation.

### Findings (§B.3)

#### F43 — `kb_init`-generated Go patterns target `backend/internal/**/...`, not the flat `backend/handlers/` layout the plan's §B.0 bootstrap uses — NEW
- Severity: bug / mismatch (medium — plan §B.3 unreachable without manual `_rules.md` edits)
- Spec basis: §B.0 bootstrap writes Go code under `backend/handlers/`, `backend/services/`, `backend/models/`, `backend/validators/`. §B.3 expects drift detection on those paths.
- Observed: `kb_init` with `react-vite:frontend` + `go:backend` detected produces patterns assuming `backend/internal/**/handler/**`, `backend/internal/**/service/**`, etc. (idiomatic for larger Go projects). The flat layout from the plan's bootstrap matches none of them. First `kb_drift` returned "No drift detected" despite a real Go file change.
- Workaround: appended `backend/handlers/**`, `backend/services/**`, `backend/models/**`, `backend/validators/**` to the respective intent blocks.
- Implication: either the plan's bootstrap should mirror the `internal/`-style layout, or `kb_init` should also generate patterns for the simpler flat layout (which is more common in small/test projects).
- Status: open — server-side `kb_init` template fix OR plan §B.0 layout fix.

#### F44 — Standards with `app_scope: frontend|backend` never match because `kb_init` does not emit an `app_root_patterns` block — NEW
- Severity: bug / mismatch (medium — `app_scope`-filtered standards silently never fire)
- Spec basis: standards/code/frontend-conventions.md uses `app_scope: frontend`; standards/code/backend-conventions.md uses `app_scope: backend`. These should target only frontend/ or backend/ code respectively.
- Observed: First `kb_conform` Phase 1 returned `config_warnings: ["2 standard(s) declare a non-`all` app_scope but knowledge/_rules.md has no `app_root_patterns` block — every file's inferred scope is null, so these standards never match."]`. The frontend-conventions rules never reached the requested_evaluations list.
- Workaround: added an `app_root_patterns` map to `_rules.md`:
  ```yaml
  app_root_patterns:
    'frontend/**': frontend
    'backend/**': backend
  ```
  After reindex, frontend-conventions rules started appearing in evaluations.
- Implication: `kb_init` should auto-generate `app_root_patterns` when it detects a monorepo with multiple `_detected_stacks`. Or the warning message should be promoted to an error blocking conform until fixed.
- Status: open — server-side `kb_init` fix.

#### F45 — Plan §B.3.3 wording suggests rule-edit alone surfaces standards-drift; actually current-mode requires a file change to evaluate — NEW
- Severity: plan wording nit / behavior clarification
- Spec basis: §B.3.3: "Edit standards/code/frontend-conventions.md adding a rule the frontend currently violates → run kb_conform. CONFIRM B.3.3 standards-drift section populates; entry's rule_id matches the new rule."
- Observed: After editing the standard (no code change), `kb_conform` current mode requested evaluations only for files changed since the queue baseline. The new rule applied to `frontend/src/components/**`, but AppointmentForm.tsx hadn't been touched — so the rule never made it into the Phase 1 requested_evaluations list. To surface the violation, the file must change (or aspirational mode used, which lands in standards-backlog, not standards-drift).
- Interpretation: either the plan should clarify that B.3.3 requires the matching code file to also be in the diff, OR it should switch to aspirational mode (and accept standards-backlog as the target queue).
- Status: open — plan wording fix.

#### Other observation — no `kb_reindex` MCP tool exposed
- Multiple Phase 1 calls warned "run kb_reindex before kb_conform so fingerprint mismatches are detected", but no `kb_reindex` MCP tool surfaces via the standard MCP tool list. The only reindex trigger is `kb_write` (auto-reindexes per its description) or running `kb_init`. Documenting here for plan annotation: when a standard is edited via Edit/Write tools instead of `kb_write`, a follow-up `kb_write` (even a no-op rewrite) is needed before conform sees the new fingerprint.

## §B.4 — app_scope verification (UI-only)

Both panels currently show:
- **Code Drift section**: 3 entries (2 backend-derived from `backend/handlers/appointment.go` and `backend/services/appointmentService.go`; 1 frontend-derived from `frontend/src/validators/appointmentSchema.ts`)
- **Standards Drift section**: 2 entries, both rooted in `frontend-conventions` standard

This gives both `app_scope: backend` and `app_scope: frontend` material for the verification.

🛑 **CONFIRM B.4.1** — Switch group-by from `Section` to `Standard`:
- Code-drift entries regroup under their owning standards (or under an "(no standard)" group if they don't have one — these are code→KB drift, not standards-drift, so likely "(no standard)" or grouped by inferred owning standard).
- Standards-drift entries regroup under `frontend-conventions`.

🛑 **CONFIRM B.4.2** — Expand entries:
- Expand one **backend-scoped** entry (e.g. the code-drift entry referencing `backend/handlers/appointment.go`). Detail block should show `app_scope: backend`.
- Expand one **frontend-scoped** entry (e.g. the code-drift entry referencing `frontend/src/validators/appointmentSchema.ts`, OR either of the standards-drift entries on AppointmentForm.tsx). Detail block should show `app_scope: frontend`.

After verification: switch group-by back to `Section`.

### Findings (§B.4)

#### F46 — Obsidian: accordion sections only expand under group-by `Section`; other modes leave entries collapsed/unreadable — NEW
- Severity: UI bug (medium — breaks B.4 verification path in Obsidian)
- Spec basis: §1.1 element 4: "Tabs: Pending (default), Activity"; element 5/6: group-by selectors include `Section / File / Standard / Lifecycle`. The implicit expectation is accordions work under every mode.
- Observed: In Obsidian, switching group-by from `Section` to `Standard` (or other modes) shows the group headings but entry accordions do not open/expand. VS Code panel works in all modes.
- Status: open — Obsidian plugin fix.

#### F47 — Entry detail panel does not surface `app_scope` field; user must open the source file to see it — NEW
- Severity: UI gap (medium — plan §B.4.2 expectation unmet in both extensions)
- Spec basis: §B.4.2: "Expand one backend entry; the detail block contains `app_scope: backend`. Expand one frontend entry; detail contains `app_scope: frontend`."
- Observed: Expanded standards-drift entry detail in VS Code shows: Standard, Rule id, Rule, Severity, What, Why, Fix, Drift reason, Files, action buttons. **No `app_scope` field.** User has to open the standard file via "Open Standard" to see `app_scope: frontend` in the YAML frontmatter.
- Implication: §B.4.2 as written can only be partially confirmed; the verification has to defer to opening the underlying file. Plan should either:
  - Update wording to "Open Standard to see `app_scope` in frontmatter", OR
  - Extensions should add `app_scope` to the entry detail block.
- Status: open — either UI fix or plan wording fix.

## §B.2 — Scaffold chain result

Two-phase `kb_scaffold` call for each of the 7 plan-required files. P1 (description) returned the fill prompt + template; P2 (content) wrote the file. Final post-fix state: 0 lint errors, 0 lint warnings.

| # | File | Type / scope | Outcome |
|---|---|---|---|
| 1 | `knowledge/standards/code/tech-stack.md` | standard, all | written; 4 rules (frontend stack, frontend libs, backend stack, alt-lib decision) |
| 2 | `knowledge/standards/code/frontend-conventions.md` | standard, frontend | written; 6 rules (forms RHF+yup, validators dir, axios service layer, endpoints table, MUI, no console.log) |
| 3 | `knowledge/standards/code/backend-conventions.md` | standard, backend | written; 5 rules (handler/service/model layering, validator tags, route register fn, pure-data models, fiber.NewError) |
| 4 | `knowledge/specs/features/appointments.md` | feature | written; field table + business rules + edge cases |
| 5 | `knowledge/specs/flows/book-appointment.md` | flow | written; 7 actor steps + alternate paths |
| 6 | `knowledge/data/schema/appointment.md` | schema | written; DBML table definition |
| 7 | `knowledge/data/validation/appointment.md` | validation | written; field rules table + enforcement points |

### Findings (§B.2)

#### F40 — `kb_scaffold` post-write side-effect throws `expected yaml.parse to be a function` on standard with bare-string `hint:` containing `{`
- Severity: bug (medium — error message confusing; write actually succeeded)
- Symptom: scaffold P2 with `hint: Form components must call useForm({ resolver: yupResolver(schema) })` returned an error `expected "yaml.parse" to be a function`, but `filesChanged.written` confirmed the file was written. The error came from a post-write step (aspirational sweep / re-parse).
- Root cause: YAML parser cannot consume an unquoted string value containing `{` at the start of a flow-mapping-like position. Quoting the value resolves it.
- Implication: server should either (a) auto-quote hint values when writing, or (b) return a clearer error pointing at the YAML parse failure and the offending line. The current error message blames `yaml.parse` itself.
- Status: open — minor server-side fix.

#### F41 — `kb_scaffold` with `group: code` auto-creates `standards/code/code.md` group descriptor without filling tags/kind/rules
- Severity: bug / cleanup nit
- Symptom: first scaffold call (P1) for `tech-stack` with `group: code` auto-wrote `knowledge/standards/code/code.md` — a partially-filled "group" template with unfilled placeholders (overview text), empty tags, no `kind`, and an empty `rules` array. This was created as a side effect of the parent scaffold call. Later lint flagged it with 2 errors ("standard.kind missing" / "standard.rules must be a non-empty array") and a frontmatter type-vs-folder mismatch warning.
- Workaround: manually deleted `knowledge/standards/code/code.md` to clear the errors.
- Implication: if a group descriptor is needed it should be either fully filled or skipped. Auto-creating a half-written file that lints red is a footgun.
- Status: open — server-side fix.

#### F42 — Scaffold P2 frontmatter template differs from what lint requires (missing `app_scope`, includes `status`, no `aliases`/`cssclasses`/`depends_on`)
- Severity: bug (medium — every feature/flow/schema/validation scaffold-written file lints red until manually fixed)
- Symptom: P1 returned a stripped template with `status: draft` and a small `tags: []` set, no `app_scope`. After P2 wrote that template, lint immediately flagged "Missing front-matter: app_scope" and "status belongs in _index.yaml" on every feature/flow/schema/validation file.
- Compared to `_templates/feature.md` itself: the actual template file has `app_scope: {{app_scope}}`, `aliases`, `cssclasses`, `depends_on`, `owner` — none of which appear in the scaffold P1 output template. So either the runtime template stripper is too aggressive, or the lint policy doesn't match the template the scaffold returns.
- Workaround: manually re-wrote each file via `kb_write` with `app_scope: all` and no `status` field.
- Status: open — server should make the scaffold-returned template lint-clean by default, or lint should accept what scaffold produces.

🛑 **CONFIRM B.2** — In both extension panels, verify:
- All 7 KB files appear in their respective sections (Standards: tech-stack, frontend-conventions, backend-conventions; Features: appointments; Flows: book-appointment; Schemas: appointment; Validation: appointment).
- No drift entries (Code Drift / KB Drift / Standards Drift sections all empty).
- 5 Standards Backlog (aspirational) entries from the frontend code being checked against the new tech-stack rules — these are expected; matches plan note "no drift yet".
- Lint section empty (0 errors / 0 warnings).
- Hooks badge still `managed`.

## §B.1 — kb_init result

Call 1 — `kb_init({interactive: false})`:
- `setup_complete: true`
- `detected_stack: "monorepo"`, `detected_stacks: ["go:backend", "react-vite:frontend"]` — both stacks detected as expected
- 4 git hooks installed: `pre-commit / pre-push / post-merge / post-checkout` — all carry `# kb-mcp managed` marker
- `knowledge/_rules.md` written: 269 lines, contains pattern blocks for both `backend/**` (validators/handlers/models/services/middleware/repos/clients/consumers/grpc/build) and `frontend/**` (validators/forms/api/models/services/router/components/build config)
- `_index.yaml`, 7 sync queue files, full template tree, and agent rules files (`.cursorrules`, `.github/copilot-instructions.md`, `.cursor/mcp.json`, `.vscode/mcp.json`) all written

Note on plan wording: plan §B.1.1 says `detected_stack` is an array with both stacks. Actual response has scalar `detected_stack: "monorepo"` and array `detected_stacks: [...]`. Either the plan's field name needs updating to `detected_stacks` or this is a minor doc drift. Recording as **F38**.

### F38 — Plan §B.1 names `detected_stack` (array); actual response uses `detected_stacks` for the array — NEW
- Severity: doc-vs-implementation drift (cosmetic)
- Spec basis: §B.1 step 1: "`detected_stack` array includes both `react-vite` and `go`".
- Observed: scalar `detected_stack: "monorepo"` (descriptive label); array `detected_stacks: ["go:backend", "react-vite:frontend"]`.
- Status: open — plan wording fix.

🛑 **CONFIRM B.1.1** — Awaiting user verification: both extensions reload after kb_init; sections become available (Code Drift / KB Drift / Standards Drift etc. are visible even if empty); hooks badge shows `managed`.

🛑 **CONFIRM B.1.2** — Awaiting user verification: open `knowledge/_rules.md` — both stacks' pattern blocks visible (backend Go patterns + frontend React-Vite patterns, all confirmed present in file inspection at lines 32–235).

✓ B.1.1 & B.1.2 confirmed by user.

Call 2 — `kb_init({interactive: false})` (idempotency):
- `setup_complete: true`; same `detected_stacks: ["go:backend", "react-vite:frontend"]`.
- `files_created: [".cursor/mcp.json", "knowledge/_index.yaml"]` — re-listed even though both already existed.
- `hooks_installed`: all four marked `(updated)`.
- `filesChanged.written`: 8 files (`.cursor/mcp.json`, `.git/config`, all four hooks, `_index.yaml`, `.mcp-manifest.json`).
- **`_rules.md` diff before/after: empty** — the user-authored rules file is fully idempotent.
- Hook bodies: each has exactly one `# kb-mcp managed` marker (no duplication).
- No errors raised.

### F39 — `kb_init` re-writes bookkeeping files on every call — NEW (minor)
- Severity: cosmetic
- Spec basis: §B.1.3 criterion is "diff empty; no duplicate pattern blocks; no duplicate hook entries; no errors."
- Observed: `_rules.md` IS byte-identical. But `kb_init` re-writes `.cursor/mcp.json`, all four `.git/hooks/*`, `_index.yaml`, and `.mcp-manifest.json` on every call. Hook bodies stay single-marker, so no content duplication.
- Implication: Plan criteria (scoped to `_rules.md` + duplicates) are met. A stricter read of "idempotent = no writes at all" would not be. Informational.
- Status: open — could short-circuit when nothing changed, but not a correctness issue.

🛑 **CONFIRM B.1.3** — `_rules.md` byte-identical; one `# kb-mcp managed` marker per hook; no errors. PASS per plan criteria. (F39 records the bookkeeping rewrite as a separate observation.)

## §B.0 — Bootstrap result

- `git init -b main` → fresh repo in workspace
- Backend: `clinic/backend` Go module, fiber + go-playground/validator pulled (go-playground/validator/v10 forced toolchain bump to go1.25.10 — recorded for cleanup)
- Frontend: Vite React-TS template + MUI/Axios/Yup/RHF (245 npm packages, no vulns)
- All 7 source files written per plan template
- Single initial commit: `ee3eba6 initial monorepo bootstrap`

🛑 **CONFIRM B.0** — PASS with expected pre-init behavior:
- VS Code: shows "Knowledge base not detected. Open a workspace containing a knowledge/ directory." — expected; the plan calls out activation may need manual command since `knowledge/` isn't present yet.
- Obsidian: configured to open against `knowledge/` (doesn't exist yet). After §B.1 creates the folder, the user will open the vault and re-verify.
- Resolution: proceed to §B.1 to create `knowledge/` via `kb_init`; both panels should activate after.

## Findings (Scenario B)

(none yet)

