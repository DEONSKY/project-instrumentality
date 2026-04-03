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
`features/`, `flows/`, `data/schema/`, `validation/`, `ui/`, `integrations/`, `decisions/`, `standards/code/`, `standards/knowledge/`, `standards/process/`, `_templates/prompts/`, `_prompt-overrides/`, `assets/design/`, `assets/screenshots/`, `exports/`, `sync/`

Neither `capabilities/` nor `foundation/` should exist.

### TC-1.9 Standards stubs auto-scaffolded on init (stack detected)

```
cd test-react-vite
kb_init({ interactive: false })
```

**Pass:** Result contains `scaffolded_standards: ["standards/global.md", "standards/code/tech-stack.md", "standards/code/conventions.md"]`. All three files exist at their paths with template placeholder content (e.g. `{{owner}}`).

Re-run `kb_init`: `scaffolded_standards` is absent (files already exist, skip silently).

### TC-1.10 No standards stubs when no stack detected

```
mkdir test-empty && cd test-empty && git init
kb_init({ interactive: false })
```

**Pass:** `scaffolded_standards` is absent from result (no stack detected = no preset = no scaffold loop).

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
# Call via MCP from the test project:
kb_init({ interactive: true })
```

**Pass:** Completes within 5 seconds, uses default config, does not prompt for input. (MCP server runs non-interactively when stdin is not a TTY.)

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

**Pass:** File at `knowledge/features/billing/payment-method.md`. `knowledge/features/billing/billing.md` (folder note) auto-created if missing — NOT `_group.md`.

### TC-2.4b Scaffold group — folder note naming

```
kb_scaffold({ type: "group", id: "billing", group: "billing" })
```

**Pass:** Group file created at `knowledge/features/billing/billing.md` (named after parent folder). Front-matter has `type: group`. File is NOT named `_group.md`.

### TC-2.5 Scaffold depth violation

```
kb_scaffold({ type: "feature", id: "deep", group: "a/b/c/d" })
```

**Pass:** Returns `{ error: "Depth violation..." }` with suggestion.

### TC-2.6 All template types

For each type: `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `standard`, `global-rules`, `tech-stack`, `conventions`, `enums`, `relations`, `components`, `permissions`, `copy`.

**Pass:** File created at expected path with correct template content. No error.

### TC-2.7 Scaffold standard (no description)

```
kb_scaffold({ type: "standard", id: "code-review", group: "process" })
```

**Pass:** `knowledge/standards/process/code-review.md` created with `id: code-review` in front-matter. `app_scope: all` (default). Template includes sections: Purpose, Rules, Why, Examples, Exceptions.

### TC-2.7b Scaffold standard with app_scope (multi-stack)

```
kb_scaffold({ type: "standard", id: "go-conventions", group: "code", app_scope: "backend" })
kb_scaffold({ type: "standard", id: "ts-conventions", group: "code", app_scope: "frontend" })
```

**Pass:** `go-conventions.md` has `app_scope: backend` in front-matter. `ts-conventions.md` has `app_scope: frontend`. Both have the standard template sections.

Follow-up: `kb_get({ keywords: ["conventions"], app_scope: "frontend" })` returns `ts-conventions.md` but not `go-conventions.md`.

### TC-2.8 Scaffold standard with description (two-phase)

```
kb_scaffold({ type: "standard", id: "components", group: "code",
  description: "React components must be under 200 lines, have a story, and reuse the design system" })
```

**Pass:** Returns `{ prompt, file_path, template }`. Prompt contains filled `{{template_type}}` as `standard`. Agent fills and writes via Phase 2. File written to `knowledge/standards/code/components.md`.

### TC-2.9 Scaffold overlap detection — existing file warning

1. Create `knowledge/features/user-auth.md` with content about user authentication.
2. Run:

```
kb_scaffold({ type: "feature", id: "authentication", description: "User authentication with JWT tokens and session management" })
```

**Pass:** Returned prompt includes the overlap detection section. The `{{kb_context}}` contains `user-auth.md`. The prompt instructs the agent to warn about the existing overlapping file before proceeding.

### TC-2.10 Scaffold fill prompt — placeholder correctness

```
kb_scaffold({ type: "feature", id: "test-fill", description: "Test feature" })
```

**Pass:** Returned prompt has `{{template_type}}` replaced with `feature` (not raw placeholder). `{{template_content}}` replaced with actual template content. `{{kb_context}}` replaced with KB file content. `{{description}}` replaced with `"Test feature"`.

### TC-2.11 Template Obsidian fields — type, aliases, cssclasses

```
kb_scaffold({ type: "feature", id: "user-auth" })
```

**Pass:** `knowledge/features/user-auth.md` created. Front-matter contains:
- `type: feature`
- `aliases: [user-auth]`
- `cssclasses: [kb-feature]`

### TC-2.12 Template callouts — feature

```
kb_scaffold({ type: "feature", id: "test-callouts" })
```

**Pass:** Template body contains `> [!warning] Edge cases` and `> [!question] Open questions` callout blocks (not plain `## Edge cases` / `## Open questions` headings).

### TC-2.13 Template callouts — flow

```
kb_scaffold({ type: "flow", id: "test-flow" })
```

