---
id: conventions
app_scope: all
always_load: true
owner: {{owner}}
created: {{date}}
---

## Naming

| thing | convention | example |
| ----- | ---------- | ------- |
| files | {{kebab-case}} | invoice-create.ts |
| components | {{PascalCase}} | InvoiceForm |
| functions | {{camelCase}} | createInvoice |
| constants | {{SCREAMING_SNAKE}} | MAX_RETRY_COUNT |
| db tables | {{snake_case}} | invoice_items |
| db columns | {{snake_case}} | created_at |
| env vars | {{SCREAMING_SNAKE}} | DATABASE_URL |

## Folder structure per app

```
src/
  components/   — shared UI components
  features/     — feature-scoped modules
  lib/          — utilities, helpers
  types/        — shared TypeScript types
```

## Component rules

- One component per file
- Props interface named: {{ComponentName}}Props
- Default export only

## API conventions

- REST: noun-based plural routes (/invoices, /users)
- HTTP verbs: GET list, GET/:id, POST create, PATCH update, DELETE remove
- Response always wrapped in { data: ... }

## Git

Branch naming: {{feature|fix|chore}}/{{ticket-id}}-short-description
Commit format: {{conventional|free-form}}
PR size: max {{n}} files changed

## KB @mention format

Within KB files, reference other files as:
- Whole file: @schema/user
- Specific section: @schema/user#fields
- Cross-app: @shared/validation/common#email

## Changelog

{{date}} — created
