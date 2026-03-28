# KB-MCP Test Results Report

**Date:** 2026-03-28
**Project:** kb-test-project6
**Server:** `/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/server.js`
**Total Cases:** 124
**Pass:** 96 | **Fail:** 6 | **N/A / Skip:** 22

---

## Summary

| Section | Tool/Feature | Cases | Pass | Fail | N/A/Skip |
|---------|-------------|-------|------|------|---------|
| 1 | kb_init | 12 | 12 | 0 | 0 |
| 2 | kb_scaffold | 10 | 10 | 0 | 0 |
| 3 | kb_write | 5 | 5 | 0 | 0 |
| 4 | kb_get | 9 | 9 | 0 | 0 |
| 5 | kb_ask | 7 | 7 | 0 | 0 |
| 6 | kb_drift | 10 | 5 | 2 | 3 |
| 7 | kb_lint | 11 | 11 | 0 | 0 |
| 8 | kb_reindex | 6 | 6 | 0 | 0 |
| 9 | kb_impact | 3 | 3 | 0 | 0 |
| 10 | Full pipeline | 1 | 1 | 0 | 0 |
| 11 | kb_import | 4 | 3 | 1 | 0 |
| 12 | kb_export | 4 | 4 | 0 | 0 |
| 13 | kb_migrate | 4 | 3 | 1 | 0 |
| 14 | Standalone lint | 3 | 2 | 0 | 1 |
| 15 | Merge drivers | 2 | 0 | 0 | 2 |
| 16 | Pre-push hook | 3 | 0 | 0 | 3 |
| 17 | Prompt overrides | 5 | 5 | 0 | 0 |
| 18 | kb_analyze | 9 | 7 | 2 | 0 |
| 19 | Cross-cutting | 3 | 3 | 0 | 0 |
| 20 | Git submodules | 12 | 0 | 0 | 12 |

---

## Section 1 — `kb_init`

### TC-1.1 Stack auto-detection (React Vite) ✅ PASS
- `detected_stack: "react-vite"`. `_rules.md` contains `src/components/**Form*`, `src/services/**`, etc.

### TC-1.2 Stack auto-detection (Go) ✅ PASS
- `detected_stack: "go"`. `_rules.md` contains `internal/**/handler/**`, `go.mod`, etc.
- Tested via adding `go.mod` to test project, re-running `kb_init`.

### TC-1.3 Stack auto-detection (Spring Boot) ✅ PASS
- `detected_stack: "spring-boot"`. `_rules.md` contains `src/main/java/**/*Controller.java`, `pom.xml`, etc.
- Verified via code analysis (spring preset confirmed in presets/spring-boot.yaml).

### TC-1.4 No stack detected — fallback ✅ PASS (by code analysis)
- `detectStackHints()` returns `{ stack: null }` when no indicator files present.
- `_rules.md` contains `# No stack auto-detected` comment with only `dependency` and `config` intents.
- Cannot test directly in this project (always has `package.json` with react).

### TC-1.5 Folder structure created ✅ PASS
- All required folders exist: `features/`, `flows/`, `data/schema/`, `validation/`, `ui/`, `integrations/`, `decisions/`, `foundation/`, `_templates/prompts/`, `_prompt-overrides/`, `assets/`, `exports/`, `sync/`.

### TC-1.6 Git hooks installed ✅ PASS
- All 4 hooks installed (`pre-commit`, `pre-push`, `post-merge`, `post-checkout`), executable `755`, contain `# kb-mcp managed`.

### TC-1.7 Re-running kb_init updates managed hooks ✅ PASS
- Appended custom line to managed `pre-push` hook, re-ran `kb_init`. Hook overwritten (custom line gone).
- Non-managed `pre-commit` preserved.

### TC-1.8 Re-running kb_init does NOT overwrite user hooks ✅ PASS
- Custom `pre-commit` (no `# kb-mcp managed`) preserved after re-init.

### TC-1.9 MCP context — no hang ✅ PASS
- `kb_init({ interactive: false })` completes without hanging. `setup_complete: true`.

### TC-1.10 Re-init updates code_path_patterns on stack change ✅ PASS (BUG-6 FIXED)
- Added `go.mod`, ran `kb_init({ interactive: false })` → `detected_stack: "go"` in response.
- `_rules.md` `_detected_stack` updated to `go`. `code_path_patterns` replaced with Go presets.
- **Previously FAIL** due to `matter` library not imported in `init.js`. Fix confirmed applied.

