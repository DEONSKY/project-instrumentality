---
id: {{id}}
type: feature
aliases: [{{id}}]
cssclasses: [kb-feature]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
---

<!--
  FEATURE FILES = business rules, field definitions, and requirements.
  Write in plain language for anyone on the team — not code, not class names,
  not endpoint paths. Technical implementation belongs in standards/code/.
  Architectural decisions belong in decisions/.
-->

## Description

{{One paragraph describing what this feature does from a business perspective, its purpose, and who uses it.}}

## Fields

| field | label | type | required | default | validation | notes |
| ----- | ----- | ---- | -------- | ------- | ---------- | ----- |
| {{field}} | {{Human-readable label}} | {{type}} | {{yes\|no}} | {{default}} | [[validation/{{rule_id}}]] | {{notes}} |

## Business rules

- {{Rule: describe an invariant or constraint in plain language. E.g. "A user can hold exactly one role at a time."}}
- {{Rule: describe an invariant or constraint in plain language.}}

> [!warning] Edge cases
> - {{Edge case: describe what happens under unusual or boundary conditions. E.g. "If the employee no longer exists in MAB, the record is kept but flagged."}}

> [!question] Open questions
> - [ ] {{Unresolved question that needs a PM or tech-lead decision.}}

## Changelog

{{date}} — created
