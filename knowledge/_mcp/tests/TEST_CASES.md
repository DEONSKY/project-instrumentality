# KB-MCP Comprehensive Test Cases

> Run these against a real test project. Each section covers one tool or subsystem.
> **Pass criteria** are stated per case. Treat any deviation as a failure.

---

## 0. Pre-requisites

Create three empty test projects (or use the scaffolding prompts in `TEST_PROMPTS.md`):

| Project | Stack | Indicator file |
|---------|-------|----------------|
| `test-react-vite` | React + Vite + TypeScript | `package.json` with `"react"` dep |
| `test-go-api` | Go | `go.mod` |
| `test-spring` | Spring Boot | `pom.xml` |

Each must be a git repo with at least one commit.

---

## 1. `kb_init` — Bootstrap

### TC-1.1 Stack auto-detection (React Vite)

```
cd test-react-vite
kb_init({ interactive: false })
```

**Pass:** `detected_stack` is `"react-vite"`. `_rules.md` contains `code_path_patterns` from `presets/react-vite.yaml` (includes `src/components/**Form*`, `src/services/**`, etc.).

### TC-1.2 Stack auto-detection (Go)

```
cd test-go-api
kb_init({ interactive: false })
```

**Pass:** `detected_stack` is `"go"`. `_rules.md` contains Go patterns (`internal/**/handler/**`, `go.mod`, etc.).

### TC-1.3 Stack auto-detection (Spring Boot)

```
cd test-spring
kb_init({ interactive: false })
```

**Pass:** `detected_stack` is `"spring-boot"`. `_rules.md` contains Spring patterns (`src/main/java/**/*Controller.java`, `pom.xml`, etc.).

### TC-1.4 No stack detected — fallback

```
mkdir test-empty && cd test-empty && git init
kb_init({ interactive: false })
```

**Pass:** `detected_stack` is absent. `_rules.md` `code_path_patterns` contains only `dependency` and `config` intents with the comment "No stack auto-detected".

### TC-1.5 Folder structure created

**Pass:** After `kb_init`, all these folders exist:
`features/`, `flows/`, `data/schema/`, `validation/`, `ui/`, `integrations/`, `decisions/`, `foundation/`, `_templates/prompts/`, `_prompt-overrides/`, `assets/design/`, `assets/screenshots/`, `exports/`, `sync/`

### TC-1.6 Git hooks installed

**Pass:** `.git/hooks/pre-commit`, `pre-push`, `post-merge`, `post-checkout` all exist, are executable (`755`), and contain `# kb-mcp managed`.

### TC-1.7 Re-running kb_init updates managed hooks

1. Run `kb_init` once.
2. Manually append `# custom line` to `.git/hooks/pre-push`.
3. Run `kb_init` again.

**Pass:** `pre-push` is overwritten (custom line gone), output shows `pre-push (updated)`. Hooks without `# kb-mcp managed` are NOT overwritten.

### TC-1.8 Re-running kb_init does NOT overwrite user hooks

1. Run `kb_init` once.
2. Replace `.git/hooks/pre-commit` with a custom script (no `# kb-mcp managed`).
3. Run `kb_init` again.

**Pass:** `pre-commit` is untouched. Output does NOT list it.

### TC-1.9 MCP context — no hang

```
echo '{}' | node -e "
  process.stdin.isTTY = false;
  require('./knowledge/_mcp/tools/init').runTool({ interactive: true }).then(r => console.log(JSON.stringify(r)))
"
```

**Pass:** Completes within 5 seconds, uses default config, does not prompt for input.

### TC-1.10 Re-init updates code_path_patterns on stack change

1. Run `kb_init` on a React Vite project → `_rules.md` written with `_detected_stack: "react-vite"`.
2. Add a `go.mod` file to the root (simulating stack change).
3. Run `kb_init` again.

**Pass:** `_rules.md` `code_path_patterns` updated to Go preset patterns. `_detected_stack` updated to `"go"`. Other sections (depth_policy, secret_patterns, etc.) preserved.

### TC-1.11 Merge drivers installed

