# import-classify prompt
#
# Used by kb_import stage 2. Called once per extracted chunk.
# Determines which KB template type the chunk maps to.
# Low-cost call — short input, short output.
#
# Placeholders filled at runtime:
#   {{chunk_text}}     — extracted text of this document section
#   {{chunk_id}}       — position identifier (page/section reference)
#   {{source_file}}    — original document filename
#   {{existing_kb}}    — list of existing KB file ids (to detect duplicates)

---

Classify the following document chunk into a knowledge base type.

## Chunk

Source: {{source_file}} — {{chunk_id}}

```
{{chunk_text}}
```

## Existing KB files

{{existing_kb}}

## Classification types

feature       — user-facing functionality, form fields, UI behaviour, user stories
flow          — multi-step processes, sequences across screens or services
schema        — data models, database fields, entity definitions
validation    — input rules, error messages, field constraints, regex patterns
integration   — external APIs, webhooks, third-party services
decision      — architectural choices, tech selections, why X was chosen
foundation    — auth rules, naming conventions, error formats, global rules
enums         — status values, type constants, lookup lists
ui-permissions — role-based access, visibility rules, permission matrices
ui-copy       — user-facing labels, button text, empty states, confirmations
unclassified  — does not clearly fit any type above

## Output format

Respond with JSON only. No explanation.

{
  "type": "feature",
  "confidence": 0.87,
  "suggested_id": "invoice-create",
  "suggested_group": "billing",
  "duplicate_of": null,
  "reason": "Describes invoice creation form with field list and validation rules"
}

confidence: 0.0–1.0. Below 0.6 should be treated as unclassified.
duplicate_of: id of an existing KB file if this appears to cover the same thing, else null.
suggested_id: kebab-case id for the new KB file.
suggested_group: domain group folder if applicable, else null.
