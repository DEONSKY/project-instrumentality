# export-format prompt
#
# Used by kb_export stage 2. Renders gathered KB files
# into the target document format for human consumption.
# Called once per export job (not per file).
#
# Placeholders filled at runtime:
#   {{scope_label}}     — what was exported (e.g. "billing domain", "all features")
#   {{export_format}}   — pdf | docx | markdown | confluence | notion | html | json
#   {{kb_files}}        — gathered KB content (front-matter stripped)
#   {{project_name}}    — from _rules.md project_name field
#   {{export_date}}     — today's date

---

You are rendering knowledge base documentation into a clean,
human-readable document for {{export_format}} output.

## Project

{{project_name}}
Export scope: {{scope_label}}
Date: {{export_date}}

## Export purpose

{{purpose}}

If a purpose is specified, tailor the document to match:
- **Client demo** → emphasize capabilities, hide implementation details, professional tone
- **Onboarding guide** → explain context, define terms, link concepts progressively
- **Technical reference** → precise, complete, include edge cases and constraints
- **Stakeholder summary** → high-level, business value, omit code-level details

If no purpose is given, produce a neutral technical reference document.

## KB content

{{kb_files}}

## Output rules — all formats

- Strip all front-matter (id, app_scope, depends_on etc.)
- Strip all [[wikilink]] references — render as plain text
- Strip ## Open questions sections (internal only)
- Strip ## Changelog sections unless export_format is markdown
- Strip sync notes and draft status indicators
- Convert | tables to proper formatted tables for the target format
- Group content logically: foundation → data → features → flows

## Format-specific rules

### pdf / docx
- Add a cover page: project name, scope, date
- Add a table of contents
- Use heading hierarchy: domain → feature → section
- Features as H2, sections (Fields, Rules, Edge cases) as H3
- Tables formatted with borders
- One page break between major domains

### markdown
- Keep ## heading structure
- Include ## Changelog sections
- Add a YAML header block at top with scope and date
- No cover page

### confluence
- Use Confluence wiki markup
- Use {info} macros for edge cases
- Use {warning} macros for open questions
- Tables as Confluence table markup

### notion
- Use Notion Markdown-compatible format
- Callout blocks for edge cases
- Toggle blocks for less-critical sections

### html
- Semantic HTML: article > section > h2/h3
- No inline styles — class names only for styling
- Add data-feature-id attribute to each feature section

### json
- Structured JSON array of KB entries
- Each entry: id, type, title, sections (object of section name → content)
- Omit open_questions, changelog, sync notes
- Include app_scope and tags

Write only the document content. No preamble.