**Pass:** `.git/config` contains `[merge "kb-reindex"]` and `[merge "kb-conflict"]`.

### TC-1.12 .gitattributes written

**Pass:** `.gitattributes` exists with `knowledge/_index.yaml merge=kb-reindex` and `knowledge/features/** merge=kb-conflict`.

---

## 2. `kb_scaffold` — Create KB files

### TC-2.1 Scaffold feature (no description)

```
kb_scaffold({ type: "feature", id: "user-auth" })
```

**Pass:** `knowledge/features/user-auth.md` created with `id: user-auth` in front-matter. `{{placeholders}}` remain in body.

### TC-2.2 Scaffold feature (with description)

```
kb_scaffold({ type: "feature", id: "invoice-create", description: "Users can create invoices with line items, tax, and due date" })
```

**Pass:** Returns `{ prompt, file_path, template }`. Prompt contains `{{kb_context}}` filled (not raw placeholder). `_instruction` tells agent to call back with content.

### TC-2.3 Scaffold with content (Phase 2)

```
kb_scaffold({ type: "feature", id: "invoice-create", content: "<filled markdown>" })
```

**Pass:** File written to `knowledge/features/invoice-create.md`. `reindex` runs automatically. Returns `{ written: true }`.

### TC-2.4 Scaffold with group

```
kb_scaffold({ type: "feature", id: "payment-method", group: "billing" })
```

**Pass:** File at `knowledge/features/billing/payment-method.md`. `knowledge/features/billing/_group.md` auto-created if missing.

### TC-2.5 Scaffold depth violation

```
kb_scaffold({ type: "feature", id: "deep", group: "a/b/c/d" })
```

**Pass:** Returns `{ error: "Depth violation..." }` with suggestion.

### TC-2.6 All template types