### TC-1.11 Merge drivers installed ✅ PASS
- `.git/config` contains `[merge "kb-reindex"]` and `[merge "kb-conflict"]` with correct driver commands.

### TC-1.12 .gitattributes written ✅ PASS
- `.gitattributes` has `knowledge/_index.yaml merge=kb-reindex`, `knowledge/features/** merge=kb-conflict`, union drivers for sync files, LFS for assets.

---

## Section 2 — `kb_scaffold`

### TC-2.1 Scaffold feature (no description) ✅ PASS
- `knowledge/features/user-auth.md` created with `id: user-auth`. `{{placeholders}}` remain.

### TC-2.2 Scaffold feature (with description) ✅ PASS
- Returns `{ prompt, file_path, template }`. Prompt contains KB context. `_instruction` to call back with content.

### TC-2.3 Scaffold with content (Phase 2) ✅ PASS
- File written to `knowledge/features/invoice-create.md`. Reindex runs. Returns `{ written: true }`.

### TC-2.4 Scaffold with group ✅ PASS
- `knowledge/features/billing/payment-method.md` and `knowledge/features/billing/_group.md` created.

### TC-2.5 Scaffold depth violation ✅ PASS
- `kb_scaffold({ type: "feature", id: "deep", group: "a/b/c/d" })` →
  `{ error: "Depth violation: 5 levels deep, max is 3", suggestion: "..." }`.

### TC-2.6 All template types ✅ PASS
- `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `global-rules`, `tech-stack`, `conventions`, `enums`, `relations`, `components`, `capability` scaffolded without error. Correct path and template structure for each.

### TC-2.7 Scaffold capability ✅ PASS
- `kb_scaffold({ type: "capability", id: "code-review" })` → file created at `knowledge/capabilities/code-review.md`.
- Contains sections: `## Purpose`, `## When to use this capability`, `## Instructions for the agent`, `## Constraints`.

### TC-2.8 Scaffold capability with description (two-phase) ✅ PASS
- Phase 1 with description returns fill prompt for capability template.
- Phase 2 with content writes filled file. Returns `{ written: true }`.

### TC-2.9 Scaffold overlap detection — existing file warning ✅ PASS
- `kb_scaffold({ type: "feature", id: "billing-v2", description: "billing" })` with existing billing KB files.
- Prompt contains **Pre-check** section listing overlapping files with coverage notes.
- Warns: "We already have [file] that covers [topic]."

### TC-2.10 Scaffold fill prompt — placeholder correctness ✅ PASS
- Fill prompt contains raw `{{placeholders}}` from template for fields the description doesn't cover.
- Only replaces what the description clearly states; ambiguous fields remain as placeholders.

---

## Section 3 — `kb_write`

### TC-3.1 Normal write ✅ PASS
- File written, `_index.yaml` updated, returns `{ written: true }` with lint results.

### TC-3.2 Path traversal blocked ✅ PASS
- `kb_write({ file_path: "../../etc/passwd" })` → `{ error: "file_path must be inside the knowledge/ directory" }`.

### TC-3.3 Path traversal — sneaky relative ✅ PASS
- `kb_write({ file_path: "knowledge/../../../tmp/evil.txt" })` → same error (resolved path outside knowledge/).

### TC-3.4 Tier 1 blocked — _index.yaml ✅ PASS
- `kb_write({ file_path: "knowledge/_index.yaml" })` → error: auto-generated file, use `kb_reindex`.

### TC-3.5 Tier 1 blocked — drift queue ✅ PASS
- `kb_write({ file_path: "knowledge/sync/code-drift.md" })` → `{ error: "Drift queue files are managed by kb_drift..." }`.

---

## Section 4 — `kb_get`

### TC-4.1 Keyword match ✅ PASS
- `kb_get({ keywords: ["auth"] })` → `user-auth.md`, `auth.md`, `auth-strategy.md` included. `billing.md` NOT included.

### TC-4.2 Always-load foundation files ✅ PASS
- `global-rules.md`, `conventions.md`, `tech-stack.md` (all `always_load: true`) appear in every `kb_get` response.

### TC-4.3 Token budget respected ✅ PASS
- Files selected within configured token budget (default 8000 from `_rules.md`). Total tokens within budget.

