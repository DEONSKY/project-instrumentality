---
id: {{id}}
type: component
aliases: [{{id}}]
cssclasses: [kb-component]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
---

<!--
  COMPONENT FILES = reusable technical patterns used across multiple features.
  Can span UI, backend, or both (e.g. a notification component with backend
  error aggregation). Feature-specific business rules belong in the feature
  file — link here via [[wikilinks]]. Do NOT duplicate those rules here.
-->

## Description

{{What this component does and where it's reused.}}

## Frontend surface

- Files: {{paths}}
- Props / API:

| prop | type | required | default | notes |
| ---- | ---- | -------- | ------- | ----- |
| {{prop}} | {{type}} | {{yes\|no}} | {{default}} | {{notes}} |

## Backend surface

- Files: {{paths}}
- Endpoints / data contract: {{if applicable}}

## Integration rules

- {{How features must use this component}}
- {{Input / output constraints}}

## Accessibility / UX

(optional — only if UI-facing)
- {{a11y, keyboard, focus notes}}

## Used by

- [[features/{{name}}]]
- [[flows/{{name}}]]