**Pass:** Template body contains `> [!important] Guards` and `> [!question] Open questions` callout blocks.

### TC-2.14 Template callouts — integration

```
kb_scaffold({ type: "integration", id: "test-integration" })
```

**Pass:** Template body contains `> [!caution] Rate limits` and `> [!question] Open questions` callout blocks.

### TC-2.15 Template callouts — decision

```
kb_scaffold({ type: "decision", id: "test-decision" })
```

**Pass:** Template body contains `> [!info] Consequences` callout block with **Positive:** and **Negative / trade-offs:** subsections.

### TC-2.16 Template callouts — validation

```
kb_scaffold({ type: "validation", id: "test-validation" })
```

**Pass:** Template body contains `> [!warning] Cross-field rules` callout block.

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

### TC-4.2 Always-load standards/global.md

Create `standards/global.md` with `always_load: true`.

```
kb_get({ keywords: ["billing"] })
```

**Pass:** `standards/global.md` always in result, plus billing matches.

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

### TC-4.6 task_context — creating boosts same-type files

Create `features/auth.md`, `flows/auth-flow.md`, `validation/auth-rules.md`.

```
kb_get({ keywords: ["auth"], task_context: "creating" })
```

**Pass:** Feature files are boosted in relevance when keywords suggest a feature (score boost for files in matching type folder). Compare result ordering with a plain `kb_get({ keywords: ["auth"] })` call.

### TC-4.7 task_context — reviewing includes drift targets

1. Create a drift entry in `sync/code-drift.md` with heading `## features/billing.md`.
2. Run:

```
kb_get({ keywords: ["auth"], task_context: "reviewing" })
```

**Pass:** `features/billing.md` appears in results (loaded from drift target) even though "billing" doesn't match the keyword "auth". Validation and flow files get a relevance boost.

### TC-4.8 task_context — no drift file, reviewing still works

Delete `sync/code-drift.md` if it exists.

```
kb_get({ keywords: ["auth"], task_context: "reviewing" })
```

**Pass:** No error. Returns normal results with reviewing boosts for validation/flow files.

### TC-4.9 Standard files loaded by keyword

Create `knowledge/standards/process/code-review.md` with `id: code-review`.

```
kb_get({ keywords: ["code-review"] })
```

**Pass:** `standards/process/code-review.md` returned in results. `inferType` returns `"standard"` for this file path.

### TC-4.10 Short keyword preserved

```
kb_get({ keywords: ["api"] })
```

**Pass:** Matches files with "api" in path/id/tags (not discarded as too short).

### TC-4.11 scope parameter filtering

```
kb_get({ scope: "features" })
```

**Pass:** Returns only files under `knowledge/features/` (plus `always_load` foundation files). No flow, validation, or integration files.

### TC-4.12 task_type export mode

```
kb_get({ task_type: "export", scope: "all" })
```

**Pass:** Returns all KB files (export scope mode). Result includes files from all folders.

### TC-4.13 task_context creating boosts standards/knowledge/ files

Create `standards/knowledge/feature.md` with `id: feature-standard`.

```
kb_get({ keywords: ["feature"], task_context: "creating" })
```

**Pass:** `standards/knowledge/feature.md` score is boosted (+0.5). Appears higher in results than an unrelated feature file with equal keyword match.

### TC-4.14 task_context fixing boosts standards/code/ files

Create `standards/code/components.md` with `id: component-standard`.

```
kb_get({ keywords: ["component"], task_context: "fixing" })
```

**Pass:** `standards/code/components.md` score is boosted (+0.3). Appears higher in results than non-standard files with equal keyword match.

### TC-4.15 Type keyword search

Create `features/auth.md` with `type: feature` and `flows/auth-flow.md` with `type: flow` in `_index.yaml` (run `kb_reindex` first).

```
kb_get({ keywords: ["flow"] })
```

**Pass:** `flows/auth-flow.md` appears in results — matched because `type: flow` is part of the searchable text. `features/auth.md` does NOT match on `type`.

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

### TC-7.6 Wikilink — valid (with and without .md extension)

Create `knowledge/features/auth.md` and another file referencing `[[features/auth]]` (no `.md` extension).

**Pass:** No `Wikilink target not found` warning. Lint resolves `[[features/auth]]` → `knowledge/features/auth.md`.

Also test `[[features/auth.md]]` (with extension).

**Pass:** No warning either.

### TC-7.6b Wikilink — missing target

Create a file referencing `[[features/nonexistent]]`.

**Pass:** Lint warns: `Wikilink target not found: features/nonexistent`.

### TC-7.6c Wikilink — section and display text

Create a file referencing `[[features/auth#fields|Auth Fields]]`.

**Pass:** No lint warning (resolves path `features/auth`). `depends_on` in `_index.yaml` contains `features/auth`.

### TC-7.7 Wikilink — false positive from backtick code

Create a KB file with `` `[[internal/path]]` `` in inline code.

**Pass:** No lint warning — stripped before scanning.

### TC-7.8 Wikilink — false positive from fenced code block

