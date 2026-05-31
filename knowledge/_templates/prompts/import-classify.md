# import-classify prompt
#
# Used by kb_import. Called once per extracted chunk.
# Determines which KB template type(s) the chunk maps to.
# Supports multi-label: a chunk can produce multiple KB files.
#
# Placeholders filled at runtime:
#   {{chunk_text}}      — extracted text of this document section
#   {{chunk_id}}        — position identifier (page/section reference)
#   {{parent_heading}}  — the section's parent heading (use for grouping)
#   {{source_file}}     — original document filename
#   {{existing_kb}}     — list of existing KB file ids (to detect duplicates)

---

Classify the following document chunk into one or more knowledge base types.
A single chunk can map to multiple types — for example, a section describing
a screen with numbered steps and field constraints could be a feature, a flow,
AND a validation file.

## Chunk

Source: {{source_file}} — {{chunk_id}}
Parent heading: {{parent_heading}}

```
{{chunk_text}}
```

## Existing KB files

{{existing_kb}}

## Classification types

feature       — user-facing functionality, form fields, UI behaviour, user stories (incl. role/permission matrices and user-facing copy)
flow          — multi-step processes, sequences across screens or services
policy        — cross-cutting business/operational "must/shall/always/never" rules that span many features (e.g. barcode format rules, numbering schemes, locking rules). NOT code or naming conventions.
schema        — data models, database fields, entity definitions, AND enum / status / lookup value lists (fold enums into the schema as DBML enums)
validation    — input rules, error messages, field constraints, regex patterns
integration   — external APIs, webhooks, third-party services, web-service endpoints
decision      — architectural choices, tech selections, project scope, why X was chosen
reference     — glossary: abbreviations, definitions, domain terminology, lookup terminology the rest of the KB depends on
technical     — internal system specs that are neither user features nor external integrations: scheduled jobs, DB triggers, logging, automatic emails, track structure, AND migration / cutover runbooks (mappings, transition plans, risk matrices, operational checks)
unclassified  — does not clearly fit any type above, OR is document navigation/meta (see below)

## Type signal heuristics

Use these patterns as additional evidence when classifying:

- Numbered step sequences (1. User does X  2. System does Y) with action verbs → strong signal for `flow`
- External service names (API, LDAP, SSO, OAuth, SOAP, REST, webhook, FTP, SFTP) or named services (e.g., "EVA API", "Web-EDI", "SSS service") → strong signal for `integration`
- Field tables with constraints (max characters, required, format, regex) → strong signal for `validation` or `schema`
- Column/field definitions with data types (varchar, integer, boolean, timestamptz) → strong signal for `schema`
- Status lists, enum values, lookup tables, code lists → `schema` (model them as DBML enums)
- Role names with access rules / visibility conditions, or labels/button text/empty-state copy → `feature`
- Screen or form descriptions with field lists and UI behaviour → strong signal for `feature`
- "Must", "shall", "always", "never" rules that span multiple features → strong signal for `policy`
- Abbreviation lists, glossary/definition tables, terminology → strong signal for `reference`
- Scheduled jobs, DB triggers, logging, automatic emails, data-migration table mappings, transition/cutover plans, risk matrices → strong signal for `technical`

A section that describes a screen (feature) AND lists numbered steps for a workflow (flow)
AND includes field validation rules (validation) should produce all three types.

## Grouping (one file per service / domain, not per fragment)

Many chunks belong to the SAME target file. Use the chunk's **parent heading** to set a
consistent `suggested_id` so they aggregate into one document:

- Web-service endpoints: a service (e.g. `PART`) split into `POST` / `GET` / `PATCH` sub-sections →
  set `suggested_id` to the SERVICE name (`part`) and `suggested_group: "web-services"` for every
  sub-section, so all its methods land in one `integration` file.
- Database / history / migration tables in one domain → set `suggested_id` to the DOMAIN
  (e.g. `stock`), so the tables aggregate into one `schema` file.

## Skip document navigation / meta

Route these to `unclassified` (they are not knowledge):
Table of Contents (headings followed by page numbers), "About the Document", Revisions,
Approvers, version/change history, and page-number-only lines.

## Language

The source may be mixed Turkish + English. Always emit an **English, kebab-case** `suggested_id`
(e.g. heading "Filtreleme Alanları" → `filter-fields`). Do not translate body content — the importer
keeps it as written; only the structure (id) must be normalized.

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