For each type: `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `global-rules`, `tech-stack`, `conventions`, `enums`, `relations`, `components`, `permissions`, `copy`.

**Pass:** File created at expected path with correct template content. No error.

---

## 3. `kb_write` — Write files

### TC-3.1 Normal write

```
kb_write({ file_path: "knowledge/features/test.md", content: "---\nid: test\napp_scope: all\ncreated: 2026-03-21\n---\n\n## Description\n\nTest feature.\n" })
```

**Pass:** File written. `_index.yaml` updated. Returns `{ written: true }` with lint results.

### TC-3.2 Path traversal blocked

```
kb_write({ file_path: "../../etc/passwd", content: "pwned" })
```

**Pass:** Returns `{ error: "file_path must be inside the knowledge/ directory" }`. No file written.

### TC-3.3 Path traversal — sneaky relative

```
kb_write({ file_path: "knowledge/../../../tmp/evil.txt", content: "pwned" })
```

**Pass:** Same error. Path resolves outside `knowledge/`.

### TC-3.4 Tier 1 blocked — _index.yaml

```
kb_write({ file_path: "knowledge/_index.yaml", content: "hacked" })
```

**Pass:** Returns error about auto-generated file.

### TC-3.5 Tier 1 blocked — drift queue

```
kb_write({ file_path: "knowledge/sync/code-drift.md", content: "hacked" })
```

**Pass:** Returns error about drift queue management.

---

## 4. `kb_get` — Load files

### TC-4.1 Keyword match

Create two features (`user-auth.md`, `billing.md`). Then:

```
kb_get({ keywords: ["auth"] })
```

**Pass:** Returns `user-auth.md` in files. `billing.md` NOT included.

### TC-4.2 Always-load foundation files

Create `foundation/global-rules.md` with `always_load: true`.

```
kb_get({ keywords: ["billing"] })
```

**Pass:** `global-rules.md` always in result, plus billing matches.

### TC-4.3 Token budget respected

Create 20 large KB files (each ~1000 tokens). Set `token_budget: 4000` in `_rules.md`.

```
kb_get({ keywords: ["test"] })
```

**Pass:** Total tokens in result ≤ 4000.

### TC-4.4 max_tokens param override

```
kb_get({ keywords: ["test"], max_tokens: 2000 })
```

**Pass:** Total tokens in result ≤ 2000 (overrides `_rules.md` setting).

### TC-4.5 App scope filtering

Create `user-auth.md` with `app_scope: frontend` and `payment.md` with `app_scope: backend`.

```
kb_get({ keywords: ["user", "payment"], app_scope: "frontend" })
```

**Pass:** Returns only `user-auth.md`.

### TC-4.6 Short keyword preserved

```
kb_get({ keywords: ["api"] })
```

**Pass:** Matches files with "api" in path/id/tags (not discarded as too short).

---

## 5. `kb_ask` — Question routing

### TC-5.1 Query intent

```
kb_ask({ question: "What validation rules apply to email field?" })
```

**Pass:** `intent: "query"`, prompt uses `ask-query.md` template.

### TC-5.2 Sync intent

```
kb_ask({ question: "sync user-auth" })
```

**Pass:** `intent: "sync"`, `feature_id` is `"user-auth"`, prompt uses `ask-sync.md`.

### TC-5.3 Generate intent

```
kb_ask({ question: "generate payment endpoint" })
```

**Pass:** `intent: "generate"`, prompt uses `generate-feature.md`.

### TC-5.4 Brainstorm intent

```
kb_ask({ question: "should we use JWT or session cookies?" })
```

**Pass:** `intent: "brainstorm"`, prompt uses `ask-brainstorm.md`.

### TC-5.5 Challenge intent

```
kb_ask({ question: "what's missing in our auth flow?" })
```

**Pass:** `intent: "challenge"`, prompt uses `ask-challenge.md`.

### TC-5.6 Onboard intent

```
kb_ask({ question: "walk me through the billing domain" })
```

**Pass:** `intent: "onboard"`, prompt uses `onboard-dev.md`.

### TC-5.7 Hyphenated keywords preserved

```
kb_ask({ question: "what is user-authentication?" })
```

**Pass:** Context includes files matching `user-authentication` (hyphen not stripped).

---

## 6. `kb_drift` — Drift detection

### TC-6.1 Code→KB drift (React Vite)

1. In `test-react-vite`: create `knowledge/features/login.md` and `src/components/LoginForm.tsx`.
2. Commit both.
3. Modify `src/components/LoginForm.tsx`, commit.
4. Run `kb_drift({})`.

**Pass:** `code_entries: 1`. Entry in `sync/code-drift.md` with KB target `features/login.md` and code file `src/components/LoginForm.tsx`.

### TC-6.2 Code→KB drift (Go)

1. In `test-go-api`: create `knowledge/flows/order.md` and `internal/order/service/order_service.go`.
2. Commit both.
3. Modify `order_service.go`, commit.
4. Run `kb_drift({})`.

**Pass:** Entry targets `flows/order.md` (name extracted: strip `Service`, kebab-case).

### TC-6.3 Code→KB drift (Spring Boot)

1. In `test-spring`: create `knowledge/features/user.api.md` and `src/main/java/com/app/controller/UserController.java`.
2. Commit both.
3. Modify `UserController.java`, commit.
4. Run `kb_drift({})`.

**Pass:** Entry targets `features/user.api.md` (strip `Controller`, kebab-case).

### TC-6.4 KB→Code drift

1. Modify a KB feature file, commit.
2. Run `kb_drift({})`.

**Pass:** `kb_entries: 1`. Entry in `sync/kb-drift.md` lists code areas to review.

### TC-6.5 Multi-commit detection (upstream ref)

1. Make 3 commits changing code files.
2. Run `kb_drift({})` (simulating pre-push).

**Pass:** All 3 commits' changes detected (not just the last one). Uses upstream tracking ref.

### TC-6.6 Initial commit — no crash

```
mkdir fresh && cd fresh && git init
echo "hello" > file.txt && git add . && git commit -m "first"
kb_drift({})
```

**Pass:** Returns result without error (uses empty-tree SHA fallback).

### TC-6.7 Resolve with summaries (Phase 2a)

```
kb_drift({ summaries: [{ kb_target: "features/login.md", summary: "added remember-me checkbox" }] })
```

**Pass:** Entry removed from `code-drift.md`. Entry appended to `sync/drift-log/YYYY-MM.md`.

### TC-6.8 Resolve with revert (Phase 2b)

```
kb_drift({ reverted: [{ code_file: "src/components/LoginForm.tsx" }] })
```

**Pass:** Code file removed from entry. If entry has no more code files, entry removed entirely.

### TC-6.9 Resolve KB confirmed (Phase 2c)

```
kb_drift({ kb_confirmed: [{ kb_file: "features/login.md" }] })
```

**Pass:** Entry removed from `kb-drift.md`. Logged in drift-log.

### TC-6.10 Upsert — no duplicate entries

1. Run drift detection twice for same code change.

**Pass:** Only one entry per KB target. Code file not duplicated within entry.

---

## 7. `kb_lint` — Validation

### TC-7.1 Missing front-matter

Create a `.md` file without `id`, `app_scope`, or `created`.

**Pass:** 3 lint errors (one per missing field).

### TC-7.2 Secret detection

Create a KB file containing `sk_live_abc123` in body.

**Pass:** Lint error with `Secret pattern detected: "sk_live_"`.

### TC-7.3 Secret detection — case insensitive

Create a KB file containing `API_KEY: something`.

**Pass:** Lint error matches (case-insensitive comparison catches `API_KEY:` vs pattern `api_key:`).

### TC-7.4 Depth violation

Create `knowledge/features/a/b/c/d/deep.md`.

**Pass:** Lint error: depth exceeds max.

### TC-7.5 Conflict markers

Create a KB file with `<<<<<<< HEAD` in body.

**Pass:** Lint error: "Unresolved git conflict markers found".

### TC-7.6 @mention — valid (with and without .md extension)

Create `knowledge/features/auth.md` and another file referencing `@features/auth` (no `.md` extension).

**Pass:** No `@mention not found` warning. Lint resolves `@features/auth` → `knowledge/features/auth.md`.

Also test `@features/auth.md` (with extension).

**Pass:** No warning either.

### TC-7.6b @mention — missing target

Create a file referencing `@features/nonexistent`.

**Pass:** Lint warns: `@mention target not found: features/nonexistent`.

### TC-7.7 @mention — false positive from backtick code

Create a KB file with `` `@mui/material` `` in inline code.

**Pass:** No lint warning for `@mui/material` — stripped before scanning.

### TC-7.8 @mention — false positive from fenced code block

Create a KB file with `@internal/secret` inside a ``````` code block.

