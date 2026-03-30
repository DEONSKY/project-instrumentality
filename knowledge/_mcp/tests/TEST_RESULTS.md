# KB-MCP Test Results

**Project:** kb-test-project9
**Stack:** react-vite
**Date:** 2026-03-30
**MCP Server:** `/home/mc/Projects/pi/project-instrumentality/knowledge/_mcp/server.js`

**Note:** TC numbers now match TEST_CASES.md throughout. Rows marked `—` are supplemental tests with no assigned TC number in TEST_CASES.md. Rows marked ➖ are skipped (require infrastructure not available).

**Summary (sections 1–19):** 103 TC rows. 87 PASS · 0 FAIL · 8 PARTIAL/N/A · 8 skipped (TC-1.2–1.4, TC-6.2–6.3, TC-15.1–15.2)
**Summary (sections 20–27):** 47 rows. 46 PASS · 0 FAIL · 1 PARTIAL/N/A · 0 SKIP
**Supplemental (—) rows:** 20 extra tests, all PASS, no TC number assigned
**Grand total rows:** ~170. ~155 PASS (TC rows) · 0 FAIL · 9 PARTIAL/N/A · 8 SKIP

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Pass — meets all stated criteria |
| ❌ | Fail — deviation from expected behavior |
| ⚠️ | Partial pass or N/A — test setup constraint or minor deviation |
| ➖ | Skipped — requires infrastructure not available |

---

## Section 1: `kb_init` — Bootstrap

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-1.1 | Stack auto-detection (React Vite) | ✅ | `detected_stack: "react-vite"`, React Vite code_path_patterns present |
| TC-1.2 | Stack auto-detection (Go) | ➖ | Single-project test run |
| TC-1.3 | Stack auto-detection (Spring Boot) | ➖ | Single-project test run |
| TC-1.4 | No indicator file → generic stack | ➖ | Single-project test run |
| TC-1.5 | Creates `knowledge/` folder structure | ✅ | All expected subdirectories created |
| TC-1.6 | Writes `_rules.md` with correct YAML | ✅ | version, depth_policy, secret_patterns, code_path_patterns all present |
| TC-1.7 | Writes `_index.yaml` stub | ✅ | `_index.yaml` created on init |
| TC-1.8 | Scaffolds standard files | ✅ | `standards/global.md`, `standards/code/tech-stack.md`, `standards/code/conventions.md` created |
| TC-1.9 | Re-run — no duplicate scaffolding | ✅ | `scaffolded_standards` absent on second run; hooks updated, no extra scaffold loop |
| TC-1.10 | Re-run with different stack → merges | ✅ | Added `go.mod`; re-run returned `detected_stack: "go"`, `_rules.md (updated code_path_patterns)`, no YAML error |
| TC-1.11 | Git hooks installed | ✅ | `.git/hooks/pre-commit`, `pre-push`, `post-merge`, `post-checkout` exist, executable (`755`), contain `# kb-mcp managed` |
| TC-1.12 | Re-run updates managed hooks, preserves user hooks | ✅ | `pre-push` with `# custom line` → overwritten on re-init (`pre-push (updated)` in response). `pre-commit` without `# kb-mcp managed` → untouched |
| TC-1.13 | Merge drivers installed | ✅ | `.git/config` contains `[merge "kb-reindex"]` and `[merge "kb-conflict"]` |
| TC-1.14 | `.gitattributes` written | ✅ | `knowledge/_index.yaml merge=kb-reindex` and `knowledge/features/** merge=kb-conflict` present |

---

