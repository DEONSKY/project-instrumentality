# Knowledge Base Instructions

This project uses a structured Knowledge Base (KB) managed by the KB-MCP server. The KB is the **single source of truth** for project architecture, features, conventions, and standards.

## How to use the KB tools (read this first)

KB-MCP tools have structural value in two areas filesystem search cannot reach:

1. **Path-glob rule applicability.** `kb_get` with `working_paths` returns `rules_in_scope` — the standards rules that apply to the files you're about to edit, matched by path globs. `grep` cannot compute path-rule applicability.
2. **Workflow discipline.** `kb_conform`, `kb_drift`, and `kb_status` track conformance and drift state against git baselines, with append-only audit trails. `grep` has no equivalent.

For everything else — finding files by content, explaining how X works, locating where Y is defined — **`grep` / `find` / `Read` are the default**. They read the file body; `kb_get`'s scoring is over metadata only (tags, depends_on, paths), so for content lookups inside KB files filesystem search is typically faster and more accurate.

Reach for `kb_ask` or keyword-only `kb_get` **only** when one of these conditions holds:

- The question requires **cross-file synthesis** the `depends_on` graph provides (e.g., "what depends on X and what governs it").
- Your `grep` keywords don't match the KB's **tag vocabulary** (e.g., the spec calls it `user-definition` but you searched for `users`).
- You need the prompt-template structure for a specific **intent**: challenge / brainstorm / onboard / sync / generate.

If none of the above hold, `grep` and `Read` are the more direct path.

## Before tasks involving cross-file relations or impact

If a task might span multiple files where the relationships aren't obvious from filenames (impact analysis, refactors, contract changes, schema changes, anything that crosses module boundaries, or anywhere you'd otherwise iterate "what about X? anything else?" through grep), call `kb_impact` with a description of the change **before** starting the search.

```
kb_impact({ change_description: "Add notificationPreferences column to user-role table" })
```

One `kb_impact` call returns the dependency surface — the files that depend on what you're changing, the standards that govern them, the open drift entries that affect them. This replaces the iterative discovery loop ("did I miss anything?" → grep → "what about X?" → grep → repeat) with a single round-trip.

When `kb_impact` returns a file list, treat it as the working surface for the task. Use `grep` / `Read` inside that surface for content. Do not re-discover relationships you already have — the iteration cost the loop would have charged is what this call exists to save.

Caveats:
- `kb_impact` is effective only when the KB's `depends_on` graph is maintained. If the graph looks sparse for affected files, run `kb_status` first to check coverage, and fall back to grep within the partial surface.
- For changes confined to a single well-understood file with no cross-file fan-out, skip `kb_impact` — grep is faster.
- `kb_impact` does not see rule-level impacts (which standards govern your specific files via path globs). Pair it with the next section's `kb_get({ working_paths })` call when you're about to edit.

## Before writing or modifying any project file

This is the load-bearing MCP call — its value is structural and has no `grep` equivalent. Applies to code, configuration, KB content, generated files (`CLAUDE.md`, `.cursorrules`, and other agent-rules variants), and anywhere else the project might encode rules about specific paths.

- Call `kb_get` with `working_paths` listing the files you're about to edit. This returns:
  - `rules_in_scope: [...]` — standards rules that govern *how* you build, scoped to your files via path-glob matching. Each entry has `standard_id`, `rule_id`, `severity`, `applies_to`, `detect_hint`, `fix_hint`, `description`, `advisory`.
  - `files: [...]` — keyword-matched KB docs (the existing field). Use these only as a starting point; the body content may need `Read` for detail.
- Treat every entry in `rules_in_scope` as a constraint on the change. `severity: error` is hard; `warn` is strong default; `info` is advisory.
- Items with `advisory: true` are aspirational backlog from `sync/standards-backlog.md` — fix opportunistically when the change naturally touches them; not required.
- Pass `task_context` to bias scoring:
  - `kb_get({ working_paths: [...], task_context: "creating" })` — writing new code or content
  - `kb_get({ working_paths: [...], task_context: "fixing" })` — fixing bugs
  - `kb_get({ working_paths: [...], task_context: "reviewing" })` — reviewing code
- The cap on `rules_in_scope` (default 10) means the full inventory may exceed what's surfaced — `kb_conform` afterwards is uncapped and may flag rules you didn't see at write-time.

## After making code changes — drift detection

- Run `kb_drift` to detect if your code changes diverged from KB documentation. This computes live state against the baseline SHA; `grep` cannot.
- If the KB needs updating to reflect your changes, use `kb_write`.
- Do not leave code and KB in a contradictory state.