**Pass:** No lint warning.

### TC-7.9 Prompt override lint — valid

Create `knowledge/_prompt-overrides/ask-query.md`:
```yaml
---
base: ask-query
override: extend-after
---
Extra instructions here.
```

**Pass:** No lint errors.

### TC-7.10 Prompt override lint — suppress protected

Create `knowledge/_prompt-overrides/ask-sync.md`:
```yaml
---
base: ask-sync
override: suppress
reason: "test"
---
```

**Pass:** Lint error: "Cannot suppress protected prompt: ask-sync".

---

## 8. `kb_reindex` — Index rebuild

### TC-8.1 Index generated

Create 3 KB files, run `kb_reindex({})`.

**Pass:** `knowledge/_index.yaml` contains all 3 files with `id`, `app_scope`, `tokens_est`.

### TC-8.2 @mentions auto-added to depends_on

Create `features/billing.md` referencing `@features/auth`.

**Pass:** `_index.yaml` entry for `billing.md` has `auth` in `depends_on`.

### TC-8.3 @mentions — package names ignored

Create a file with `` `@mui/material` `` in inline code.

**Pass:** `_index.yaml` does NOT have `mui/material` in `depends_on`.

### TC-8.4 Group detection and file_count

Create `features/billing/_group.md` and `features/billing/invoice.md`.

**Pass:** `_index.yaml` has `groups.features/billing` with `file_count: 1` (excluding `_group.md` itself). Group membership is set regardless of file processing order (second pass ensures all child files get `group` field).

### TC-8.5 Idempotent — no spurious writes

Run `kb_reindex` twice with no changes.

**Pass:** Second call returns `index_written: false`.

### TC-8.6 Lint violations included in response

