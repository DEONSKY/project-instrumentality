# import-map prompt
#
# Used by kb_import stage 3. Called after classification.
# Fills the appropriate KB template from the chunk content.
# One call per classified chunk.
#
# Placeholders filled at runtime:
#   {{chunk_text}}      — extracted text of the document section
#   {{chunk_id}}        — position identifier
#   {{source_file}}     — original document filename
#   {{kb_type}}         — classified type from import-classify
#   {{template}}        — the BASELINE file already built by the importer
#                         (frontmatter + ## Imported Content + tags + depends_on)
#   {{suggested_id}}    — suggested KB file id
#   {{kb_context}}      — standards files for naming/convention reference

---

You are enriching a knowledge base file that the importer has already
scaffolded. The baseline below already has correct frontmatter and the raw
source prose under `## Imported Content`. Your job is to LIFT that prose into
the empty structured sections (e.g. `## Rules`, `## Business rules`, DBML
tables) using only information present in the source chunk. Do not invent
content.

## Source chunk

From: {{source_file}} — {{chunk_id}}

```
{{chunk_text}}
```

## KB context (for naming and convention reference)

{{kb_context}}

## Baseline file to enrich

Type: {{kb_type}}
Suggested id: {{suggested_id}}

```
{{template}}
```

## Rules

- Fill only what the source text clearly states; leave a section empty if the
  source does not cover it
- **Do NOT remove or rewrite the `## Imported Content` block** — it is the
  provenance record. Add structure in the OTHER sections; leave it intact.
- **Do NOT drop or alter** the `tags`, `depends_on`, `import_source`, or
  `import_chunk` frontmatter the baseline already set
- Do NOT add a `status` field (workflow state does not belong in KB files)
- For a feature/integration owned by a single module, set app_scope to that
  module's name (otherwise leave app_scope: all)
- Keep body text in its original language; ids/headings should be English kebab-case
- For validation `## Rules` / schema DBML tables: extract every field/constraint
  the prose names (e.g. "Properties of the Input Fields:" bullet lists)
- For ## Edge cases: extract only conditions explicitly stated
- For ## Open questions: add one entry if the source is ambiguous
  on a point that will need clarification
- Write only the enriched file (frontmatter + body). No explanation before or after.