Create a KB file with `[[internal/secret]]` inside a ``````` code block.

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

### TC-8.2 Wikilinks auto-added to depends_on

Create `features/billing.md` referencing `[[features/auth]]`.

**Pass:** `_index.yaml` entry for `billing.md` has `features/auth` in `depends_on`.

### TC-8.3 Wikilinks — inline code ignored

Create a file with `` `[[internal/path]]` `` in inline code.

**Pass:** `_index.yaml` does NOT have `internal/path` in `depends_on`.

### TC-8.4 Group detection and file_count — folder note

Create `features/billing/billing.md` (with `type: group` in front-matter) and `features/billing/invoice.md`.

**Pass:** `_index.yaml` has `groups.features/billing` with `file_count: 1` (excluding `billing.md` folder note itself). Group membership is set regardless of file processing order (second pass ensures all child files get `group` field).

### TC-8.4b Group detection — legacy _group.md backward compatibility

Create `features/billing/_group.md` (legacy) and `features/billing/invoice.md`.

**Pass:** `_index.yaml` still detects `features/billing` as a group with `file_count: 1`. `_group.md` excluded from count. Both naming conventions (`{name}.md` and `_group.md`) are detected.

### TC-8.7 `type` field — explicit front-matter

Create `features/checkout.md` with `type: feature` in front-matter. Run `kb_reindex`.

**Pass:** `_index.yaml` entry for `checkout.md` has `type: feature`.

### TC-8.8 `type` field — inferred by path (no front-matter type)

Create `flows/order-lifecycle.md` without a `type` field in front-matter. Run `kb_reindex`.

**Pass:** `_index.yaml` entry for `order-lifecycle.md` has `type: flow` (inferred from `flows/` folder path by `inferType()`).

### TC-8.9 `type` field — inferType coverage

Create one file in each folder: `features/`, `flows/`, `data/schema/`, `validation/`, `integrations/`, `decisions/`, `standards/`, `ui/`, `data/` (non-schema). None has an explicit `type` field.

**Pass:** Each entry in `_index.yaml` gets the correct inferred type: `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `standard`, `ui`, `data`.

### TC-8.10 Embed wikilinks extracted as dependencies

Create `features/checkout.md` with `![[assets/design/checkout-flow.png]]` in body. Run `kb_reindex`.

**Pass:** `_index.yaml` entry for `checkout.md` has `assets/design/checkout-flow.png` in `depends_on` (embed syntax `![[...]]` is parsed the same as `[[...]]`).

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

### TC-9.4 Type keyword match in impact

Create `integrations/stripe.md` with `type: integration`.

```
kb_impact({ change_description: "changing the integration layer" })
```

**Pass:** `integrations/stripe.md` appears in `affected_files` — matched because `type: integration` is searchable text. Files of other types with no keyword match are excluded.

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

### TC-11.5 Auto-classify Phase 1 — batch extraction

Create `test-doc.md` with 3 heading sections (each > 50 chars of content).

```
kb_import({ source: "test-doc.md", auto_classify: true })
```

**Pass:** Returns `{ batch, cursor, total_chunks, has_more }`. Batch contains up to 5 chunks with `classify_prompts`. `cursor` indicates position for next call.

### TC-11.6 Auto-classify Phase 2 — classification submission

```
kb_import({
  source: "test-doc.md",
  auto_classify: true,
  cursor: 5,
  classifications: [
    { chunk_id: "chunk-1", types: [{ type: "feature", confidence: 0.9, suggested_id: "patient-registration" }] }
  ]
})
```

**Pass:** Returns next batch (or import plan if all chunks classified). Classifications stored in session.

### TC-11.7 Auto-classify Phase 3 — approval

```
kb_import({ source: "test-doc.md", auto_classify: true, approve: true })
```

**Pass:** Writes all classified chunks as KB files. Returns `{ files_written, reindex_result }`.

### TC-11.8 Auto-classify — dry run

```
kb_import({ source: "test-doc.md", auto_classify: true, approve: true, dry_run: true })
```

**Pass:** Returns plan without writing files. `dry_run: true` in response.

### TC-11.9 Auto-classify — session timeout

Create a session via `kb_import({ source: "test-doc.md", auto_classify: true })`, then submit a cursor after the session TTL (10 minutes) expires.

**Pass:** Returns `{ error: "... session expired ..." }`. No crash.

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

### TC-12.5 Export with type filter

```
kb_export({ scope: "all", format: "json", type: "flow" })
```

**Pass:** Only flow-type files included in export. `files_included` count matches number of flow files in KB.

### TC-12.6 Export with purpose

```
kb_export({ scope: "all", format: "markdown", purpose: "Onboarding guide for new developers" })
```

**Pass:** Returns prompt containing the purpose text. Prompt instructs agent to tailor output as onboarding guide.

### TC-12.7 Export with app_scope filter

```
kb_export({ scope: "all", format: "json", app_scope: "frontend" })
```

**Pass:** Only files with `app_scope: frontend` or `app_scope: all` included.

### TC-12.8 Paginated export — large KB

Create KB with total content exceeding 80,000 chars.

```
kb_export({ scope: "all", format: "markdown" })
```

**Pass:** Returns `{ page: 1, total_pages: N, has_more: true }`. Calling with `page: 2` returns next batch.

### TC-12.9 Unsupported format error

