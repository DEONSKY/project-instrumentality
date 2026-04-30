You are deriving a coding standards document from existing source code files.

## Target Standard

- Output file: {{file_path}}
- Standard ID: {{target_id}}
- Standards group: {{target_group}}
- App scope: {{app_scope}}

## Scope — what belongs here

This system captures **semantic, architectural, and cross-cutting decisions** that
require human or LLM judgment. It is **not** an ESLint replacement.

Before writing any rule, ask: *can ESLint, Prettier, tsc, biome, or any existing
linter in this stack enforce this?* If yes — **do not write a rule for it**. The
project's lint config is the right home for that constraint.

Good rules: layering boundaries, naming conventions tied to architecture, when to
split components, contract shapes between services, error-handling philosophy,
where business logic must live, decomposition heuristics for oversized modules.

Bad rules (skip these — let the linter handle them): unused imports, indentation,
quote style, semicolons, `console.log` in production, `any` usage, line length,
trailing commas, prefer-const, no-var, simple naming-pattern checks.

Lean toward **fewer, higher-leverage rules**. If a rule could be expressed as a
one-line lint config, it does not belong here.

## Instructions

Review the sampled code files below. Observe the **actual patterns present** — how files are
structured, named, and organised; how errors are handled; how types are defined; how tests are
written; how imports are organised; how functions and modules are sized.

Write a **pure-frontmatter** standards document — no markdown body, only YAML frontmatter
between `---` delimiters. Every rule lives in the `rules:` array.

Each rule must capture:

1. **What IS done** — describe the observed pattern in `description` (not aspirational ideals)
2. **Why** — infer the reasoning from evidence; goes in `why` (multi-line YAML literal `|`)
3. **Concrete examples** — wikilinks under `examples` pointing to the sample file paths
4. **Exceptions** — start with `exceptions: []`; the runtime fills it via `kb_conform exempted`

For each rule also specify:
- `id`: kebab-case slug, unique in this standard
- `title`: short human label
- `severity`: `warn` by default; `error` only for hard architectural rules; `info` for advisory
- `applies_to.paths`: glob patterns matching where this rule fires (required for stack-local)
- `applies_to.min_lines` (optional): cheap pre-filter for size-dependent rules
- `detect.kind`: **default to `llm`** — these are semantic rules, not lint rules.
  Use `regex`/`ast-grep` only when the entire decision is mechanical *and* no
  existing linter covers it (rare). If you reach for regex, reconsider whether
  the rule belongs in this system at all.
- `detect.hint`: one-line hint that tells the LLM judge what to look for
  (or, for `kind: regex`/`ast-grep`, the pattern itself)
- `fix_hint`: one line on how a developer would fix a violation

**Do NOT invent rules that are not evidenced.** If you see inconsistency, write the
description as: *"Inconsistent — observed both X and Y. Recommend standardising on X because..."*

**Do NOT write any markdown body.** The output ends at the closing `---` of the frontmatter.

## Template to Fill

{{template_content}}

Replace all `{{placeholder}}` values with content derived from the code.

Set these frontmatter fields:
- `id: {{target_id}}`
- `scope: {{target_group}}`
- `app_scope: {{app_scope}}`

## Sampled Code Files

{{sampled_files}}