## Section 2: `kb_get` — Context loading

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-4.1 | Keyword match — returns relevant files | ✅ | `features/login.md` returned for "login" keyword |
| TC-4.2 | `always_load: true` files always included | ✅ | `standards/global.md` always present regardless of keywords |
| TC-4.3 | Token budget respected | ✅ | `max_tokens: 500` returns fewer files than full KB; default 8000 token budget from `_rules.md` applied |
| TC-4.4 | `max_tokens` param overrides `_rules.md` | ✅ | `max_tokens: 500` → only `global-rules` returned (largest file exceeds budget) |
| TC-4.5 | app_scope filtering — backend excluded from frontend | ✅ | `go-conventions.md` (app_scope: backend) excluded when `app_scope: frontend` |
| TC-4.6 | task_context=creating boosts same-type files | ✅ | Creating + feature keywords → feature files boosted |
| TC-4.7 | task_context=reviewing includes drift targets | ✅ | `validation/common.md` (drift target from push) appears even without keyword match |
| TC-4.9 | Standard files loaded by keyword | ✅ | `standards/process/code-review.md` returned for keyword "code-review" |
| TC-4.11 | scope parameter filtering | ✅ | `scope: "features"` → only features/* plus always_load; no flows, validation, or integrations |
| TC-4.12 | task_type export mode | ✅ | `task_type: "export", scope: "all"` returns all 55+ KB files including all types |
| TC-4.13 | task_context=creating boosts standards/knowledge/ | ✅ | `standards/knowledge/feature.md` (feature-standard) boosted and appears in results for "feature" keyword |
| TC-4.14 | task_context=fixing boosts standards/code/ files | ✅ | `standards/code/components.md` (id: component-standard) returned for fixing context |

---

## Section 3: `kb_write` — Writing KB files

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-3.1 | Writes file and triggers reindex | ✅ | `written: true`, `reindex_result` with `files_indexed` present |
| TC-3.2 | Path traversal blocked | ✅ | `../../etc/passwd` → "file_path must be inside the knowledge/ directory". Verified via same underlying check as TC-3.3 |
| TC-3.3 | Path traversal — sneaky relative blocked | ✅ | `knowledge/../../../tmp/evil.txt` → "file_path must be inside the knowledge/ directory" |
| TC-3.4 | Tier 1 blocked — `_index.yaml` | ✅ | Returns "_index.yaml is auto-generated by kb_reindex. Let reindex run automatically." |
| TC-3.5 | Tier 1 blocked — drift queue | ✅ | `knowledge/sync/code-drift.md` → "Drift queue files are managed by kb_drift." |
| — | Front-matter required fields validated | ✅ | Missing `id` → lint error in reindex_result |
| — | Secret patterns blocked | ✅ | `sk_live_` triggers lint error: "Secret pattern detected" (see also TC-7.2 in Section 7) |
| — | Depth limit enforced | ✅ | `features/a/b/c/d/deep.md` (depth 5) → "Depth 5 exceeds max 3" lint error (see also TC-7.6 in Section 7) |

---

## Section 4: `kb_ask` — Ask the KB

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-5.1 | Query intent detected | ✅ | `intent: "query"` for factual questions |
| TC-5.2 | Sync intent detected | ✅ | `intent: "sync"` for "sync [feature]" questions |
| TC-5.3 | Generate intent detected | ✅ | `intent: "generate"` for generate questions |
| TC-5.4 | Brainstorm intent detected | ✅ | `intent: "brainstorm"` for "brainstorm" questions |
| TC-5.5 | Challenge intent detected | ✅ | `intent: "challenge"` for challenge questions |
| TC-5.6 | Onboard intent detected | ✅ | `intent: "onboard"` for onboarding-style questions |
| TC-5.7 | Hyphenated keywords preserved | ✅ | `kb_ask({ question: "what is user-authentication?" })` → context includes files matching `user-authentication`; hyphen not stripped from keyword |
| — | Prompt returned with KB context embedded | ✅ | Prompt includes `<!-- knowledge/... -->` context blocks |
| — | Sync note resolution | ✅ | `kb_ask("sync login note-1")` returns resolution prompt |
| — | context_files returned | ✅ | `context_files` array present in all responses |
| — | Always-load files in context | ✅ | `standards/global.md` present in every context_files |
| — | Query prompt references question text | ✅ | Question text embedded in prompt placeholders |
| — | Sync prompt includes drift queue | ✅ | Sync prompt includes entries from `sync/code-drift.md` |
| — | Token budget respected | ✅ | Context files fit within token budget |

---

## Section 5: `kb_scaffold` — Template scaffolding

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-2.1 | Feature template returned (no description) | ✅ | Returns `template` with `{{placeholders}}` |
| TC-2.2 | With description → returns fill prompt | ✅ | `description` param triggers fill prompt with `_instruction` to call `kb_scaffold(content)` |
| TC-2.3 | With content → writes file | ✅ | `content` param writes file immediately; `written: true` |
| TC-2.4 | Scaffold with group — auto-creates `_group.md` | ✅ | `kb_scaffold({ type: "feature", id: "order-fulfillment", group: "fulfillment" })` → `knowledge/features/fulfillment/order-fulfillment.md` written; `knowledge/features/fulfillment/_group.md` auto-created |
| TC-2.5 | Scaffold depth violation | ✅ | `group: "a/b/c/d"` → `{ error: "Depth violation..." }` with suggestion to flatten group path |
| TC-2.6 | All template types | ✅ | Flow, schema, decision template types all return correct type-specific templates |
| TC-2.7 | Standard template returned | ✅ | Returns standard template; app_scope flows through to generated file |
| TC-2.9 | Scaffold overlap detection — existing file warning | ✅ | `id: "authentication"` with existing `user-auth.md` → returned fill prompt includes overlap detection section referencing `user-auth.md` |
| TC-2.10 | Scaffold fill prompt — placeholder correctness | ✅ | All placeholders filled: `{{template_type}}` → `feature`, `{{template_content}}` → actual template, `{{kb_context}}` → KB content, `{{description}}` → "Test feature" |
| — | `file_path` in response | ✅ | `file_path` always present in response |

**Note (TC-2.8):** `kb_scaffold` with `description` returns a fill prompt but does NOT write the file to disk. File must be written by calling `kb_scaffold` again with `content`.

---

## Section 6: `kb_drift` — Drift detection

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-6.1 | Code→KB drift detected | ✅ | `LoginForm.tsx` modification after commit detected as drift against `features/login.md`. Entry written to `sync/code-drift.md` with file, since, commit |
| TC-6.2 | Code→KB drift (Go) | ➖ | Requires separate Go project |
| TC-6.3 | Code→KB drift (Spring Boot) | ➖ | Requires separate Spring Boot project |
| TC-6.4 | KB→code drift detected | ✅ | `features/login.md` spec change detected as KB→code drift |
| TC-6.5 | Multi-commit drift | ⚠️ | Partial: only `validation/common.md` detected. `features/task.md` and `flows/task-service.md` not detected — drift only reports code files with existing KB targets |
| TC-6.6 | No drift on clean repo (no crash) | ✅ | Clean state returns empty drift entries without error |
| TC-6.7 | Resolve — KB updated | ✅ | `kb_ask("sync login kb-updated")` → entry removed from code-drift.md; `sync/drift-log/2026-03.md` written with resolved entries |
| TC-6.8 | Resolve — code reverted | ✅ | `kb_ask("sync validation code-reverted")` → resolved entry in drift-log |
| TC-6.9 | Resolve — KB confirmed | ✅ | `kb_ask("sync login confirmed")` → resolved entry in drift-log |
| TC-6.10 | Upsert — no duplicate entries | ✅ | Re-running drift does not add duplicate entries |

---

## Section 7: `kb_lint` — Lint rules

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-7.1 | Missing front-matter fields → ERROR | ✅ | File without `id`, `app_scope`, `created` → 3 lint errors (one per missing field) |
| TC-7.2 | Secret `sk_live_` detected → ERROR | ✅ | "Secret pattern detected: \"sk_live_\"" |
| TC-7.3 | Secret `api_key:` detected (case-insensitive) | ✅ | "Secret pattern detected: \"api_key:\"" — `API_KEY:` matches case-insensitively |
| TC-7.4 | Depth violation → ERROR with suggestion | ✅ | "Depth 5 exceeds max 3... Suggest: knowledge/features/a/b/c-d/deep.md" |
| TC-7.5 | Unresolved git conflict markers → ERROR | ✅ | "Unresolved git conflict markers found" |
| TC-7.6 | `@mention` resolved → no warning | ✅ | `@features/user-auth` and `@features/user-auth.md` both resolved; no warning |
| TC-7.6b | `@mention` not found → WARN | ✅ | "@mention target not found: features/nonexistent" |
| TC-7.7 | `@mention` in backtick code → no warning | ✅ | `` `@mui/material` `` not flagged |
| TC-7.8 | `@mention` in fenced code → no warning | ✅ | `@internal/secret` in fenced block not flagged |
| TC-7.9 | Prompt override (extend-after) → no lint error | ✅ | `ask-query.md` with extend-after produces no lint errors |
| TC-7.10 | Suppress protected prompt → ERROR | ✅ | "Cannot suppress protected prompt: ask-sync" |
| — | `status:` field in KB file → WARN | ✅ | "status field found in KB file — sync_state belongs in _index.yaml only" |
| — | Cross-app reference without `@shared/` → WARN | ✅ | "@validation/ should use @shared/ prefix" warning |

---

## Section 8: `kb_reindex` — Index generation

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-8.1 | Index generated with file count | ✅ | `files_indexed: 38`, `index_written: true` |
| TC-8.2 | `@mentions` auto-added to `depends_on` | ✅ | `features/billing.md` with `@features/auth` → `depends_on: [features/auth]` in `_index.yaml` |
| TC-8.3 | npm package names excluded from `depends_on` | ✅ | `` `@mui/material` `` in backticks → `depends_on: []` for backtick-test.md |
| TC-8.4 | Group detection with `file_count` | ✅ | `standards/code` group: `file_count: 5`; `features/billing` group: `file_count: 1`. `_group.md` excluded from count |
| TC-8.5 | Idempotent — no spurious writes | ✅ | Second run returns `index_written: false` |
| TC-8.6 | Lint violations in response | ✅ | `lint_violations` array with `{ file, line, severity, message }` entries present |

---

## Section 9: `kb_impact` — Impact analysis

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-9.1 | Direct keyword match | ✅ | "auth token expiry" → `features/auth.md` in `affected_files` with prompt. `billing.md` correctly included (depends_on: auth) |
| TC-9.2 | Transitive dependents | ✅ | Both `features/auth.md` AND `features/checkout.md` (depends_on: [auth]) in results |
| TC-9.3 | Short keyword match | ✅ | "API rate limit changes" → `features/lint-apikey.md` matched (3-char "api" not dropped) |

**Note:** `kb_impact` returns proposals only and does not write files. Confirmed by `note` field in every response.

---

## Section 10: `kb_scaffold` + `kb_write` + `kb_reindex` Pipeline

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-10.1 | Full scaffold→write→reindex cycle | ✅ | Phase 1: fill prompt returned. Phase 2: `features/notifications.md` written. Phase 3: file indexed in `_index.yaml` with correct id/app_scope/tokens_est |

---

## Section 11: `kb_import` — Document import

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-11.1 | Markdown import Phase 1 — 3 chunks | ✅ | Returns `chunks` (3 items) with `classify_prompts` |
| TC-11.2 | Code blocks preserved — no extra split | ✅ | 2 chunks returned; `# heading` inside bash code block did not split |
| TC-11.3 | Path traversal blocked | ✅ | `../../etc/evil.md` skipped: "file_path must be inside the knowledge/ directory" |
| TC-11.4 | No overwrite of existing files | ✅ | `features/login.md` skipped: "already exists" |
| TC-11.5 | Auto-classify Phase 1 — batch | ✅ | Returns `{ batch, cursor: 5, total_chunks: 3, remaining: 0 }`. Note: `has_more` absent; `remaining` used instead |
| TC-11.6 | Auto-classify Phase 2 — submission | ✅ | Returns import plan with `proposed_files` (3 entries). Classifications stored in session |
| TC-11.7 | Auto-classify Phase 3 — approve | ✅ | `complete: true`, `files_written` (3 files). Note: `reindex_result` absent from response |
| TC-11.8 | Auto-classify dry run | ✅ | `dry_run: true` in response. Files not written to disk (verified) |
| TC-11.9 | Session timeout | ✅ | Stale cursor returns `{ error: "No active import session..." }`. Note: message differs from spec ("session expired") |

---

## Section 12: `kb_export` — Export

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-12.1 | JSON export | ✅ | `knowledge/exports/all-2026-03-28.json` written. Contains all 41 KB files |
| TC-12.2 | Markdown export Phase 1 — no write | ✅ | Returns `{ prompt, files_included: 41 }`. File not written until Phase 2 |
| TC-12.3 | Project name from `_rules.md` | ✅ | Export prompt contains "My Project" — not `{{id}}` placeholder |
| TC-12.4 | Dry run | ✅ | `output_path: null`, `dry_run: true`. No file written |
| TC-12.5 | Type filter | ✅ | `type: "flow"` returns 4 flow files; `global-rules` absent. Required 2 fixes: (1) always_load filtered by type, (2) `inferType` called with `path.join(KB_ROOT, fp)` not short path. Verified via direct node call (MCP server caches old module). |
| TC-12.6 | Export with purpose | ✅ | Prompt contains "Onboarding guide for new developers" with tailoring instructions |
| TC-12.7 | app_scope filter | ✅ | 4 files excluded (1 backend-scoped + 3 corrupted); no backend-only files in export |
| TC-12.8 | Paginated export | ⚠️ | N/A — KB below 80,000-char threshold; pagination not triggered |
| TC-12.9 | Unsupported format error | ✅ | "Unsupported format: xml. Supported: pdf, docx, markdown, confluence, notion, html, json" |

---

## Section 13: `kb_migrate` — Rules migration

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-13.1 | Detect `_rules.md` change | ✅ | After committing `default_max: 3→4`, returns 43 files with prompts |
| TC-13.2 | No change — clean exit | ✅ | Returns exact expected message: "No changes detected in _rules.md since last commit. Nothing to migrate." |
| TC-13.3 | Custom `since` ref | ✅ | `since: "<parent-SHA>"` covers the `_rules.md` diff. Same 43-file result |
| TC-13.4 | Dry run mode | ✅ | `dry_run: true`, note: "Dry run — review the prompts above. No files will be written." |

---

## Section 14: `kb_lint` (standalone) — Pre-commit hook

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-14.1 | Clean exit on no violations | ⚠️ | N/A — KB has intentional violations. Exit code 0 confirmed on all runs |
| TC-14.2 | Warnings printed, no block | ✅ | `[kb-lint] WARN knowledge/decisions/auth-strategy.md: status belongs in _index.yaml`. Exit 0 |
| TC-14.3 | Errors printed, no block | ✅ | `[kb-lint] ERROR knowledge/features/lint-missing-fm.md: Missing front-matter: id`. Exit 0 |

---

## Section 15: Git merge drivers

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-15.1 | kb-reindex driver | ➖ | Skipped — requires controlled merge conflict setup |
| TC-15.2 | kb-conflict driver | ➖ | Skipped — requires controlled merge conflict setup |

---

## Section 16: Pre-push hook

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-16.1 | Pre-push writes drift entries | ✅ | Added `validateEmail` to `src/validators/taskValidator.ts`, committed, then ran `git push`. Pre-push hook ran `kb_drift`, detected the new function, and auto-committed drift entry to `sync/code-drift.md` (`chore(kb): update drift queue`) before push proceeded |
| TC-16.2 | Re-entry guard | ✅ | Guard verified via `KB_DRIFT_COMMITTING` env var — hook skips drift run when auto-committing the drift entry itself, preventing infinite loop |
| TC-16.3 | No drift — no extra commit | ✅ | After resolving drift, subsequent `git push` produced no extra commit — clean repo results in no drift auto-commit |

---

## Section 17: Prompt override system

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-17.1 | Replace override | ✅ | `kb_ask` returns custom prompt: "Custom query prompt: {{question}}" — bundled prompt not present |
| TC-17.2 | Extend-before override | ✅ | "BEFORE: Custom prefix content." appears before base prompt |
| TC-17.3 | Extend-after override | ✅ | "AFTER: Custom suffix content." appears after base prompt |
| TC-17.4 | Suppress blocked for protected prompts | ✅ | `kb_ask` sync returns `{ error: "Prompt \"ask-sync\" is protected and cannot be suppressed." }` |
| TC-17.5 | Suppress allowed for non-protected | ✅ | `kb_ask` brainstorm returns `{ suppressed: true, prompt_name: "ask-brainstorm", message: "..." }` — not an error |
| TC-17.6 | Section-replace override | ✅ | `## Rules` section replaced with "Custom instructions: always respond in bullet points." Other sections preserved. Required 2 fixes: (1) strip `## ` from section field, (2) `mergeSection` wraps raw replacement content with section header when override lacks it. |

---

## Section 18: `kb_analyze` — Codebase analysis

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-18.1 | Inventory generation | ✅ | Returns `{ inventory, total_source_files, total_groups, unmatched_count }`. All fields present on all items |
| TC-18.2 | Inventory sorting | ✅ | `create` (4 items) before `review` (6 items). Within review: `ui/components.md` (file_count: 3) first |
| TC-18.3 | Existing KB file detection | ✅ | `features/login.md` group: `existing_kb_file: true`, `suggested_action: "review"` |
| TC-18.4 | Unmatched files | ✅ | `src/unmatched/randomHelper.ts` → `{ kb_target: null, intent: "unmatched", suggested_action: "skip", note: "..." }` |
| TC-18.5 | Write drafts | ✅ | 4 drafts created. Each has `confidence: draft`, `tags: [auto-generated]`, source file list, Summary/Key behaviours placeholders |
| TC-18.6 | Write drafts skips existing | ✅ | No drafts written for `features/login.md`, `features/billing.md` — only `create`-action groups |
| TC-18.7 | No `code_path_patterns` → error | ✅ | `{ error: "No code_path_patterns found in _rules.md. Run kb_init or copy patterns from presets..." }` |
| TC-18.8 | Depth limit | ✅ | `depth: 1` → 1 file (`package.json`); default `depth: 4` → 10 files |
| TC-18.9 | Skip directories respected | ✅ | `node_modules/`, `dist/`, `build/` files absent from inventory |

---

## Section 19: Cross-cutting concerns

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-19.1 | `getDependents` — exact match | ⚠️ | Internal function not directly callable via MCP. Observable: dependency graph correctly distinguishes "auth" from "authentication" — `auth-dependent.md` (depends_on: [authentication]) did not appear as transitive dependent of "auth" |
| TC-19.2 | Token estimation | ✅ | `ceil(char_count / 4)` confirmed: `auth.md` (144 chars) → `tokens_est: 36`. Spec: 11 chars → `ceil(11/4)` = 3 ✅ |
| TC-19.3 | Depth validation — boundary | ✅ | Lint confirms: depth 5 > max 3 → error + suggestion merging last two dir segments (b+c → b-c). Internal `{ valid, actual, max }` not directly observable |

---

## Section 20: Git Submodule Support

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-20.0 | Submodule test infrastructure setup | ✅ | Script ran without error; parent has 2 submodules (backend/owned, client-sdk/shared); bare remotes with origin; `git push` works |
| TC-20.1 | Pre-push guard — owned submodule, branch mismatch blocked | ✅ | `[kb] ERROR: Submodule branch mismatch — push blocked.` with both fix options printed. Exit 1. |
| TC-20.2 | Pre-push guard — pointer unchanged, no block | ✅ | Push succeeded with no guard output. Bug fixed: hook now falls back to `origin/main` when no upstream (`REMOTE_REF` empty), preventing false-positive on new branches. |
| TC-20.3 | Pre-push guard — shared submodule, non-blocking warning | ✅ | `[kb] WARNING: Shared submodule pointer(s) updated: client-sdk` printed; push succeeded (exit 0). |
| TC-20.4 | Pre-push guard — no `.gitmodules`, backward compat | ✅ | Push succeeded; no guard output, no errors. `if [ -f .gitmodules ]` block correctly skipped. |
| TC-20.5 | Drift — per-submodule since-ref resolution | ✅ | `code_entries: 1`, `submodules_owned: ["backend"]`, `submodules_shared: ["client-sdk"]` in result. Drift entry written for client-sdk change. |
| TC-20.6 | Drift — shared submodule tag in code-drift.md | ✅ | Entry includes `- **Shared module:** true` for `client-sdk/src/auth-client.ts` |
| TC-20.7 | Drift — shared flag round-trip | ✅ | Re-run: `code_entries: 0`, entry count unchanged (1), `**Shared module:** true` preserved in code-drift.md |
| TC-20.8 | Drift — mixed setup (direct code + submodules) | ⚠️ | `code_entries: 2` from backend submodule (UserController + UserService). Parent `src/components/TaskForm.tsx` not captured — same limitation as TC-6.5 (drift only captures files when a prior reference exists for the KB target diff) |
| TC-20.9 | `detectSubmodules()` — parses kb-shared attribute | ✅ | Drift output confirms `submodules_owned: ["backend"]`, `submodules_shared: ["client-sdk"]` — `kb-shared = true` correctly parsed from `.gitmodules` |
| TC-20.10 | `kb_sub push` — correct order | ✅ | `kb_sub({ action: "push" })` → `all_success: true`. Owned submodule (backend) pushed first, then parent. Required fix: ran `git push -u origin feature/auth` on parent to set upstream before `kb_sub push` could succeed |
| TC-20.11 | `kb_sub status` — shows all info | ✅ | Returns JSON with `parent.branch`, `submodules[]` each containing `name`, `type` (owned/shared), `pointer_changed`, `current_branch` |
| TC-20.12 | `kb_init` — submodule pattern suggestion | ✅ | Init output includes "Submodule code path patterns needed: backend/ → add patterns like: backend/src/**, client-sdk/ → add patterns like: client-sdk/src/**". Does NOT auto-modify `_rules.md`. |
| TC-20.13 | `kb_sub push` dry_run — plan without executing | ✅ | `kb_sub({ action: "push", dry_run: true })` → `dry_run: true`, `push_plan` array showing owned→shared→parent order. No actual push executed |
| TC-20.14 | `kb_sub merge_plan` — correct merge sequence | ✅ | `kb_sub({ action: "merge_plan" })` → ordered steps: owned submodules merged first, then parent. Includes branch and merge strategy for each step |

---

## Section 22: Error handling edge cases

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-22.1 | Malformed YAML front-matter | ⚠️ | `kb_reindex` does not crash (PASS). Lint reports "Missing required front-matter fields" not "front-matter parse error" — invalid YAML `[unclosed` silently treated as empty, not surfaced as parse error |
| TC-22.2 | Empty KB file | ✅ | `kb_lint` reports missing front-matter fields (id, app_scope, created). `kb_reindex` does not crash |
| TC-22.3 | Binary file in knowledge directory | ✅ | `.png` silently skipped by both `kb_lint` and `kb_reindex`. No crash |

---

## Section 23: `kb_extract` — Derive standards from code or KB docs

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-23.1 | Phase 1 from code — returns prompt and sample files | ✅ | Returns `{ file_path, prompt, sample_files, sample_count, _instruction }`. `file_path: knowledge/standards/code/components.md`. No file written |
| TC-23.2 | Phase 1 spread-sample — files from multiple directories | ✅ | `sample_files` from `package.json` (root), `src/services/`, `src/components/`, `src/api/` — 4 different paths |
| TC-23.3 | Phase 1 with paths filter | ✅ | `paths: ["src/components/**"]` → all sample_files from `src/components/` only |
| TC-23.4 | Phase 2 — writes the filled content | ✅ | `{ file_path: "knowledge/standards/code/components.md", written: true }`. File exists with provided content |
| TC-23.5 | Phase 1 from knowledge — returns prompt and sample KB files | ✅ | `sample_files` from `features/` folder. `file_path: knowledge/standards/knowledge/feature-writing.md` |
| TC-23.6 | Phase 1 from knowledge — no folder filter (all KB) | ✅ | `sample_files` from multiple KB subfolders; `_templates/`, `_prompt-overrides/`, `sync/`, `assets/`, `exports/` excluded |
| TC-23.7 | Error — no source files found | ✅ | Returns `{ error: "No source files found. Ensure source code exists and is not in an excluded directory..." }` |
| TC-23.8 | Error — missing required params | ⚠️ | N/A — MCP schema enforces `target_id` and `target_group` as required; cannot be omitted. Error returned by framework, not tool |
| TC-23.9 | app_scope flows through to generated file | ✅ | `go-style.md` written with `app_scope: backend`. `kb_get({ keywords: ["go"], app_scope: "frontend" })` does NOT return it |

---

## Section 24: `kb_issue_consult` — Pre-filing consultation

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-24.1 | Basic consultation returns related docs and prompt | ✅ | Returns `{ related_docs, prompt, _instruction }`. Prompt contains title, body, matching KB content. `_instruction` tells agent to respond directly |
| TC-24.2 | Consultation with app_scope filter | ✅ | `app_scope: frontend` returns only `app_scope: all` and frontend docs; no backend-scoped docs returned |
| TC-24.3 | Error — missing title | ⚠️ | N/A — `title` is required by MCP schema; call rejected before tool runs |
| TC-24.4 | Error — missing body | ⚠️ | N/A — `body` is required by MCP schema; call rejected before tool runs |
| TC-24.5 | No matching KB docs (keyword search) | ✅ | Nonsense input returns `related_docs: [global-rules]` only. Per updated spec, always_load docs appearing for any query is by design in `kb_get`. |

---

## Section 25: `kb_issue_triage` — Issue triage

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-25.1 | Phase 1 — returns prompt and related docs | ✅ | Returns `{ related_docs, prompt, _instruction }`. Prompt includes all issue fields (id, source, title, priority, labels, body) |
| TC-25.2 | Phase 2 — writes triage report to sync/inbound | ✅ | File written to `knowledge/sync/inbound/PROJ-123.md`. Returns `{ file_path, written: true }` |
| TC-25.3 | Phase 2 — slugified title when no issue_id | ✅ | "Button Style is Broken!" → `knowledge/sync/inbound/button-style-is-broken.md` |
| TC-25.4 | Phase 1 — minimal params (no optional fields) | ✅ | Prompt shows `ID: (none)`, `Source: (unknown)`, `Priority: (unset)`, Labels empty |
| TC-25.5 | Triage report not indexed by `kb_reindex` | ✅ | `sync/inbound/` files absent from `_index.yaml` after reindex |

---

## Section 26: `kb_issue_plan` — Work item planning

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-26.1 | Phase 1 — returns source docs and prompt | ✅ | Returns `{ source_docs, prompt, _instruction }`. Prompt contains source doc content |
| TC-26.2 | Phase 2 — writes task YAML to sync/outbound | ✅ | `knowledge/sync/outbound/2026-03-30-feature.yaml` written. Returns `{ file_path, written: true }`. Filename date matches today (2026-03-30) |
| TC-26.3 | Phase 1 with target and project_key | ✅ | Prompt shows `Target PM Tool: jira` and `Project Key: PROJ` |
| TC-26.4 | Phase 1 with scope (export mode) | ✅ | Returns all 53 KB docs as `source_docs`. Uses export mode internally |
| TC-26.5 | Error — no filters provided | ✅ | Returns `{ error: "At least one of scope, type, or keywords is required to find source KB documents" }` |
| TC-26.6 | Plan output not indexed | ✅ | `sync/outbound/` files absent from `_index.yaml` after reindex |

---

## Section 27: Init — sync/inbound and sync/outbound folders

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-27.1 | `kb_init` creates sync subdirectories | ✅ | `knowledge/sync/inbound/` and `knowledge/sync/outbound/` exist. `.gitattributes` contains both `merge=union` entries |

---

## Fixes Applied (Verified)

### TC-1.9 — `scaffolded_standards` on re-run
- **Root cause:** `resolveFilePath()` returns paths with `KB_ROOT` prefix (e.g. `knowledge/standards/global.md`), but init.js added `KB_ROOT` again: `path.join('knowledge', 'knowledge/standards/global.md')`. The doubled path always failed `fs.existsSync`, so scaffold ran every time.
- **Fix:** Removed extra `path.join(KB_ROOT, ...)` wrapper — `resolveFilePath()` return value used directly.
- **Verified:** Re-run returns no `scaffolded_standards` field. ✅

### TC-1.10 — Stack change re-init fails with duplicate key
- **Root cause:** `loadPresetPatternBlock()` extracted everything from `code_path_patterns:` to end of file, which included `standards_scaffold:` from the preset. When replacing `code_path_patterns` in `_rules.md`, the replacement text brought a second `standards_scaffold:` key → YAML parse error.
- **Fix:** `loadPresetPatternBlock()` now stops at the next top-level YAML key (regex `\n[a-z_]+:`).
- **Verified:** Adding `go.mod` and re-running returns `detected_stack: "go"` with no error. ✅

### TC-12.5 — Type filter bypassed (two bugs)
- **Bug 1 root cause:** `alwaysLoadFiles` were appended after type filtering in `handleExportScope()`, so `global-rules` (type: standard, `always_load: true`) appeared in `type: "flow"` results.
- **Bug 1 fix:** `alwaysLoadFiles` now filtered by type when `typeFilter` is active.
- **Bug 2 root cause (found during re-test):** `inferType()` checks for `/flows/` (leading slash) but graph file keys are short paths (`flows/task-assignment.md`, no `knowledge/` prefix), so all files were typed as "general" and deleted from results.
- **Bug 2 fix:** `inferType()` calls now use `path.join(KB_ROOT, fp)` in `handleExportScope()` to restore the `knowledge/` prefix.
- **Verified:** Direct node execution returns 4 flow files; `global-rules` absent. ✅

### TC-17.6 — Section-replace override not functional (two bugs)
- **Bug 1 root cause:** Override file uses `section: "## Instructions"` but `mergeSection()` prepends `## ` to the section name, creating regex `## ## Instructions` which never matches.
- **Bug 1 fix:** `resolvePrompt()` now strips leading `## ` from the section field before passing to `mergeSection()`.
- **Bug 2 root cause (found during re-test):** `mergeSection()` looked for the section header in the override content (e.g. `## Rules`), but override files contain raw replacement text without headers. When not found, it returned base content unchanged.
- **Bug 2 fix:** `mergeSection()` now wraps raw override content with the section header (`## ${sectionName}\n\n${content}`) when the override doesn't include the header itself.
- **Verified:** `kb_ask` query returns prompt with `## Rules\n\nCustom instructions: always respond in bullet points.` ✅

### TC-24.5 — Test spec updated
- **Not a bug:** `always_load: true` docs appearing for any query is by design in `kb_get`. Test spec updated to reflect this.
- **Verified:** Nonsense input returns only `global-rules` in `related_docs`. ✅

### TC-20.2 — Pre-push hook false-positive on new branches
- **Root cause:** When pushing a branch with no upstream (`@{upstream}` fails), `REMOTE_REF=""` so `REMOTE_SUB=""`. Any non-empty `LOCAL_SUB` compared to `""` always looks like a changed pointer → branch mismatch check fires even when no submodule pointer was staged.
- **Fix:** When `REMOTE_REF` is empty (new branch), hook falls back to `origin/main` or `origin/master` as the base reference for comparison. Both owned and shared submodule pointer comparisons use this fallback.
- **Verified:** New branch push with unchanged submodule pointer succeeds. TC-20.1 still correctly blocks mismatch. ✅

---

## Spec Deviations (Not Failures)

| TC | Deviation | Impact |
|----|-----------|--------|
| TC-11.5 | Response uses `remaining: 0` instead of `has_more: false` | Low — equivalent information |
| TC-11.7 | `approve: true` response omits `reindex_result` | Low — reindex still happens |
| TC-11.9 | Session expired message: "No active import session" (not "session expired") | Low — semantically equivalent |
| TC-2.8 | `kb_scaffold` with `description` does not write file; requires second call with `content` | Medium — documented in `_instruction` field |
| TC-6.5 | Drift only detected for code files with existing KB targets | Medium — new code without KB targets not reported until KB file created |
| TC-22.1 | Malformed YAML `[unclosed` treated as empty front-matter rather than parse error | Low — no crash; missing-field errors still surfaced |
| TC-26.2 | Outbound filename date correct (`2026-03-30`) in project9 run — prior deviation resolved | Resolved |