```
kb_export({ scope: "all", format: "xml" })
```

**Pass:** Returns error about unsupported format. Lists valid formats.

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
# Triggered by the pre-commit hook (installed by kb_init).
# The hook uses BUNDLED fallback path to lint-standalone.js in the MCP server.
# To test manually: make a commit in the test project — hook runs automatically.
git commit --allow-empty -m "test lint hook"
```

**Pass:** Exit code 0, no lint warnings printed.

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

### TC-17.6 Section-replace override

Create `knowledge/_prompt-overrides/ask-query.md`:
```yaml
---
base: ask-query
override: section-replace
section: "## Instructions"
---
Custom instructions: always respond in bullet points.
```

**Pass:** `kb_ask` query returns prompt where the `## Instructions` section is replaced with custom content. Other sections from the base prompt are preserved.

---

## 18. `kb_analyze` — Codebase analysis

### TC-18.1 Inventory generation

In a project with source files and `code_path_patterns` in `_rules.md`:

```
kb_analyze({})
```

**Pass:** Returns `{ inventory, total_source_files, total_groups, unmatched_count }`. Inventory items have `kb_target`, `intent`, `file_count`, `sample_files` (max 10), `existing_kb_file` (boolean), and `suggested_action` (`create`, `review`, or `skip`).

### TC-18.2 Inventory sorting

**Pass:** Inventory is sorted: `create` actions first, then `review`, then `skip`. Within each action group, higher `file_count` comes first.

### TC-18.3 Existing KB file detection

Create `knowledge/features/auth.md`. Ensure a code_path_pattern maps source files to `features/auth.md`.

```
kb_analyze({})
```

**Pass:** The `features/auth.md` group has `existing_kb_file: true` and `suggested_action: "review"`.

### TC-18.4 Unmatched files

Add source files that don't match any `code_path_pattern`.

**Pass:** Inventory includes an entry with `kb_target: null`, `intent: "unmatched"`, `suggested_action: "skip"`, and a note about adding patterns.

### TC-18.5 Write drafts

```
kb_analyze({ write_drafts: true })
```

**Pass:** Returns `{ inventory, drafts_written, total_source_files, total_groups, message }`. Draft files created for groups with `suggested_action: "create"`. Each draft has:
- `confidence: draft` in front-matter
- `tags: [auto-generated]`
- Source file listing
- Summary and Key behaviours placeholders
- Open questions section

### TC-18.6 Write drafts — skips existing

Create `knowledge/features/auth.md`. Run `kb_analyze({ write_drafts: true })`.

**Pass:** No draft written for the `features/auth.md` group. Only groups without existing KB files get drafts.

### TC-18.7 No code_path_patterns — error

Remove all `code_path_patterns` from `_rules.md`.

```
kb_analyze({})
```

**Pass:** Returns `{ error: "No code_path_patterns found in _rules.md..." }`.

### TC-18.8 Depth limit

```
kb_analyze({ depth: 1 })
```

**Pass:** Only scans 1 level deep. Fewer files than default `depth: 4`.

### TC-18.9 Skip directories respected

Create directories named `node_modules/`, `.git/`, `dist/`, `build/` with source files inside.

**Pass:** None of these files appear in the inventory.

---

## 19. Cross-cutting concerns

### TC-19.1 getDependents — exact match

Graph has files with ids `auth` and `authentication`.

```
getDependents(graph, "auth")
```

**Pass:** Only returns files depending on `auth`, NOT `authentication`.

### TC-19.2 Token estimation

```
estimateTokens("hello world") // 11 chars → ceil(11/4) = 3
```

**Pass:** Returns `3`.

### TC-19.3 Depth validation — boundary

`knowledge/features/a/file.md` → depth 2, max for features is 3.

**Pass:** `{ valid: true, actual: 2, max: 3 }`.

`knowledge/features/a/b/c/file.md` → depth 4, max 3.

**Pass:** `{ valid: false, actual: 4, max: 3, suggestion: "knowledge/features/a/b-c/file.md" }`. The suggestion merges the last two *directory* segments (`b` + `c` → `b-c`), keeping the filename (`file.md`) separate.

---

## 20. Git Submodule Support

> **Prerequisites:** Run the submodule setup script (TC-20.0) before any TC-20.x test.
> This creates bare remote repos, a parent project with two submodules (owned + shared),
> and proper `origin` remotes so `git push` works.
>
> **How to test:** These tests CANNOT be run from the standard MCP test project.
> They require a separate multi-repo environment. Follow these steps:
>
> 1. Run the TC-20.0 bash script in your terminal — it creates everything under a temp dir
> 2. Copy `knowledge/_mcp/` from project-instrumentality into `$TEST_ROOT/project/knowledge/_mcp/`
> 3. Also copy `knowledge/_templates/` into `$TEST_ROOT/project/knowledge/_templates/`
> 4. Point your MCP client at `$TEST_ROOT/project` (update `.cursor/mcp.json` or equivalent)
> 5. Run `kb_init({ interactive: false })` to bootstrap hooks, rules, and folder structure
> 6. Add submodule code_path_patterns to `_rules.md` (see E.2 in TEST_PROMPTS.md)
> 7. Now run TC-20.1 through TC-20.12
>
> **See also:** TEST_PROMPTS.md Part E for step-by-step guided prompts (E.1–E.8).
> Part E covers the same functionality as TC-20.1–20.12 in a more guided format.
>
> **TC-20.1–20.4** test pre-push hook guards (require `kb_init` to install hooks).
> **TC-20.5–20.8** test drift detection with submodules (require MCP serving the test project).
> **TC-20.9** tests an internal function (call via `node -e` in the test project).
> **TC-20.10–20.11, TC-20.13–20.14** test `kb_sub` MCP tool (submodule coordination).
> **TC-20.12** tests init's submodule pattern suggestion.

