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
#   {{template}}        — raw template content for that type
#   {{suggested_id}}    — suggested KB file id
#   {{kb_context}}      — foundation files for naming/convention reference

---

You are mapping legacy documentation into a structured knowledge
base file. Fill the template using only information present in
the source chunk. Do not invent content.

## Source chunk

From: {{source_file}} — {{chunk_id}}

```
{{chunk_text}}
```

## KB context (for naming and convention reference)

{{kb_context}}

## Template to fill

Type: {{kb_type}}
Suggested id: {{suggested_id}}

```
{{template}}
```

## Rules

- Fill only what the source text clearly states
- Leave {{placeholder}} for anything not mentioned in the source
- Set status: draft (always)
- Set import_source: {{source_file}} in front-matter
- Set import_chunk: {{chunk_id}} in front-matter
- For ## Fields tables: include only explicitly named fields
- For ## Edge cases: extract only conditions explicitly stated
- For ## Open questions: add one entry if the source is ambiguous
  on a point that will need clarification
- Preserve all template sections even if empty
- Write only the filled template. No explanation before or after.
