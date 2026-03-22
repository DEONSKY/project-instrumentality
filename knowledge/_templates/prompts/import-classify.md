# import-classify prompt
#
# Used by kb_import. Called once per extracted chunk.
# Determines which KB template type(s) the chunk maps to.
# Supports multi-label: a chunk can produce multiple KB files.
#
# Placeholders filled at runtime:
#   {{chunk_text}}     — extracted text of this document section
#   {{chunk_id}}       — position identifier (page/section reference)
#   {{source_file}}    — original document filename
#   {{existing_kb}}    — list of existing KB file ids (to detect duplicates)

---

Classify the following document chunk into one or more knowledge base types.
A single chunk can map to multiple types — for example, a section describing
a screen with numbered steps and field constraints could be a feature, a flow,
AND a validation file.

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

## Type signal heuristics

Use these patterns as additional evidence when classifying:

- Numbered step sequences (1. User does X  2. System does Y) with action verbs → strong signal for `flow`
- External service names (API, LDAP, SSO, OAuth, SOAP, REST, webhook, FTP, SFTP) or named services (e.g., "EVA API", "Web-EDI", "SSS service") → strong signal for `integration`
- Field tables with constraints (max characters, required, format, regex) → strong signal for `validation` or `schema`
- Column/field definitions with data types (varchar, integer, boolean, timestamptz) → strong signal for `schema`
- Status lists, enum values, lookup tables, code lists → strong signal for `enums`
- Role names with access rules or visibility conditions → strong signal for `ui-permissions`
- Screen or form descriptions with field lists and UI behaviour → strong signal for `feature`
- "Must", "shall", "always", "never" rules that span multiple features → strong signal for `foundation`
- Labels, button text, error message templates, empty state copy → strong signal for `ui-copy`

A section that describes a screen (feature) AND lists numbered steps for a workflow (flow)
AND includes field validation rules (validation) should produce all three types.

## Output format

Respond with JSON only. No explanation.
You MUST return the types array even when there is only one classification.

{
  "types": [
    {
      "type": "feature",
      "confidence": 0.9,
      "suggested_id": "invoice-create",
      "reason": "Describes invoice creation form with field list and UI behaviour"
    },
    {
      "type": "validation",
      "confidence": 0.75,
      "suggested_id": "invoice-create-rules",
      "reason": "Contains field constraints with max lengths and required flags"
    }
  ],
  "suggested_group": "billing",
  "duplicate_of": null
}

Return 1–3 types per chunk, ordered by confidence descending.
Only include types with confidence >= 0.5.
confidence: 0.0–1.0. Below 0.6 is treated as low-confidence and queued for review.
duplicate_of: id of an existing KB file if this covers the same thing, else null.
suggested_id: kebab-case id for each new KB file.
suggested_group: domain group folder if applicable, else null.
