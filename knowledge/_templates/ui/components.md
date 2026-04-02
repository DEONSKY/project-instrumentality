---
id: ui-components
app_scope: {{app_scope}}
depends_on:
  - foundation/conventions.md
owner: {{owner}}
created: {{date}}
---

## Shared components

One entry per reusable component that appears in multiple features.
Feature-specific components belong in the feature file, not here.

### {{ComponentName}}

File: {{src/components/ComponentName.tsx}}
Purpose: {{what it does}}
Used by: [[features/{{name}}]], [[features/{{name2}}]]

Props:
| prop | type | required | default | notes |
| ---- | ---- | -------- | ------- | ----- |
| {{prop}} | {{type}} | {{yes|no}} | {{default}} | {{notes}} |

Validation built in: {{yes — describe rule | no}}
Accessibility: {{notes on aria, keyboard, focus}}

---

### {{ComponentName2}}

File: {{path}}
Purpose: {{what it does}}
Used by:

Props:
| prop | type | required | default | notes |
| ---- | ---- | -------- | ------- | ----- |

## Design tokens

Reference only. Source of truth is foundation/tech-stack.md or design system.

| token | value | usage |
| ----- | ----- | ----- |
| {{token}} | {{value}} | {{where used}} |

## Changelog

{{date}} — created