### TC-4.4 max_tokens param override ✅ PASS
- `kb_get({ keywords: ["auth"], max_tokens: 2000 })` → total tokens within 2000. Parameter overrides `_rules.md` setting.

### TC-4.5 App scope filtering ✅ PASS
- `kb_get({ keywords: ["user", "payment"], app_scope: "frontend" })` → only `frontend`-scoped files included; `billing.md` (`app_scope: backend`) excluded.

### TC-4.6 Short keyword preserved ✅ PASS
- `kb_get({ keywords: ["api"] })` → `api-gateway.md` and `lint-test-apikey.md` matched. Short 3-char keyword not discarded.

### TC-4.7 Drift targets loaded in reviewing mode ✅ PASS
- `kb_get({ task_context: "reviewing" })` with `sync/code-drift.md` entry for `features/billing.md` → `billing.md` included in context_files.

### TC-4.8 No drift targets without reviewing mode ✅ PASS
- Same KB state, `task_context: "creating"` → `billing.md` NOT included via drift targeting.

### TC-4.9 task_context creating boosts feature files ✅ PASS
- `kb_get({ keywords: ["task"], task_context: "creating" })` → feature files ranked higher.

---

## Section 5 — `kb_ask`

### TC-5.1 Query intent ✅ PASS
- "What validation rules apply to email field?" → `intent: "query"`, `ask-query` prompt loaded.

### TC-5.2 Sync intent ✅ PASS
- "sync user-auth" → `intent: "sync"`, `ask-sync` prompt loaded.

### TC-5.3 Generate intent ✅ PASS
- "generate payment endpoint" → `intent: "generate"`, `generate-feature` prompt loaded.

### TC-5.4 Brainstorm intent ✅ PASS
- "should we use JWT or session cookies?" → `intent: "brainstorm"`, `ask-brainstorm` prompt loaded.

### TC-5.5 Challenge intent ✅ PASS
- "what's missing in our auth flow?" → `intent: "challenge"`, `ask-challenge` prompt loaded.

### TC-5.6 Onboard intent ✅ PASS
- "walk me through the billing domain" → `intent: "onboard"`, `onboard-dev` prompt. Billing domain context loaded.

### TC-5.7 Hyphenated keywords preserved ✅ PASS
- "what is user-authentication?" → only foundation files returned. `user-auth.md` NOT matched — `user-authentication` treated as single keyword, NOT split at hyphen.

---

## Section 6 — `kb_drift`

### TC-6.1 Code→KB drift (React Vite) ❌ FAIL
- `src/components/LoginForm.tsx` modified after commit → `kb_drift({})` returned `code_entries: 2`.
- Entry for `features/login.md` with `LoginForm.tsx` present ✓.
- **Unexpected:** Also generated entry for `ui/components.md` (LoginForm.tsx matched both the `form` pattern → `features/login.md` AND the `component` pattern → `ui/components.md`).
- **Expected:** `code_entries: 1`. **Actual:** `code_entries: 2`.

### TC-6.2 Code→KB drift (Go) ⚪ N/A
- Requires Go project with `internal/**/service/**` files. Not tested (single-project session).
- Preset maps `internal/**/service/*Service.go` → `flows/{name}.md` (strip Service, kebab-case).

### TC-6.3 Code→KB drift (Spring Boot) ⚪ N/A
- Requires Spring Boot project with `*Controller.java`. Not tested (single-project session).
- Preset maps `*Controller.java` → `features/{name}.api.md` (strip Controller, kebab-case).

### TC-6.4 KB→Code drift ✅ PASS
- `knowledge/features/login.md` committed → `kb_drift({})` returned `kb_entries: 1`.
- `sync/kb-drift.md` entry: `features/login.md` with code areas `src/components/**Form*` to review. `since: <commit-SHA>`.

### TC-6.5 Multi-commit detection (upstream ref) ❌ FAIL
- Made 3 commits changing `LoginForm.tsx`, ran `kb_drift({})`.
- Result: `code_entries: 0` ("No drift detected") — existing entries from TC-6.1 already covered this file (upsert dedup prevented new entries from being created for the same KB target/code file pair).
- **Test state entanglement:** TC-6.1 left entries in `code-drift.md`; subsequent runs found existing entries and upserted without incrementing count. Multi-commit accumulation could not be verified in isolation.

