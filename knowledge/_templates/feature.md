---
id: "{{id}}"
type: feature
aliases: ["{{id}}"]
cssclasses: [kb-feature]
app_scope: "{{app_scope}}"
depends_on: []
owner: "{{owner}}"
created: "{{date}}"
tags: []
---

<!--
  FEATURE FILES = business rules and requirements, in plain language for anyone
  on the team — not code, not class names, not endpoint paths. Field-level data
  (types, defaults) lives in the schema file and input constraints in the
  validation file — LINK to them, do not restate. Technical implementation
  belongs in standards/code/. Architectural decisions belong in decisions/.
-->

## Description

{{One paragraph describing what this feature does from a business perspective, its purpose, and who uses it.}}

Schema: `[[data/schema/<entity>]]` · Rules: `[[data/validation/<rule-file>]]`

## Business rules

- {{Rule: describe an invariant or constraint in plain language. E.g. "A user can hold exactly one role at a time."}}
- {{Rule: describe an invariant or constraint in plain language.}}

> [!warning] Edge cases
> - {{Edge case: describe what happens under unusual or boundary conditions. E.g. "If the employee no longer exists in MAB, the record is kept but flagged."}}

> [!question] Open questions
> - [ ] {{Unresolved question that needs a PM or tech-lead decision.}}
