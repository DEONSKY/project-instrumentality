---
id: {{id}}
type: validation
aliases: [{{id}}]
cssclasses: [kb-validation]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
---

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

## Changelog

{{date}} — created
