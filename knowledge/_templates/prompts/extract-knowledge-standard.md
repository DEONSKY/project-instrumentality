You are deriving a knowledge-writing standards document from existing KB files.

## Target Standard

- Output file: {{file_path}}
- Standard ID: {{target_id}}
- Standards group: {{target_group}}
- App scope: {{app_scope}}

## Instructions

Review the sampled KB documents below. Observe the **actual writing patterns** — which sections are
always present, which are sometimes omitted; how frontmatter fields are used; what level of detail
is typical; what language style is used; how relationships between documents are referenced
(@mentions, links, ids).

Write a standards document that:

1. **Describes the document structure** — required vs optional sections, and what belongs in each
2. **Documents frontmatter conventions** — which fields are always set, what values are used
3. **Captures writing style** — tone (imperative, declarative), depth of explanation, use of
   examples, use of tables vs lists, use of code blocks
4. **Explains the Why** for structural choices — infer the reasoning from patterns you observe
5. **Notes common issues** — anything that appears inconsistently or incorrectly across samples

**Do NOT invent conventions that are not evidenced.** If you see inconsistency, flag it as
"Inconsistent — recommend standardising on X because..."

## Template to Fill

{{template_content}}

Replace all `{{placeholder}}` values with content derived from the KB documents.

Set these frontmatter fields:
- `id: {{target_id}}`
- `scope: {{target_group}}`
- `app_scope: {{app_scope}}`

## Sampled KB Documents

{{sampled_files}}