### TC-20.0 Submodule test infrastructure setup

```bash
#!/bin/bash
# Run from any directory. Creates a self-contained test environment.
set -e

TEST_ROOT=$(mktemp -d)
echo "=== Submodule test root: $TEST_ROOT ==="

# ── 1. Create bare remote repos (simulate GitHub/GitLab) ─────────────────────
git init --bare "$TEST_ROOT/remotes/backend.git"
git init --bare "$TEST_ROOT/remotes/client-sdk.git"
git init --bare "$TEST_ROOT/remotes/parent.git"

# ── 2. Create backend source repo (owned submodule) ──────────────────────────
git init "$TEST_ROOT/src/backend"
mkdir -p "$TEST_ROOT/src/backend/src/controllers" "$TEST_ROOT/src/backend/src/services"
cat > "$TEST_ROOT/src/backend/src/controllers/UserController.ts" << 'CTRLEOF'
export class UserController {
  async getUser(id: string) { return { id, name: 'test' } }
  async listUsers() { return [] }
}
CTRLEOF
cat > "$TEST_ROOT/src/backend/src/services/UserService.ts" << 'SVCEOF'
export class UserService {
  async findById(id: string) { return null }
  async create(data: any) { return { id: '1', ...data } }
}
SVCEOF
git -C "$TEST_ROOT/src/backend" add -A
git -C "$TEST_ROOT/src/backend" commit -m "init backend"
git -C "$TEST_ROOT/src/backend" remote add origin "$TEST_ROOT/remotes/backend.git"
git -C "$TEST_ROOT/src/backend" push -u origin main 2>/dev/null || \
git -C "$TEST_ROOT/src/backend" push -u origin master

# ── 3. Create client-sdk source repo (shared submodule) ──────────────────────
git init "$TEST_ROOT/src/client-sdk"
mkdir -p "$TEST_ROOT/src/client-sdk/src"
cat > "$TEST_ROOT/src/client-sdk/src/auth-client.ts" << 'AUTHEOF'
export function authenticate(token: string) { return fetch('/auth/verify') }
export function getSession() { return fetch('/auth/session') }
AUTHEOF
git -C "$TEST_ROOT/src/client-sdk" add -A
git -C "$TEST_ROOT/src/client-sdk" commit -m "init client-sdk"
git -C "$TEST_ROOT/src/client-sdk" remote add origin "$TEST_ROOT/remotes/client-sdk.git"
git -C "$TEST_ROOT/src/client-sdk" push -u origin main 2>/dev/null || \
git -C "$TEST_ROOT/src/client-sdk" push -u origin master

# ── 4. Create parent project with submodules ──────────────────────────────────
git init "$TEST_ROOT/project"
cd "$TEST_ROOT/project"

# Minimal project files for stack detection (React Vite)
cat > package.json << 'PKGEOF'
{ "name": "submodule-test", "dependencies": { "react": "^18.0.0" } }
PKGEOF
mkdir -p src/components
cat > src/components/TaskForm.tsx << 'FORMEOF'
export function TaskForm() { return <form>TODO</form> }
FORMEOF

git add -A && git commit -m "init parent project"
git remote add origin "$TEST_ROOT/remotes/parent.git"

# Add submodules (using bare remotes as URLs — portable)
git submodule add "$TEST_ROOT/remotes/backend.git" backend
git submodule add "$TEST_ROOT/remotes/client-sdk.git" client-sdk

# Mark client-sdk as shared
git config --file .gitmodules submodule.client-sdk.kb-shared true
git add .gitmodules
git commit -m "add submodules: backend (owned), client-sdk (shared)"

# Push parent to its bare remote
git push -u origin main 2>/dev/null || git push -u origin master

# ── 5. Configure MCP client ──────────────────────────────────────────────────
# Point your MCP client (Claude Code, Cursor, etc.) at the project-instrumentality server.
# The server's cwd must be set to $TEST_ROOT/project (the test project).
# Example for .cursor/mcp.json or .claude/mcp.json:
#   { "mcpServers": { "kb": { "command": "node", "args": ["/absolute/path/to/project-instrumentality/knowledge/_mcp/server.js"] } } }

echo ""
echo "=== Setup complete ==="
echo "Project: $TEST_ROOT/project"
echo "Remotes: $TEST_ROOT/remotes/{parent,backend,client-sdk}.git"
echo ""
echo "Next steps:"
echo "  1. cd $TEST_ROOT/project"
echo "  2. Configure MCP client to point at project-instrumentality server"
echo "  3. Run kb_init({ interactive: false }) via MCP"
echo "  4. Add submodule code_path_patterns to _rules.md (backend/src/**, client-sdk/src/**)"
echo "  5. Run TC-20.1 through TC-20.14"
```

