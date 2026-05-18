# Knowledge Base Instructions

This project uses a structured Knowledge Base (KB) managed by the KB-MCP server. The KB is the **single source of truth** for project architecture, features, conventions, and standards.

## Before answering any question about the project

- **Always** call `kb_ask` with the user's question before providing an answer
- Do not answer from memory or general knowledge when KB documents exist
- If `kb_ask` returns no context, inform the user and offer to search with different keywords

## Before writing or modifying code

- Call `kb_get` with relevant keywords AND `working_paths` listing the files you're about to edit. This returns:
  - `files: [...]` — keyword-matched feature/flow/spec docs (the existing field; constrains *what* you build)
  - `rules_in_scope: [...]` — standards rules that govern *how* you build, scoped to the files you're editing. Each entry has `standard_id`, `rule_id`, `severity`, `applies_to`, `detect_hint`, `fix_hint`, `description`, `advisory`.
- Treat every entry in `rules_in_scope` as a constraint on the change. `severity: error` is hard; `warn` is strong default; `info` is advisory.
- Items with `advisory: true` are aspirational backlog from `sync/standards-backlog.md` — fix opportunistically when the change naturally touches them; not required.
- Use `task_context` for keyword scoring (independent of `working_paths`):
  - `kb_get({ keywords: [...], working_paths: [...], task_context: "creating" })` — writing new code
  - `kb_get({ keywords: [...], working_paths: [...], task_context: "fixing" })` — fixing bugs
  - `kb_get({ keywords: [...], working_paths: [...], task_context: "reviewing" })` — reviewing code
- Follow the standards and conventions surfaced in `rules_in_scope`. The cap (default 10) means full inventory may exceed what's surfaced — `kb_conform` afterwards is uncapped and may flag rules you didn't see at write-time.

## After making code changes — drift detection

- Run `kb_drift` to detect if your code changes diverge from KB documentation
- If the KB needs updating to reflect your changes, use `kb_write` to keep documentation in sync
- Do not leave code and KB in a contradictory state

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

- Run `kb_autotag` on the file to extract searchable tags from its content
- Tags are critical for discoverability — files without tags are invisible to `kb_get` keyword search
- Example: `kb_autotag({ file_path: "specs/features/user-auth.md" })`

## When creating new features or components

- Use `kb_scaffold` to create new KB documents from templates
- Check existing KB files for related features to maintain consistency
- Add `[[wikilinks]]` to reference related KB documents

## Before creating new KB files

- Check the KB structure: valid folders are defined in `_rules.md` under `depth_policy.overrides`
- Use `kb_scaffold` to create files — it enforces the correct folder and template
- Create **separate files per topic** — never combine multiple features/flows into one document
- Read 2-3 existing files in the target folder first to match the style and granularity
- Feature files describe **what** (fields, rules, constraints) — no code, no endpoints, no class names
- Flow files describe **who does what** — actor -> action -> outcome steps, no technical wiring
- Standard files describe **how** (architecture, patterns, code conventions)
- Match the `type` frontmatter field to the folder (specs/features/ -> feature, specs/flows/ -> flow, data/validation/ -> validation, etc.)
- Fill ALL `{{placeholders}}` before saving — especially in `always_load` files
- Use `[[folder/file-id]]` wikilinks when referencing other KB documents

## YAML frontmatter format in standard files

**Do not reformat or normalize frontmatter YAML.** The KB-MCP serializer manages this automatically:

- Scalar arrays (`tags`, `examples`, `paths`, `exceptions`) → intentionally flow style: `[a, b, c]`
- Object arrays (`rules`) → intentionally block style (one item per line)

This mixed style is correct by design. Attempting to convert flow arrays to block style or vice versa is a formatting error, not a fix.

## KB Tool Reference

| Tool | Purpose | When to reach for this |
|------|---------|------------------------|
| `kb_ask` | Ask questions about the project | User asks anything about project behavior, architecture, or history — try this first |
| `kb_get` | Load relevant KB files for context | Before writing or modifying code (always); also when an answer needs grounding in specific KB files |
| `kb_write` | Create or update KB documentation | After code changes that affect documented behavior; never for auto-generated files (`_index.yaml`, drift queues) |
| `kb_drift` | Detect functional divergence between code and KB | After code edits to surface stale KB; when user asks "what changed and what needs updating" |
| `kb_conform` | Check code against standards rules; three phases (detect / submit / resolve) | After code edits that touch standards-governed files; when user asks "does this follow our rules" |
| `kb_scaffold` | Create new KB files from templates | When creating a new feature, flow, schema, standard, or other documented unit |
| `kb_reindex` | Rebuild the KB index | After manual KB edits outside `kb_write`; usually runs automatically |
| `kb_autotag` | Auto-extract tags from KB content | After creating a KB file with empty `tags` frontmatter — required for `kb_get` discoverability |
| `kb_autorelate` | Discover relations between KB files | When user asks "what's related to X" or before drafting a feature that may overlap existing docs |
| `kb_impact` | Analyze impact of a change across the KB | Before a significant code or KB change, to find downstream files that may need review |
| `kb_export` | Export KB content to various formats | When user asks for a doc, PDF, markdown bundle, or stakeholder summary |
| `kb_analyze` | Scan source files, group by KB target, report uncovered groups | When user asks "what code isn't documented yet" or wants a coverage map; useful for bootstrapping KB on legacy projects |
| `kb_status` | Read-only aggregate of all sync queues + lint state + git HEAD | At session start to orient; before opening a PR; when user asks "what's drifting right now" |
| `kb_migrate` | Generate per-file migration prompts after `_rules.md` changes | After editing `_rules.md` patterns, folder conventions, or depth policy — surfaces KB files that may need rewrites |
| `kb_import` | Import legacy documents into the KB with classification | When user has existing prose docs (markdown, Confluence, Word) to fold into the KB |
| `kb_history` | Get the change history of a KB file (git + drift-log) | When a decision depends on *why* or *when* something changed — not for routine reads |
| `kb_lint` | Internal helper, not an MCP tool | Runs automatically inside `kb_reindex` and via the pre-commit hook (`scripts/lint-standalone.js`). Do not call as a tool. |

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