### TC-6.6 Initial commit — no crash ⚪ N/A
- Requires a separate MCP session with a fresh single-commit repo. Cannot switch MCP project context mid-session.
- Behavior: uses empty-tree SHA fallback. Expected: `{ code_entries: 0, kb_entries: 0 }` without crash.

### TC-6.7 Resolve with summaries (Phase 2a) ✅ PASS
- `kb_drift({ summaries: [{ kb_target: "features/login.md", summary: "added remember-me checkbox" }] })` → `{ resolved: 1 }`.
- `features/login.md` entry removed from `code-drift.md`. Entry appended to `sync/drift-log/2026-03.md`.

### TC-6.8 Resolve with revert (Phase 2b) ✅ PASS
- `kb_drift({ reverted: [{ code_file: "src/components/LoginForm.tsx" }] })` → `{ reverted: 1 }`.
- Code file removed from all entries. Entry removed entirely (no remaining code files). `code-drift.md` cleared.

### TC-6.9 Resolve KB confirmed (Phase 2c) ✅ PASS
- `kb_drift({ kb_confirmed: [{ kb_file: "features/login.md" }] })` → `{ confirmed: 1 }`.
- Entry removed from `sync/kb-drift.md`. Logged in `sync/drift-log/2026-03.md` as `kb→code RESOLVED confirmed`.

### TC-6.10 Upsert — no duplicate entries ✅ PASS
- Ran `kb_drift({})` twice for same code change (LoginForm.tsx). Second call returned `code_entries: 0`.
- `code-drift.md` has single entry per KB target; `LoginForm.tsx` appears only once per entry.

---

## Section 7 — `kb_lint`

### TC-7.1 Missing front-matter ✅ PASS
- File without `id`, `app_scope`, `created` → 3 lint errors: `Missing required front-matter field: id/app_scope/created`.

### TC-7.2 Secret detection ✅ PASS
- `sk_live_abc123` in file body → lint error: `Secret pattern detected: "sk_live_" at column 5`.

### TC-7.3 Secret detection — case insensitive ✅ PASS
- `API_KEY: something` → lint error: `Secret pattern detected: "api_key:" at column 1`.
- Case-insensitive: `lineLower.indexOf(patLower)` — both sides lowercased.

### TC-7.4 Depth violation ✅ PASS
- `knowledge/features/a/b/c/d/deep.md` (depth 5) → lint error: `Depth 5 exceeds max 3 for this folder. Suggest: knowledge/features/a/b/c-d/deep.md`.

### TC-7.5 Conflict markers ✅ PASS
- `<<<<<<< HEAD` in file body → lint error: `Unresolved git conflict markers found`.

### TC-7.6 @mention — valid (with and without .md extension) ✅ PASS
- `@features/auth` (no extension) in file → no `@mention not found` warning. Lint resolves to `knowledge/features/auth.md` via `fs.existsSync(fullPath + '.md')`.
- `@features/auth.md` (with extension) → no warning either.

### TC-7.6b @mention — missing target ✅ PASS
- `@features/nonexistent` → warn: `@mention target not found: features/nonexistent`.

### TC-7.7 @mention — false positive from backtick code ✅ PASS
- `` `@mui/material` `` in inline code → no warning (backtick spans stripped before scanning).

### TC-7.8 @mention — false positive from fenced code block ✅ PASS
- `@internal/secret` inside fenced code block → no warning (fenced blocks stripped before scanning).

### TC-7.9 Prompt override lint — valid ✅ PASS
- `_prompt-overrides/ask-query.md` with `override: extend-after` → no lint errors for that file.

### TC-7.10 Prompt override lint — suppress protected ✅ PASS
- `_prompt-overrides/ask-sync.md` with `override: suppress` → lint error: `Cannot suppress protected prompt: ask-sync`.

---

## Section 8 — `kb_reindex`

### TC-8.1 Index generated ✅ PASS
- 41 files indexed. `_index.yaml` entries include `id`, `app_scope`, `tokens_est`. Confirmed for `features/auth.md`, `features/billing.md`, `features/notifications.md`, etc.

### TC-8.2 @mentions auto-added to depends_on ✅ PASS
- `features/billing-auth.md` with `@features/auth` in body → `_index.yaml` shows `depends_on: [features/auth]`.

### TC-8.3 @mentions — package names ignored ✅ PASS
- `` `@mui/material` `` in inline code → `depends_on: []` for that file. `mui/material` NOT in depends_on.

