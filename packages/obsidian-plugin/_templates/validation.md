---
id: {{id}}
type: validation
aliases: [{{id}}]
cssclasses: [kb-validation]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
---

<!--
  VALIDATION FILES = rule tables for field constraints and error messages.
  Write: rule_id, field name, constraint type, constraint expression, user-facing error message.
  Write: reusable regex patterns and cross-field conditions.
  Do NOT write validator class names, annotation names, or library-specific syntax.
  Do NOT describe how the rule is enforced — only what the rule is.
-->

## Rules

| rule_id | field | type | constraint | error_message |
| ------- | ----- | ---- | ---------- | ------------- |
| {{id}} | {{field}} | {{format|length|range|regex|business}} | {{constraint}} | {{message}} |

## Shared patterns

Document regex or reusable logic referenced by rule_id above.

```
{{rule_id}}: /{{regex}}/
```

> [!warning] Cross-field rules
> Rules that depend on more than one field value.
> - {{condition}} → {{what is blocked or required}}

## Used by

List KB files that reference these rules via wikilink.

- [[features/{{name}}#fields]]
- [[schema/{{entity}}]]