**Pass:** Script completes without error. Parent project has two submodules, all three repos have working bare remotes with `origin` configured. `git push` works from parent and both submodules.

### TC-20.1 Pre-push guard — owned submodule, branch mismatch blocked

```
# Parent on feature/auth, owned submodule on main, pointer changed
git checkout -b feature/auth        # parent
git -C backend checkout main        # submodule stays on main
# make commit in backend, then: git add backend/ && git commit
git push
```

**Pass:** Push blocked with `[kb] ERROR: Submodule branch mismatch`. Error message includes both fix options (accidental staging vs intentional).

### TC-20.2 Pre-push guard — owned submodule, pointer unchanged (not involved)

```
# Parent on feature/auth, owned submodule on main, but pointer NOT changed
git checkout -b feature/auth
# do NOT stage submodule pointer change
git push
```

**Pass:** Push proceeds without error — submodule not involved.

### TC-20.3 Pre-push guard — shared submodule, non-blocking warning

```
# .gitmodules has kb-shared = true for client-sdk
# client-sdk pointer changed, client-sdk on different branch than parent
git push
```

**Pass:** Push proceeds with `[kb] WARNING: Shared submodule pointer(s) updated` — NOT blocked.

### TC-20.4 Pre-push guard — no .gitmodules, backward compatibility

```
# Project has no .gitmodules file
git push
```

**Pass:** Guard block is a no-op, push proceeds normally. No errors or warnings about submodules.

### TC-20.5 Drift — per-submodule since-ref resolution

```
# Submodule has 3 unpushed commits on feature/auth with upstream set (origin/feature/auth)
# Parent pushes, triggering drift
```

**Pass:** Drift reports all 3 commits worth of changed files (not just the last one). Return includes `submodules_owned` and `submodules_shared` arrays.

### TC-20.6 Drift — shared submodule tag in code-drift.md

```
# Change a file in a shared submodule that matches a code_path_pattern
# Push parent
```

**Pass:** `knowledge/sync/code-drift.md` entry includes `- **Shared module:** true` line.

### TC-20.7 Drift — shared flag round-trip

```
# After TC-19.6, trigger drift again (no new changes)
```

**Pass:** The `Shared module: true` line survives the read→write cycle — it's still present in code-drift.md.

### TC-20.8 Drift — mixed setup (direct code + submodules)

```
# Parent has code in src/ AND a backend/ submodule
# Change files in both, push
```

**Pass:** Drift creates entries for both. Parent files matched by `src/**` patterns, submodule files by `backend/src/**` patterns.

### TC-20.9 detectSubmodules — parses kb-shared attribute

`detectSubmodules()` is an internal function inside `drift.js` — not directly callable via MCP.
Test indirectly by running `kb_drift` on the test project and inspecting the result.

Expected `.gitmodules` in test project:
```
[submodule "backend"]
  path = backend
  url = ...
[submodule "client-sdk"]
  path = client-sdk
  url = ...
  kb-shared = true
```

```
kb_drift({})
```

**Pass:** Result includes `submodules_owned: ["backend"]` and `submodules_shared: ["client-sdk"]`, confirming `kb-shared = true` is parsed correctly.

### TC-20.10 kb_sub push — correct order

```
# Owned submodule has commits on feature/auth, no upstream set yet
# git add backend/ && git commit in parent
kb_sub({ command: "push" })
```

**Pass:** Result `all_success: true`. Results array shows submodule pushed first (order 1, type "owned", branch "feature/auth"), then parent (order 2, type "parent"). No branch mismatch error from hook.

### TC-20.11 kb_sub status — shows all info

```
kb_sub({ command: "status" })
```

**Pass:** Returns JSON with `parent.branch`, `submodules[]` array. Each submodule entry has `name`, `path`, `branch`, `type` ("owned"/"shared"), `pointer_changed` (boolean).

### TC-20.12 kb_init — submodule pattern suggestion

```
# Project has .gitmodules with backend/ submodule
# _rules.md has no patterns starting with backend/
kb_init({ interactive: false })
```

**Pass:** Setup guide prints suggestion to add `backend/` prefixed patterns to code_path_patterns. Does NOT auto-modify `_rules.md`.

### TC-20.13 kb_sub push dry_run — plan without executing

```
kb_sub({ command: "push", dry_run: true })
```

**Pass:** Returns `dry_run: true`, `push_plan` array with ordered entries (submodules first, parent last), and `skipped` array for unchanged submodules. No actual git push occurs — verify with `git reflog`.

### TC-20.14 kb_sub merge_plan — correct merge sequence

```
# On feature/auth branch with owned submodule pointer changed
kb_sub({ command: "merge_plan", target_branch: "main" })
```

**Pass:** Returns `steps` array with correct merge order: (1) merge owned submodule feature/auth → main, (2) push submodule, (3) submodule_update in parent, (4) merge parent feature/auth → main, (5) push parent. Shared submodules noted separately in `shared_note`.

---

## 22. Error handling edge cases