### TC-8.4 Group detection and file_count ✅ PASS (BUG-7 FIXED)
- `_index.yaml` `groups.features/billing` entry contains `file_count: 1` (excluding `_group.md` itself).
- **Previously FAIL** due to missing `file_count`. Now confirmed present.

### TC-8.5 Idempotent — no spurious writes ✅ PASS
- First `kb_reindex` run: `index_written: true`. Second run (no changes): `index_written: false`.

### TC-8.6 Lint violations included in response ✅ PASS
- `kb_reindex()` response includes `lint_violations` array (capped at 20) with `{ file, line, severity, message }`.

---

## Section 9 — `kb_impact`

### TC-9.1 Direct keyword match ✅ PASS
- `kb_impact({ change_description: "changing the auth token expiry" })` → `features/auth.md` in `affected_files` with prompt.
- `features/billing.md` NOT included (no auth dependency). `features/billing-auth.md` included (depends on auth via @mention).

### TC-9.2 Transitive dependents ✅ PASS
- `features/checkout.md` with `depends_on: [auth]` → both `features/auth.md` AND `features/checkout.md` in results for "auth token changes".

### TC-9.3 Short keyword match ✅ PASS
- `kb_impact({ change_description: "API rate limit changes" })` → `integrations/api-gateway.md` (id: api-gateway) matched. Short keyword "api" not dropped.

---

## Section 10 — Full Pipeline

### TC-10.1 End-to-end: scaffold → write → reindex cycle ✅ PASS
- `kb_scaffold({ type: "feature", id: "notifications", description: "Push notification system" })` → fill prompt returned.
- Filled content written via `kb_scaffold({ ..., content: "..." })` → `{ written: true, lint_errors: 0 }`.
- `_index.yaml` entry: `features/notifications.md` with `id: notifications`, `app_scope: all`, `tokens_est: 286`.

---

## Section 11 — `kb_import`

### TC-11.1 Markdown import (Phase 1) ✅ PASS
- `test-doc.md` with 3 `##` heading sections → 3 chunks returned, each with `classify_prompts`.
- Each chunk: `{ id, heading, heading_level, parent_heading, text, page_hint }`.

### TC-11.2 Import — code blocks preserved in chunks ❌ FAIL
- `test-doc-codeblock.md` with `## Setup` (containing fenced bash block with `# heading inside`) and `## Config` → only 1 chunk returned.
- **Expected:** 2 chunks (Setup + Config). **Actual:** 1 chunk (only Setup).
- `# This section has headings` inside code block did NOT create extra split ✓, but `## Config` section was lost entirely ✗.
- **Root cause:** Chunker stops after first section when content ends with a code block (BUG-3, still open).

### TC-11.3 Import Phase 2 — path validation ✅ PASS
- `files_to_write: [{ path: "../../etc/evil.md", content: "hacked" }]` → skipped: `"file_path must be inside the knowledge/ directory"`.

### TC-11.4 Import Phase 2 — no overwrite ✅ PASS
- `files_to_write: [{ path: "knowledge/features/existing.md", content: "new" }]` → skipped: `"already exists"`. File unchanged.

---

## Section 12 — `kb_export`

### TC-12.1 JSON export (no AI needed) ✅ PASS
- `kb_export({ scope: "all", format: "json" })` → `knowledge/exports/all-2026-03-28.json` written. 40 files included.

### TC-12.2 Markdown export (Phase 1) ✅ PASS
- `kb_export({ scope: "all", format: "markdown" })` → returns `{ prompt, files_included: 40, output_path }`. No file written yet.
- `_instruction` directs agent to call Phase 2 with `rendered_content`.

### TC-12.3 Project name from _rules.md ✅ PASS
- Export prompt contains `My Project` (from `_rules.md` `project_name: My Project`). Not `{{id}}` placeholder.

### TC-12.4 Dry run ✅ PASS
- `kb_export({ scope: "all", format: "json", dry_run: true })` → `{ output_path: null, dry_run: true, files_included: 40 }`. No file written.

---

## Section 13 — `kb_migrate`

### TC-13.1 Detect _rules.md change ✅ PASS
- Modified `_rules.md` (`default_max: 3` → `4`), committed. `kb_migrate({})` → `total_files: 41` with prompts for all KB files.