## After making code changes — conformance check

The conformance loop is non-functional drift: did your code follow the architectural and structural decisions encoded in standards files?

1. **Phase 1 — detect:** Call `kb_conform` with no resolution arguments. MCP returns:
   - `requested_evaluations: [{file, standard_id, rule_ids[]}]` — every (file, rule) pair that survived MCP's cheap pre-filters (path glob, exceptions, min_lines, regex, ast-grep) and needs your judgment.
   - `prompt` — the conform-check prompt you fill in. Read each rule's `detect_hint` and decide for each triple whether the file conforms.

2. **Phase 1.5 — submit judgments:** Call `kb_conform({ submit_judgments: [{file, standard_id, rule_id, status: pass|fail|n/a, reason}, ...] })`. Submit one judgment per requested triple — no skipping, no merging. If MCP returns `gaps[]` listing triples without a judgment, fill those and resubmit. The queue does not advance until every requested triple has a judgment.

3. **Phase 2 — resolve queue entries:** Each `fail` judgment created an entry in `sync/standards-drift.md`. Walk through them and pick a resolution per entry:
   - `kb_conform({ applied: [{queue_key}] })` — you fixed the code (or will in this PR)
   - `kb_conform({ exempted: [{queue_key, file_paths, reason}] })` — these specific files are justified exceptions; MCP appends to the rule's `exceptions[]` so future runs skip them
   - `kb_conform({ promoted: [{queue_key, originating_files, note?}] })` — the code is right, the standard should change. Logged as senior-review intent; the standard file is **not** modified automatically.
   - `kb_conform({ dismissed: [{queue_key, reason}] })` — false positive

When in doubt, prefer `applied` (fix the code) over `exempted` (carve an exception) over `promoted` (revise the standard). Promotion is a senior-dev signal, not a workaround.

## After creating or updating KB files

- Run `kb_autotag` on the file to extract searchable tags from its content.
- Tags are critical for discoverability — files without tags are invisible to `kb_get` keyword retrieval (which scores over tags, not body).
- Example: `kb_autotag({ file_path: "specs/features/user-auth.md" })`

## When creating new features or components

- Use `kb_scaffold` to create new KB documents from templates — it enforces folder/template correctness and detects overlap with existing files.
- Check existing KB files for related features to maintain consistency.
- Add `[[wikilinks]]` to reference related KB documents (these become `depends_on` edges in the index).

## Before creating new KB files

- Check the KB structure: valid folders are defined in `_rules.md` under `depth_policy.overrides`.
- Use `kb_scaffold` to create files — it enforces the correct folder and template.
- Create **separate files per topic** — never combine multiple features/flows into one document.
- Read 2-3 existing files in the target folder first to match the style and granularity.
- Feature files describe **what** (fields, rules, constraints) — no code, no endpoints, no class names.
- Flow files describe **who does what** — actor → action → outcome steps, no technical wiring.
- Standard files describe **how** (architecture, patterns, code conventions).
- Match the `type` frontmatter field to the folder (specs/features/ → feature, specs/flows/ → flow, data/validation/ → validation, etc.)
- Fill ALL `{{placeholders}}` before saving — especially in `always_load` files.
- Use `[[folder/file-id]]` wikilinks when referencing other KB documents.

## YAML frontmatter format in standard files

**Do not reformat or normalize frontmatter YAML.** The KB-MCP serializer manages this automatically:

- Scalar arrays (`tags`, `examples`, `paths`, `exceptions`) → intentionally flow style: `[a, b, c]`
- Object arrays (`rules`) → intentionally block style (one item per line)

This mixed style is correct by design. Attempting to convert flow arrays to block style or vice versa is a formatting error, not a fix.

## Core tool reference

The tools that have structural value or unique workflow discipline. Reach for these in the per-task loop.

