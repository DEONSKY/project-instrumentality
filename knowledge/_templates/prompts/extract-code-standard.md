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

Write a standards document that:

1. **Describes what IS done** — capture patterns you actually observe, not aspirational ideals
2. **Explains the Why** for each rule — infer the reasoning from evidence in the code
3. **Gives concrete examples** drawn directly from the sampled files (file names + line snippets)
4. **Notes exceptions** — if you see a pattern that breaks the general rule, document it

**Do NOT invent rules that are not evidenced.** If you see inconsistency, write:
"Inconsistent — observed both X and Y. Recommend standardising on X because..."

## Template to Fill

{{template_content}}

Replace all `{{placeholder}}` values with content derived from the code.

Set these frontmatter fields:
- `id: {{target_id}}`
- `scope: {{target_group}}`
- `app_scope: {{app_scope}}`

## Sampled Code Files

{{sampled_files}}
