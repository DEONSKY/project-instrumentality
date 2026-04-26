You are deriving a coding standards document from existing source code files.

## Target Standard

- Output file: {{file_path}}
- Standard ID: {{target_id}}
- Standards group: {{target_group}}
- App scope: {{app_scope}}

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
- `detect.kind`: `regex` or `ast-grep` if mechanically detectable; `llm` when judgment is needed
- `detect.hint`: a regex pattern (for `kind: regex`) or a one-line hint for the LLM judge
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