Run `kb_reindex` on a KB with lint errors.

**Pass:** Response includes `lint_violations` array (up to 20 items) with `{ file, line, severity, message }` per violation, alongside `lint_errors` and `lint_warnings` counts.

---

## 9. `kb_impact` — Impact analysis

### TC-9.1 Direct keyword match

Create `features/auth.md` and `features/billing.md`.

```
kb_impact({ change_description: "changing the auth token expiry" })
```

**Pass:** `auth.md` in `affected_files` with prompt. `billing.md` NOT included (unless it depends on auth).

### TC-9.2 Transitive dependents

Create `features/checkout.md` with `depends_on: [auth]`.

```
kb_impact({ change_description: "auth token changes" })
```

**Pass:** Both `auth.md` AND `checkout.md` in results.

### TC-9.3 Short keyword match

```
kb_impact({ change_description: "API rate limit changes" })
```

**Pass:** Files with "api" in path/id/tags are matched (not dropped by keyword filter).

---

## 10. `kb_scaffold` + `kb_write` + `kb_reindex` pipeline

### TC-10.1 Full scaffold→write→reindex cycle

1. `kb_scaffold({ type: "feature", id: "notifications", description: "Push notification system" })` → get prompt
2. Agent fills template → call `kb_scaffold({ type: "feature", id: "notifications", content: "<filled>" })`
3. Verify file exists, `_index.yaml` updated, lint passes.

**Pass:** End-to-end with no errors.

---

## 11. `kb_import` — Document import

### TC-11.1 Markdown import (Phase 1)

Create `test-doc.md` with 3 heading sections.

```
kb_import({ source: "test-doc.md" })
```

**Pass:** Returns `chunks` (3 items), each with `classify_prompts`.

### TC-11.2 Import — code blocks preserved in chunks

Create `test-doc.md` with:
```markdown
## Setup
Install dependencies:
\`\`\`bash
# This section has headings
npm install
\`\`\`
## Config
Config steps here.
```

**Pass:** Returns 2 chunks (not 3). `# This section has headings` inside the code block does NOT cause an extra split.

### TC-11.3 Import Phase 2 — path validation

```
kb_import({ files_to_write: [{ path: "../../etc/evil.md", content: "hacked" }] })
```

**Pass:** File skipped with reason `"file_path must be inside the knowledge/ directory"`.

### TC-11.4 Import Phase 2 — no overwrite

Create `knowledge/features/existing.md`. Then:

```
kb_import({ files_to_write: [{ path: "knowledge/features/existing.md", content: "new" }] })
```

**Pass:** Skipped with reason `"already exists"`. Existing file untouched.

---

## 12. `kb_export` — Export

### TC-12.1 JSON export (no AI needed)

```
kb_export({ scope: "all", format: "json" })
```

**Pass:** File written to `knowledge/exports/all-YYYY-MM-DD.json`. Contains all KB files.

### TC-12.2 Markdown export (Phase 1)

```
kb_export({ scope: "all", format: "markdown" })
```

**Pass:** Returns `{ prompt, files_included }`. Does NOT write yet.

### TC-12.3 Project name from _rules.md

Verify that export prompt contains the project name from `_rules.md` (not `{{id}}` placeholder from `global-rules.md` template).

### TC-12.4 Dry run

```
kb_export({ scope: "all", format: "json", dry_run: true })
```

**Pass:** Returns `{ output_path: null, dry_run: true }`. No file written.

---

## 13. `kb_migrate` — Rules migration

### TC-13.1 Detect _rules.md change

1. Modify `_rules.md` (e.g., change `default_max: 3` to `4`). Commit.
2. Run `kb_migrate({})`.

**Pass:** Returns `files` array with prompts for each KB file.

### TC-13.2 No change — clean exit

Run `kb_migrate({})` without any `_rules.md` change.

**Pass:** Returns `{ message: "No changes detected in _rules.md since last commit. Nothing to migrate.", total_files: 0, files: [] }`.

### TC-13.3 Custom since ref

1. Change `_rules.md` in commit A. Add unrelated commits B, C.
2. Run `kb_migrate({ since: "<commit-A-parent-SHA>" })`.