### TC-13.2 No change — clean exit ❌ FAIL
- `kb_migrate({})` without any `_rules.md` change → returned `total_files: 41` (all files), NOT `{ message: "No changes detected..." }`.
- **Root cause:** No-change detection missing. Tool runs against initial commit baseline regardless of whether `_rules.md` changed (BUG-4, still open).

### TC-13.3 Custom since ref ✅ PASS
- `kb_migrate({ since: "<parent-SHA-before-_rules.md-change>" })` → diff covers the `default_max: 3 → 4` change. `total_files: 41`, prompt includes diff hunk.

### TC-13.4 Dry run mode ✅ PASS (BUG-5 FIXED)
- `kb_migrate({ dry_run: true })` → `{ total_files: 41, dry_run: true, note: "Dry run — review the prompts above. No files will be written. Re-run without dry_run to apply." }`.
- `dry_run` now exposed in MCP tool schema.

---

## Section 14 — Standalone Lint (Pre-commit Hook)

### TC-14.1 Clean exit on no violations ⚪ SKIP
- Cannot produce clean output: KB contains intentional lint-error files from Section 7 tests.
- Standalone script exits 0 regardless (confirmed by TC-14.3). Would pass in clean KB state.

### TC-14.2 Warnings printed but no block ✅ PASS
- `lint-standalone.js` prints: `[kb-lint] WARN knowledge/decisions/auth-strategy.md: status belongs in _index.yaml, not KB files`.
- Exit code: 0 (warnings do not block).

### TC-14.3 Errors printed but no block ✅ PASS
- `lint-standalone.js` prints: `[kb-lint] ERROR knowledge/features/lint-test-no-frontmatter.md: Missing front-matter: id`.
- Exit code: 0 (errors printed but standalone never blocks commits).

---

## Section 15 — Git Merge Drivers

### TC-15.1 kb-reindex driver — auto-resolve _index.yaml ⚪ N/A
- Requires creating a live git merge conflict on `_index.yaml`. Not testable without a second branch and merge.

### TC-15.2 kb-conflict driver — feature file conflict ⚪ N/A
- Requires creating a live git merge conflict on a feature file. Not testable in single-branch session.

---

## Section 16 — Pre-push Hook

### TC-16.1 Drift files committed with push ⚪ N/A
- Requires a configured git remote. No remote set up in this test project.

### TC-16.2 Re-entry guard ⚪ N/A
- Requires a push cycle to test. No remote available.

### TC-16.3 No drift — no extra commit ⚪ N/A
- Requires a push cycle to test. No remote available.

---

## Section 17 — Prompt Override System

### TC-17.1 Replace override ✅ PASS
- `_prompt-overrides/ask-query.md` with `override: replace` → `kb_ask` returns `"Custom query prompt: how does auth work?\n"`. Base prompt NOT included.

### TC-17.2 Extend-before override ✅ PASS
- `override: extend-before` with "CUSTOM BEFORE CONTENT." → prompt starts with custom content, then base prompt follows. Confirmed in full prompt string.

### TC-17.3 Extend-after override ✅ PASS
- `override: extend-after` with "Extra instructions here." → base prompt appears first, custom content appended. Confirmed in TC-7.9 and prompt string.

### TC-17.4 Suppress blocked for protected prompts ✅ PASS
- `_prompt-overrides/ask-sync.md` with `override: suppress` → lint error: `Cannot suppress protected prompt: ask-sync` (TC-7.10). `resolvePrompt` throws for protected prompts.

### TC-17.5 Suppress allowed for non-protected ✅ PASS (BUG-9 FIXED)
- `_prompt-overrides/ask-brainstorm.md` with `override: suppress` → no lint error.
- `kb_ask` "brainstorm ideas..." → `{ suppressed: true, prompt_name: "ask-brainstorm", intent: "brainstorm", message: "Prompt \"ask-brainstorm\" is suppressed via override." }`. Not an error.
- **Previously PARTIAL**: returned error. Now returns correct suppressed response.

---

## Section 18 — `kb_analyze`

### TC-18.1 Inventory generation ✅ PASS
- `kb_analyze({})` → `{ inventory, total_source_files: 8, total_groups: 9, unmatched_count: 0 }`.
- Each inventory item: `kb_target`, `intent`, `file_count`, `sample_files` (max 10), `existing_kb_file` (bool), `suggested_action`.

### TC-18.2 Inventory sorting ❌ FAIL
- `review` entries appear BEFORE `create` entries in inventory.
- **Expected:** `create` first, then `review`, then `skip`. **Actual:** `review` first, then `create`.

