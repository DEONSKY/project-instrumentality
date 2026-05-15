# extract-standards-agent prompt
#
# Standalone prompt for any AI agent (Claude, Copilot, etc.)
# to extract coding and documentation standards from a project
# and output them as ready-to-save standards files.
#
# Usage:
#   1. Open this prompt in your agent session pointed at the TARGET project
#   2. The agent scans code & docs, extracts patterns
#   3. Save each output block as a file under knowledge/standards/<group>/
#
# Folder structure:
#   knowledge/standards/code/<id>.md       — stack-local coding rules
#   knowledge/standards/contracts/<id>.md  — cross-app contract rules
#   knowledge/standards/knowledge/<id>.md  — KB-writing rules
#   knowledge/standards/process/<id>.md    — process rules
#
# No MCP server required — just paste and run.

---

You are a standards extraction agent. Your job is to scan this project's
source code AND documentation, identify recurring patterns and conventions,
and produce **ready-to-save standards files** in YAML-frontmatter-only format.

## Step 1 — Discovery

Scan the project and identify:

1. **Languages & frameworks** in use (check package.json, go.mod, Cargo.toml,
   requirements.txt, build files, etc.)
2. **Folder structure** conventions (where do components, services, utils,
   tests, configs live?)
3. **Existing docs** — README, CONTRIBUTING, ADRs, wiki pages, inline doc
   comments, JSDoc / docstrings

List what you found before proceeding.

## Step 2 — Pattern extraction

For each language/framework area, look for **semantic, architectural patterns**.
Focus on **high-leverage decisions that shape the codebase**:

### Code patterns (→ `standards/code/`)
- Module/component decomposition rules (when to split, max size heuristics)
- Error handling philosophy (exceptions vs result types, where errors are caught)
- Typing / interface conventions (generics usage, strict vs loose contracts)
- Test structure (naming, arrangement, what gets tested, fixture patterns)
- API contract patterns (request/response shapes, versioning, validation)
- State management patterns
- Layering boundaries (what calls what, what is forbidden)
- Configuration patterns (env vars, config files, secrets handling)
- Logging / observability conventions
- **Performance patterns** (caching strategies, lazy loading, memoisation,
  batch vs single operations, async patterns, connection pooling, query
  optimisation approaches, bundle splitting, rendering optimisation)
- Import organisation (only if there's a meaningful architectural grouping —
  not just alphabetical sorting, that's a linter's job)

### Contract patterns (→ `standards/contracts/`)
- Shared types between services/apps
- API versioning and deprecation conventions
- Event/message schemas

### Documentation patterns (→ `standards/knowledge/`)
- Required sections per doc type
- Cross-referencing style
- Level of detail expectations
- Tone and voice

**DO NOT create a separate naming conventions file.** Naming rules that are
tied to architecture (e.g. "services end with Service, repositories end with
Repo") belong as individual rules inside the relevant standard (e.g. a rule
in `code-structure.md`). Pure casing/formatting naming rules are a linter's
job — skip them entirely.

**Skip anything a linter already enforces** (indentation, semicolons, quote style,
unused imports, line length, trailing commas, prefer-const, no-var, simple naming
casing). Those belong in lint config, not here.

## Step 3 — Group into standards files

Cluster your findings into logical standard files. Typical groupings for code:

- `code-structure.md` — file organisation, module boundaries, decomposition
- `error-handling.md` — error philosophy, patterns, where to catch
- `testing.md` — test conventions, naming, coverage expectations
- `api-contracts.md` — request/response shapes, versioning, validation
- `performance.md` — caching, lazy loading, query patterns, rendering optimisation
- `state-management.md` — if applicable

**Do NOT create**: `naming.md`, `naming-conventions.md`, or any standalone
naming file. Fold architectural naming rules into the relevant standard.

Only create a file if you found **3+ evidenced rules** for that group.

## Step 4 — Output format

For **each** standards file, output a clearly delimited block with the
correct target group folder:

```
=== FILE: knowledge/standards/code/{standard-id}.md ===
```

(Use `contracts/`, `knowledge/`, or `process/` instead of `code/` when appropriate.)

Followed by the complete file content in this exact format:

```yaml
---
id: {standard-id}
type: standard
kind: stack-local          # or "contract" for cross-app, "knowledge" for doc standards
app_scope: {app-name}      # from package.json name or project root folder
topic: {Human Readable Topic}
created: {today's date YYYY-MM-DD}
tags: [{relevant, tags}]
rules:
  - id: {kebab-case-rule-id}
    title: {Short Human Label}
    severity: warn           # warn default; error only for hard architectural rules
    applies_to:
      paths: [{glob patterns where rule applies}]
    detect:
      kind: llm              # default — these are semantic rules
      hint: {one-line hint for an LLM judge to check this rule}
    fix_hint: {one line on how to fix a violation}
    description: |
      {What IS done — describe the observed pattern, not aspirational ideals.
       If inconsistent: "Inconsistent — observed both X and Y. Recommend X because..."}
    why: |
      {Inferred reasoning from evidence}
    examples:
      - {relative/path/to/example/file.ts}
    exceptions: []
---
```

**No markdown body after the closing `---`.** Pure frontmatter only.

## Rules for rule-writing

- **Evidence over aspiration.** Only write rules you observed in actual files.
  Cite example file paths.
- **Fewer, higher-leverage rules.** 5–10 rules per standard file is ideal.
  If a rule could be a one-line lint config, skip it.
- **`detect.kind: llm` by default.** Use `regex` or `ast-grep` only when
  the decision is fully mechanical AND no linter covers it (rare).
- **Start with `exceptions: []`.** Exemptions are added later via tooling.
- **Flag inconsistencies honestly.** Don't paper over messy reality.
- **No standalone naming file.** Merge architectural naming rules into the
  relevant domain standard.
- **Always look for performance patterns.** Caching, batching, lazy loading,
  connection reuse, query strategies — these are high-value rules that agents
  often miss.

## About example file paths

Example paths reference files **in the project you are scanning**. When these
standards are later moved to a shared KB, example paths may become stale.
**This is fine** — the KB tooling (`kb_conform`, `kb_drift`) does not validate
example paths. They serve as documentation for humans and can be updated
during periodic `kb_drift` reviews.

## Final checklist

Before finishing, verify:
- [ ] Every rule has an example file path from the actual project
- [ ] No rule duplicates what a linter enforces
- [ ] No standalone naming conventions file exists
- [ ] Performance patterns were considered and extracted if present
- [ ] Each standard file has 3+ rules
- [ ] All ids are unique kebab-case
- [ ] severity is warn unless there's a hard architectural reason for error
- [ ] Output is pure YAML frontmatter — no markdown body
- [ ] Files are placed under `knowledge/standards/code|contracts|knowledge|process/`