### TC-22.1 Malformed YAML front-matter

Create `knowledge/features/bad-yaml.md`:
```
---
id: bad-yaml
tags: [unclosed
---
Body content.
```

**Pass:** `kb_lint` reports a front-matter parse error. `kb_reindex` does not crash — file is skipped or error is logged gracefully.

### TC-22.2 Empty KB file

Create `knowledge/features/empty.md` with zero bytes.

**Pass:** `kb_lint` reports missing front-matter fields. `kb_reindex` does not crash.

### TC-22.3 Binary file in knowledge directory

Place a `.png` file at `knowledge/features/diagram.png`.

**Pass:** `kb_lint` and `kb_reindex` skip non-`.md` files. No crash or error.

---

## 23. `kb_extract` — Derive standards from code or KB docs

### TC-23.1 Phase 1 from code — returns prompt and sample files

```
cd test-react-vite   # project with src/ source files
kb_extract({ source: "code", target_id: "components", target_group: "code" })
```

**Pass:** Returns `{ file_path, prompt, sample_files, sample_count, _instruction }`. `file_path` is `knowledge/standards/code/components.md`. `sample_files` is a non-empty array of relative source file paths (`.ts`, `.tsx`, `.js`, etc.). `prompt` contains the sampled file contents and the template structure. `sample_count` matches length of `sample_files`.

No file written at this phase.

### TC-23.2 Phase 1 spread-sample — files from multiple directories

```
cd test-react-vite
kb_extract({ source: "code", target_id: "api", target_group: "code" })
```

**Pass:** `sample_files` contains paths from at least 2 different top-level directories (e.g. both `src/` and a config file). No single directory contributes more than 3 files (unless only 1 directory exists).

### TC-23.3 Phase 1 with paths filter

```
kb_extract({ source: "code", target_id: "forms", target_group: "code",
             paths: ["src/components/**"] })
```

**Pass:** All paths in `sample_files` match `src/components/**`. Files from other directories (e.g. `src/services/`) are excluded.

### TC-23.4 Phase 2 — writes the filled content

```
kb_extract({ source: "code", target_id: "components", target_group: "code",
             content: "---\nid: components\ntype: standard\nscope: code\napp_scope: all\ncreated: 2026-03-28\ntags: []\n---\n\n## Purpose\n\nTest standard.\n\n## Rules\n\n- Rule 1\n\n## Why\n\nBecause.\n\n## Examples\n\nSee code.\n\n## Exceptions\n\nNone.\n" })
```

**Pass:** `{ file_path: "knowledge/standards/code/components.md", written: true }`. File exists with the provided content. No lint errors (valid front-matter).

### TC-23.5 Phase 1 from knowledge — returns prompt and sample KB files

```
kb_scaffold({ type: "feature", id: "user-auth", description: "user authentication" })
# (fill and write to create a KB file first)
kb_extract({ source: "knowledge", target_id: "feature-writing", target_group: "knowledge",
             paths: "features" })
```

**Pass:** `sample_files` contains paths from `features/` folder. `prompt` includes the KB file content. `file_path` is `knowledge/standards/knowledge/feature-writing.md`.

### TC-23.6 Phase 1 from knowledge — no folder filter (all KB)

```
kb_extract({ source: "knowledge", target_id: "kb-style", target_group: "knowledge" })
```

**Pass:** `sample_files` contains files from multiple KB subfolders (features, flows, etc.). Files from `_templates/`, `_prompt-overrides/`, `sync/`, `assets/`, `exports/` are excluded.

### TC-23.7 Error — no source files found

```
mkdir test-empty-code && cd test-empty-code && git init
kb_init({ interactive: false })
kb_extract({ source: "code", target_id: "conventions", target_group: "code" })
```

**Pass:** Returns `{ error: "No source files found..." }` (helpful message, no crash).

### TC-23.8 Error — missing required params

```
kb_extract({ source: "code" })
```

**Pass:** Returns `{ error: "target_id is required" }`.

### TC-23.9 app_scope flows through to generated file

```
kb_extract({ source: "code", target_id: "go-style", target_group: "code",
             app_scope: "backend",
             content: "---\nid: go-style\ntype: standard\nscope: code\napp_scope: backend\ncreated: 2026-03-28\ntags: []\n---\n\n## Purpose\n\nGo style guide.\n\n## Rules\n\n- Rule 1\n\n## Why\n\nBecause.\n\n## Examples\n\nExample.\n\n## Exceptions\n\nNone.\n" })
```

**Pass:** File written to `knowledge/standards/code/go-style.md` with `app_scope: backend` in front-matter. `kb_get({ keywords: ["go"], app_scope: "frontend" })` does NOT return this file.

---

## 24. `kb_issue_consult` — Pre-filing consultation

### TC-24.1 Basic consultation returns related docs and prompt

```
kb_issue_consult({ title: "Login fails with expired token", body: "When users have an expired JWT token, clicking any page results in a 500 error instead of redirecting to login." })
```

**Pass:** Returns `{ related_docs: [...], prompt: <string>, _instruction: <string> }`. Prompt contains the title, body, and any matching KB doc content. `_instruction` tells the agent to respond directly.

### TC-24.2 Consultation with app_scope filter

