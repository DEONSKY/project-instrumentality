You are deriving a knowledge-writing standards document from existing KB files.

## Target Standard

- Output file: {{file_path}}
- Standard ID: {{target_id}}
- Standards group: {{target_group}}
- App scope: {{app_scope}}

## Scope — what belongs here

This standard captures **how KB authors should write content** — voice,
structure, what level of detail belongs where, when to split documents, how to
cross-reference. It is **not** a structural validator.

If a constraint is purely structural (frontmatter field present, headings in a
fixed order, file in a specific folder), `kb_lint` already enforces it — do not
duplicate it as a rule here.

Good rules: when a feature doc should split into a flow doc, how technical vs.
business detail is partitioned across feature/standard/decision files, what
makes a "good" rule description, when to add cross-references.

Bad rules: "must have an `id` field", "must be in features/", "frontmatter must
parse" — these are kb_lint's job.

## Instructions

Review the sampled KB documents below. Observe the **actual writing patterns** — which sections are
always present, which are sometimes omitted; how frontmatter fields are used; what level of detail
is typical; what language style is used; how relationships between documents are referenced
([[wikilinks]], links, ids).

Write a **pure-frontmatter** standards document — no markdown body, only YAML frontmatter
between `---` delimiters. Every rule lives in the `rules:` array. Set `kind: knowledge` since
this standard governs KB-writing rather than code.

Each rule must capture:

1. **Document-structure expectation** — described concisely (e.g. "feature files have a ## Fields
   section listing field name, type, validation"); goes in `description` (multi-line `|`)
2. **Frontmatter convention** — separate rules for required fields, naming conventions
3. **Writing style** — separate rules for tone, examples, tables vs lists
4. **Why** — infer reasoning from patterns; goes in `why`
5. **Common issues** — flag inconsistencies as `description: "Inconsistent — recommend X because..."`

For each rule also specify:
- `id`: kebab-case slug, unique in this standard
- `title`: short human label
- `severity`: `warn` by default; `error` only for hard structural rules
- `applies_to.paths`: glob patterns over `knowledge/**.md` (e.g. `["knowledge/features/**.md"]`)
- `detect.kind`: **default to `llm`** — these rules are about writing quality
  and require judgment. `regex` is reserved for the rare case where the
  decision is purely textual and `kb_lint` doesn't already cover it.
- `detect.hint`: one-line hint for the LLM judge (or regex pattern if `kind: regex`)
- `fix_hint`: one line on how an author would fix a violation

**Do NOT invent conventions that are not evidenced.**

**Do NOT write any markdown body.** The output ends at the closing `---` of the frontmatter.

## Template to Fill

{{template_content}}

Replace all `{{placeholder}}` values with content derived from the KB documents.

Set these frontmatter fields:
- `id: {{target_id}}`
- `scope: {{target_group}}`
- `app_scope: {{app_scope}}`

## Sampled KB Documents

{{sampled_files}}