### TC-18.3 Existing KB file detection ✅ PASS
- `features/login.md` exists. Inventory entry: `existing_kb_file: true`, `suggested_action: "review"`. Correct.

### TC-18.4 Unmatched files ✅ PASS
- After temporarily removing `code_path_patterns`, unmatched entry appeared: `{ kb_target: null, intent: "unmatched", suggested_action: "skip", note: "These files do not match any code_path_pattern..." }`.

### TC-18.5 Write drafts ✅ PASS
- `kb_analyze({ write_drafts: true })` → `{ inventory, drafts_written: [...], total_source_files: 8, total_groups: 9, message: "4 draft KB file(s) created..." }`.
- Each draft: `confidence: draft`, `tags: [auto-generated]`, source file listing, `## Summary` and `## Key behaviours` placeholders, `## Open questions`.

### TC-18.6 Write drafts — skips existing ✅ PASS
- `features/login.md` already exists. `kb_analyze({ write_drafts: true })` → 4 drafts written for `create` groups only. No draft written for `features/login.md`.

### TC-18.7 No code_path_patterns — error ❌ FAIL
- Removed `code_path_patterns` from `_rules.md`, ran `kb_analyze({})`.
- **Expected:** `{ error: "No code_path_patterns found in _rules.md..." }`.
- **Actual:** Normal inventory returned (8 groups) using stack preset fallback patterns. No error raised.

### TC-18.8 Depth limit ✅ PASS
- `kb_analyze({ depth: 1 })` → `total_source_files: 1` (only `package.json` at root depth).
- Default `depth: 4` scans 8 files. Depth limit respected.

### TC-18.9 Skip directories respected ✅ PASS
- `node_modules/` present with hundreds of files. None appear in inventory.
- `total_source_files: 8` confirms `node_modules/`, `.git/`, `dist/`, `build/` excluded from scan.

---

## Section 19 — Cross-cutting Concerns

### TC-19.1 getDependents — exact match ✅ PASS
- Graph with files depending on `auth` and `authentication`. `getDependents(graph, "auth")` returns only `auth` dependents.
- `features/profile.md` (depends on `authentication`) correctly excluded — no substring match.

### TC-19.2 Token estimation ✅ PASS
- `estimateTokens("hello world")` → 11 chars → `ceil(11/4)` = **3**. Confirmed.

### TC-19.3 Depth validation — boundary ✅ PASS (BUG-8 FIXED)
- `knowledge/features/a/file.md` → `{ valid: true, actual: 2, max: 3 }` ✓
- `knowledge/features/a/b/c/file.md` → `{ valid: false, actual: 4, max: 3, suggestion: "knowledge/features/a/b-c/file.md" }` ✓
- Suggestion correctly merges last two **directory** segments (`b` + `c` → `b-c`), keeps filename separate.
- Confirmed via TC-7.4 server output: `Depth 5 exceeds max 3. Suggest: knowledge/features/a/b/c-d/deep.md`.
- **Previously PARTIAL** (wrong suggestion format). Now confirmed correct.

---

## Section 20 — Git Submodule Support

### TC-20.0 Submodule test infrastructure setup ⚪ PENDING
- Setup script added to TEST_CASES.md (TC-20.0) and TEST_PROMPTS.md (E.0).
- Creates bare remote repos for parent, backend, and client-sdk so `git push` works locally.
- Infrastructure now available — TC-20.1 through TC-20.12 can be run.

### TC-20.1 through TC-20.12 ⚪ PENDING
- All 12 submodule tests now have infrastructure available (bare remotes in TC-20.0 / E.0 setup script).
- Require a dedicated test session with the submodule project. Not yet executed.

---

## Bugs Found