```
kb_issue_consult({ title: "Button style broken", body: "Primary button has wrong color on mobile", app_scope: "frontend" })
```

**Pass:** Returns `related_docs` filtered to `app_scope: frontend` docs only.

### TC-24.3 Error — missing title

```
kb_issue_consult({ body: "some description" })
```

**Pass:** Returns `{ error: "title is required" }`.

### TC-24.4 Error — missing body

```
kb_issue_consult({ title: "some title" })
```

**Pass:** Returns `{ error: "body is required" }`.

### TC-24.5 No matching KB docs (keyword search)

```
kb_issue_consult({ title: "xyzzy frobnicator malfunction", body: "The xyzzy frobnicator stopped frobnicating." })
```

**Pass:** Returns result with no keyword-matched docs. `related_docs` may include `always_load: true` files (e.g. `global-rules`) — this is by design. The prompt is generated and `_instruction` field is present.

---

## 25. `kb_issue_triage` — Issue triage

### TC-25.1 Phase 1 — returns prompt and related docs

```
kb_issue_triage({ title: "Cart total wrong", body: "Total doesn't update when coupon removed", issue_id: "PROJ-123", source: "jira", labels: ["bug", "cart"], priority: "high" })
```

**Pass:** Returns `{ related_docs: [...], prompt: <string>, _instruction: <string> }`. Prompt includes all issue fields (title, body, issue_id, source, labels, priority) and related KB doc content.

### TC-25.2 Phase 2 — writes triage report to sync/inbound

```
kb_issue_triage({ title: "Cart total wrong", body: "Total doesn't update", issue_id: "PROJ-123", content: "---\nissue_id: PROJ-123\nsource: jira\ntitle: Cart total wrong\npriority: high\nlabels: [bug, cart]\nstatus: triaged\ntriaged_at: 2026-03-28\nrelated_kb:\n  - features/cart.md\n---\n\n## Summary\n\nTriage report content here.\n" })
```

**Pass:** File written to `knowledge/sync/inbound/PROJ-123.md`. Returns `{ file_path: "knowledge/sync/inbound/PROJ-123.md", written: true }`. File content matches the provided content.

### TC-25.3 Phase 2 — slugified title when no issue_id

```
kb_issue_triage({ title: "Button Style is Broken!", body: "The button is ugly", content: "some triage content" })
```

**Pass:** File written to `knowledge/sync/inbound/button-style-is-broken.md`.

### TC-25.4 Phase 1 — minimal params (no optional fields)

```
kb_issue_triage({ title: "Something broke", body: "It's broken" })
```

**Pass:** Returns prompt with issue_id as "(none)", source as "(unknown)", labels as empty, priority as "(unset)".

### TC-25.5 Triage report not indexed by kb_reindex

```
kb_issue_triage({ title: "Test", body: "Test", issue_id: "TEST-1", content: "test content" })
kb_reindex({})
```

**Pass:** `knowledge/sync/inbound/TEST-1.md` is NOT listed in `_index.yaml`. No lint errors from sync/ files.

---

## 26. `kb_issue_plan` — Work item planning

### TC-26.1 Phase 1 — returns source docs and prompt

```
kb_issue_plan({ type: "feature", keywords: ["cart"] })
```

**Pass:** Returns `{ source_docs: [...], prompt: <string>, _instruction: <string> }`. Prompt contains source doc content.

### TC-26.2 Phase 2 — writes task YAML to sync/outbound

```
kb_issue_plan({ type: "feature", content: "source_docs:\n  - features/cart.md\ngenerated: 2026-03-28\ntarget: jira\nproject: PROJ\nitems:\n  - title: Implement cart\n    type: story\n    description: Implement the cart feature\n    labels: [cart]\n    acceptance_criteria:\n      - Cart displays items\n    priority: medium\n" })
```

**Pass:** File written to `knowledge/sync/outbound/2026-03-28-feature.yaml`. Returns `{ file_path, written: true }`.

### TC-26.3 Phase 1 with target and project_key

```
kb_issue_plan({ keywords: ["auth"], target: "jira", project_key: "AUTH" })
```

**Pass:** Prompt includes `target: jira` and `project_key: AUTH`.

### TC-26.4 Phase 1 with scope (export mode)

```
kb_issue_plan({ scope: "all" })
```

**Pass:** Returns all KB docs as source_docs. Uses export mode internally.

### TC-26.5 Error — no filters provided

```
kb_issue_plan({})
```

**Pass:** Returns `{ error: "At least one of scope, type, or keywords is required..." }`.

### TC-26.6 Plan output not indexed

```
kb_issue_plan({ type: "feature", content: "test yaml content" })
kb_reindex({})
```

**Pass:** `knowledge/sync/outbound/` files are NOT listed in `_index.yaml`. No lint errors.

---

## 27. Init — sync/inbound and sync/outbound folders

### TC-27.1 kb_init creates sync subdirectories

```
cd test-react-vite
kb_init({ interactive: false })
```

**Pass:** `knowledge/sync/inbound/` and `knowledge/sync/outbound/` directories exist. `.gitattributes` contains `knowledge/sync/inbound/**` and `knowledge/sync/outbound/**` merge entries.