| Tool | Purpose | When to reach for it |
|---|---|---|
| `kb_get` with `working_paths` | Path-glob rule applicability → `rules_in_scope` | **Before every code edit** — primary tool with unique structural value |
| `kb_conform` | Three-phase conformance check (detect / judge / resolve) | After code edits touching standards-governed files |
| `kb_drift` | Code↔KB divergence against baseline SHA, with audit trail | After code edits to surface stale KB |
| `kb_status` | Aggregate of all sync queues + lint state + git HEAD | At session start to orient; before opening a PR |
| `kb_scaffold` | Create new KB files from templates; detects overlap | When creating a new feature, flow, schema, standard |
| `kb_write` | Write KB content with secret-blocklist + auto-reindex | After code changes that affect documented behavior; never for auto-generated files |
| `kb_autotag` | Extract tags from KB body content | After creating/editing a KB file — required for retrieval discoverability |
| `kb_impact` | Traverse `depends_on` graph for change impact | Before a significant code or KB change. Effective only if `depends_on` graph is maintained — run `kb_status` first if you suspect graph staleness. |
| `kb_history` | Git + drift-log history of a KB file | When a decision depends on *why* or *when* something changed |
| `kb_ask` | Synthesized KB context + structured prompt for a question | **Only when** the question needs cross-file synthesis, the grep keywords don't match the KB tag vocabulary, or you need the structured intent prompt (challenge / brainstorm / onboard / sync / generate). For content lookups grep is faster. |
| `kb_get` (keyword-only, no `working_paths`) | Keyword retrieval over KB metadata | **Only when** grep vocabulary doesn't match KB tags. Body content is not scored — for content inside KB files use `Read` or `grep` directly. |

## Maintenance / occasional tools

These tools are rarely the right next step in a per-task loop. Use them when the specific need arises; they're listed here to keep them out of the routine.

| Tool | When |
|---|---|
| `kb_autorelate` | Auditing `depends_on` graph coverage; backfilling edges after a tagging pass |
| `kb_extract` | Deriving a standards doc from code or KB content |
| `kb_import` | Folding legacy prose docs (Markdown / Word / Confluence) into the KB |
| `kb_export` | Producing PDF / Markdown bundle / Confluence / Notion output |
| `kb_analyze` | Bootstrapping KB on a legacy codebase; coverage map |
| `kb_inventory` | Reporting stale rules / uncovered files / pending promotions |
| `kb_schema` | Working specifically with DBML schema files |
| `kb_sub` | Coordinating submodule status / push order / merge plan |
| `kb_migrate` | After editing `_rules.md` patterns, folder conventions, or depth policy |
| `kb_upgrade` | After updating MCP server version |

`kb_lint` is an internal helper, not an MCP tool — runs automatically inside `kb_reindex` and via the pre-commit hook. Don't call as a tool.

`kb_reindex` runs automatically after `kb_write`. Call it explicitly only after manual KB edits made outside `kb_write` (e.g., via an editor, or after a git merge that touched KB files).

## Tool output policy

- If a tool result is truncated and saved to a file, you MUST read the full file before proceeding.
- Never write KB content without first following the fill prompt returned by `kb_scaffold`.
- When `kb_scaffold` returns `related_kb_files`, call `kb_get` to load them before filling the template.

## Key principle

When code and KB disagree, **present both values to the user and ask which is correct** before modifying either side. Never resolve a discrepancy silently.

- **KB drift** (KB changed, code didn't) → KB is likely correct; suggest updating the code.
- **Code drift** (code changed, KB didn't) → code is likely correct; suggest updating the KB.

In both cases, wait for explicit user confirmation before making changes.

## Internal KB contradictions

If a KB file contains an **internal contradiction** (e.g. a field table says one value while the changelog in the same file says another), treat it the same as a code↔KB discrepancy:

1. Surface both conflicting values explicitly to the user.
2. State which sources support each value (e.g. changelog, code annotation, Yup schema).
3. **Wait for explicit confirmation** before editing anything.

Never silently resolve an internal KB contradiction, even if one value appears obviously correct.

## Reviewing drift entries

When reviewing drift queue files (`sync/code-drift.md` or `sync/kb-drift.md`), **always check the git diff first** before comparing KB vs code. The queue entries contain `Since` (and optionally `Latest`) commit SHAs that tell you exactly what changed.

### KB drift (KB changed, code did not)
```
git diff <since>~1..HEAD -- knowledge/<kb-file>
```
- If the entry has a `Latest` commit: `git diff <since>~1..<latest> -- knowledge/<kb-file>`
- If `<since>~1` fails (first commit): `git show <since> -- knowledge/<kb-file>`
- After reading the diff, verify the changed values are **internally consistent** within the KB file (e.g. field table matches changelog, business rules match validation rules)

### Code drift (code changed, KB did not)
```
git diff <since>~1..HEAD -- <code-file>
```
- Each code file in the entry has its **own** Since/Latest — use the file's commits, not the entry-level ones
- For submodule files: `git -C <submodule-path> diff <since>~1..HEAD -- <relative-path>`
- If `<since>~1` fails (first commit): `git show <since> -- <file>`

Understanding the diff is essential to correctly identify what changed, catch typos or contradictions, and avoid false confirmations.