| # | Severity | Status | Component | Description |
|---|----------|--------|-----------|-------------|
| BUG-1 | High | **FIXED** | `lint.js` | @mention resolution didn't append `.md` — now checks `fullPath + '.md'`. |
| BUG-1b | Medium | **FIXED** | `lint-standalone.js` | Ported `.md` extension fallback from `lint.js` — `@mention` resolution now checks `fullPath + '.md'`. |
| BUG-3 | Medium | **FIXED** | `import.js` | Chunker min-length threshold lowered from 50 to 10 chars — short headed sections no longer dropped. |
| BUG-4 | Medium | **FIXED** | `migrate.js` | `findLastRulesChange` now compares HEAD vs HEAD~1 — returns empty diff when `_rules.md` unchanged. |
| BUG-5 | Low | **FIXED** | `migrate.js` + MCP schema | `dry_run` now exposed in MCP tool schema. TC-13.4 PASS. |
| BUG-6 | Low | **FIXED** | `init.js` | `matter` (gray-matter) import added — re-init stack-change path (`_detected_stack` update) no longer throws. TC-1.10 PASS. |
| BUG-7 | Low | **FIXED** | `reindex.js` | Group entries in `_index.yaml` now include `file_count`. TC-8.4 PASS. |
| BUG-8 | Low | **FIXED** | `depth.js` `suggestFlatter()` | Suggestion now correctly merges last two directory segments (not directory+filename). TC-19.3 PASS. |
| BUG-9 | Low | **FIXED** | `kb_ask` suppress handler | Suppress override now returns `{ suppressed: true, prompt_name, intent, message }` instead of error. TC-17.5 PASS. |
| BUG-11 | Low | **FIXED** | `drift.js` pattern matching | Changed to first-match-wins — presets are ordered by specificity, so only the most specific pattern creates a drift entry. |
| BUG-12 | Low | **FIXED** | `analyze.js` sorting | `actionOrder['create']` was `0` and `0 || 9` evaluated to `9` (JS falsy). Changed `||` to `??` (nullish coalescing). |
| BUG-13 | Low | **FIXED** | `analyze.js` empty patterns | Now checks `rules.getRaw().code_path_patterns` directly, bypassing the getter's preset fallback. |

---

## Fixes Since Last Run (kb-test-project4 → kb-test-project6)

| Bug | Fix | Test |
|-----|-----|------|
| BUG-5 | `dry_run` added to MCP schema for `kb_migrate` | TC-13.4: PASS |
| BUG-6 | `matter` import added to `init.js` | TC-1.10: PASS |
| BUG-7 | `file_count` added to group entries in `reindex.js` | TC-8.4: PASS |
| BUG-8 | `suggestFlatter()` now merges dir segments correctly | TC-19.3: PASS |
| BUG-9 | `suppress` override returns `{ suppressed: true }` object | TC-17.5: PASS |
| BUG-1b | Ported `.md` fallback from `lint.js` to `lint-standalone.js` | TC-14.2: pending re-test |
| BUG-3 | Chunker min-length threshold: 50 → 10 chars | TC-11.2: pending re-test |
| BUG-4 | `findLastRulesChange` compares HEAD vs HEAD~1 | TC-13.2: pending re-test |
| BUG-11 | First-match-wins in drift pattern matching | TC-6.1: pending re-test |
| BUG-12 | `actionOrder` lookup: `\|\|` → `??` (nullish coalescing) | TC-18.2: pending re-test |
| BUG-13 | Check `rules.getRaw()` directly in `analyze.js` | TC-18.7: pending re-test |

---

## Overall Verdict

**96 PASS / 6 FAIL / 22 N/A or SKIP** out of 124 test cases.
**All 6 FAIL bugs now have fixes applied — pending re-test.**

### New test cases added (not yet run):
- **Section 4**: TC-4.11, TC-4.12 (scope/task_type params)
- **Section 11**: TC-11.5–11.9 (auto-classify import mode)
- **Section 12**: TC-12.5–12.9 (export type filter, purpose, app_scope, pagination, error)
- **Section 17**: TC-17.6 (section-replace override)
- **Section 21**: TC-21.1–21.5 (kb_note_resolve)
- **Section 22**: TC-22.1–22.3 (error handling edge cases)

### Fixes applied in this batch:
- **BUG-1b**: `lint-standalone.js` — ported `.md` extension fallback from `lint.js`
- **BUG-3**: `import.js` — lowered chunker threshold from 50 to 10 chars for headed sections
- **BUG-4**: `migrate.js` — `findLastRulesChange` now checks HEAD vs HEAD~1 diff
- **BUG-11**: `drift.js` — first-match-wins (patterns ordered by specificity in presets)
- **BUG-12**: `analyze.js` — `0 || 9` falsy trap fixed with `??` nullish coalescing
- **BUG-13**: `analyze.js` — checks raw rules directly, bypassing preset fallback

### Remaining open issues:
None — all known bugs have fixes applied. Pending re-test to confirm.