**Pass:** Diff covers the `_rules.md` change from commit A.

### TC-13.4 Dry run mode

1. Change `_rules.md`, commit.
2. Run `kb_migrate({ dry_run: true })`.

**Pass:** Returns `{ total_files: N, files: [...], dry_run: true, note: "Dry run — ..." }`. No files are written. The `note` indicates this was a preview.

---

## 14. `kb_lint` (standalone) — Pre-commit hook

### TC-14.1 Clean exit on no violations

```
node knowledge/_mcp/scripts/lint-standalone.js
```

**Pass:** Exit code 0, no output.

### TC-14.2 Warnings printed but no block

Create a file with `status: active` in front-matter.

**Pass:** Prints `[kb-lint] WARN ...status belongs in _index.yaml`. Exit code 0 (warns, doesn't block).

### TC-14.3 Errors printed but no block

Create a file missing `id` in front-matter.

**Pass:** Prints `[kb-lint] ERROR ...Missing front-matter: id`. Exit code 0 (standalone never blocks).

---

## 15. Git merge drivers

### TC-15.1 kb-reindex driver — auto-resolve _index.yaml

1. Create a merge conflict on `_index.yaml`.
2. Let git invoke the `kb-reindex` driver.

**Pass:** Conflict auto-resolved. `_index.yaml` regenerated from current KB files. Exit code 0.

### TC-15.2 kb-conflict driver — feature file conflict

1. Create a merge conflict on `knowledge/features/auth.md`.
2. Let git invoke the `kb-conflict` driver.

**Pass:** Conflict markers written with `<<<<<<< ours`, `||||||| ancestor`, `======= theirs`. Entry appended to `sync/review-queue.md`. Exit code 1 (conflict preserved for human).

---

## 16. Pre-push hook — drift auto-commit

### TC-16.1 Drift files committed with push

1. Make a code change that triggers drift.
2. Run `git push`.

**Pass:** Pre-push hook writes drift entries, auto-commits them (`chore(kb): update drift queue`), both original commit and drift commit are pushed.

### TC-16.2 Re-entry guard

Verify `KB_DRIFT_COMMITTING` env var prevents the drift auto-commit from triggering another pre-push cycle.

**Pass:** Only one `chore(kb): update drift queue` commit created per push.

### TC-16.3 No drift — no extra commit

Push with no code changes matching any pattern.

**Pass:** No drift commit created. Clean push.

---

## 17. Prompt override system

### TC-17.1 Replace override

Create `knowledge/_prompt-overrides/ask-query.md`:
```yaml
---
base: ask-query
override: replace
---
Custom query prompt: {{question}}
```

**Pass:** `kb_ask` query returns the custom prompt, NOT the bundled one.

### TC-17.2 Extend-before override

Create override with `override: extend-before`.

**Pass:** Custom content appears BEFORE the base prompt content.

### TC-17.3 Extend-after override

Create override with `override: extend-after`.

**Pass:** Custom content appears AFTER the base prompt content.

### TC-17.4 Suppress blocked for protected prompts

Create suppress override for `ask-sync`.

**Pass:** `resolvePrompt` throws error about protected prompt.

### TC-17.5 Suppress allowed for non-protected

Create suppress override for `ask-brainstorm`.

**Pass:** `resolvePrompt` returns `null`. When called via `kb_ask`, returns `{ suppressed: true, prompt_name: "ask-brainstorm", intent: "brainstorm", message: "Prompt \"ask-brainstorm\" is suppressed via override." }` — NOT an error.

---

## 18. Cross-cutting concerns

### TC-18.1 getDependents — exact match

Graph has files with ids `auth` and `authentication`.

```
getDependents(graph, "auth")
```

**Pass:** Only returns files depending on `auth`, NOT `authentication`.

### TC-18.2 Token estimation

```
estimateTokens("hello world") // 11 chars → ceil(11/4) = 3
```

**Pass:** Returns `3`.

### TC-18.3 Depth validation — boundary

`knowledge/features/a/file.md` → depth 2, max for features is 3.

**Pass:** `{ valid: true, actual: 2, max: 3 }`.

`knowledge/features/a/b/c/file.md` → depth 4, max 3.

**Pass:** `{ valid: false, actual: 4, max: 3, suggestion: "knowledge/features/a/b-c/file.md" }`. The suggestion merges the last two *directory* segments (`b` + `c` → `b-c`), keeping the filename (`file.md`) separate.

---

## 19. Git Submodule Support

### TC-19.1 Pre-push guard — owned submodule, branch mismatch blocked

```
# Parent on feature/auth, owned submodule on main, pointer changed
git checkout -b feature/auth        # parent
git -C backend checkout main        # submodule stays on main
# make commit in backend, then: git add backend/ && git commit
git push
```

**Pass:** Push blocked with `[kb] ERROR: Submodule branch mismatch`. Error message includes both fix options (accidental staging vs intentional).

### TC-19.2 Pre-push guard — owned submodule, pointer unchanged (not involved)

```
# Parent on feature/auth, owned submodule on main, but pointer NOT changed
git checkout -b feature/auth
# do NOT stage submodule pointer change
git push
```

**Pass:** Push proceeds without error — submodule not involved.

### TC-19.3 Pre-push guard — shared submodule, non-blocking warning

```
# .gitmodules has kb-shared = true for client-sdk
# client-sdk pointer changed, client-sdk on different branch than parent
git push
```

**Pass:** Push proceeds with `[kb] WARNING: Shared submodule pointer(s) updated` — NOT blocked.

### TC-19.4 Pre-push guard — no .gitmodules, backward compatibility

```
# Project has no .gitmodules file
git push
```

**Pass:** Guard block is a no-op, push proceeds normally. No errors or warnings about submodules.

### TC-19.5 Drift — per-submodule since-ref resolution

```
# Submodule has 3 unpushed commits on feature/auth with upstream set (origin/feature/auth)
# Parent pushes, triggering drift
```

**Pass:** Drift reports all 3 commits worth of changed files (not just the last one). Return includes `submodules_owned` and `submodules_shared` arrays.

### TC-19.6 Drift — shared submodule tag in code-drift.md

```
# Change a file in a shared submodule that matches a code_path_pattern
# Push parent
```

**Pass:** `knowledge/sync/code-drift.md` entry includes `- **Shared module:** true` line.

### TC-19.7 Drift — shared flag round-trip

```
# After TC-19.6, trigger drift again (no new changes)
```

**Pass:** The `Shared module: true` line survives the read→write cycle — it's still present in code-drift.md.

### TC-19.8 Drift — mixed setup (direct code + submodules)

```
# Parent has code in src/ AND a backend/ submodule
# Change files in both, push
```

**Pass:** Drift creates entries for both. Parent files matched by `src/**` patterns, submodule files by `backend/src/**` patterns.

### TC-19.9 detectSubmodules — parses kb-shared attribute

```
# .gitmodules:
# [submodule "backend"]
#   path = backend
#   url = ...
# [submodule "client-sdk"]
#   path = client-sdk
#   url = ...
#   kb-shared = true
```

**Pass:** `detectSubmodules()` returns backend with `isShared: false`, client-sdk with `isShared: true`.

### TC-19.10 kb-feature push — correct order

```
# Owned submodule has commits on feature/auth, no upstream set yet
# git add backend/ && git commit in parent
./knowledge/_mcp/scripts/kb-feature.sh push
```

**Pass:** Submodule pushed first with `-u origin feature/auth`, then parent. No branch mismatch error from hook.

### TC-19.11 kb-feature status — shows all info

```
./knowledge/_mcp/scripts/kb-feature.sh status
```

**Pass:** Output shows parent branch, each submodule's branch, pointer-changed flag, owned/shared label.

### TC-19.12 kb_init — submodule pattern suggestion

```
# Project has .gitmodules with backend/ submodule
# _rules.md has no patterns starting with backend/
kb_init({ interactive: false })
```

**Pass:** Setup guide prints suggestion to add `backend/` prefixed patterns to code_path_patterns. Does NOT auto-modify `_rules.md`.
