---
id: conventions
type: standard
scope: code
app_scope: all
owner: {{owner}}
created: {{date}}
tags: [conventions]
---

## Naming — rules for code generation

When generating or reviewing code, apply these naming rules:

1. **Files:** Use {{kebab-case}} (e.g. `invoice-create.ts`)
2. **Components:** Use {{PascalCase}} matching the component name (e.g. `InvoiceForm`)
3. **Functions:** Use {{camelCase}} (e.g. `createInvoice`)
4. **Constants:** Use {{SCREAMING_SNAKE}} (e.g. `MAX_RETRY_COUNT`)
5. **Database tables:** Use {{snake_case}} plural (e.g. `invoice_items`)
6. **Database columns:** Use {{snake_case}} (e.g. `created_at`)
7. **Environment variables:** Use {{SCREAMING_SNAKE}} (e.g. `DATABASE_URL`)

If a name does not clearly fit one of these categories, ask the developer before choosing.

## Folder structure per app

When creating new files, place them in the correct directory:

```
src/
  components/   — shared UI components
  features/     — feature-scoped modules
  lib/          — utilities, helpers
  types/        — shared TypeScript types
```

Do not create new top-level directories without discussing with the team.

## When creating a new component

Follow these steps in order:

1. Check if a similar component already exists in `src/components/` or in the KB
2. Create one file per component — never put multiple components in one file
3. Name the Props interface as `{{ComponentName}}Props`
4. Use default export only
5. If the component is feature-specific, place it inside that feature's directory, not in shared `components/`

## When generating or modifying API endpoints

Follow these rules:

1. Use REST with noun-based plural routes (`/invoices`, `/users`)
2. Map HTTP verbs consistently: GET (list), GET/:id (detail), POST (create), PATCH (update), DELETE (remove)
3. Always wrap responses in `{ data: ... }`
4. Before creating a new endpoint, check if an existing endpoint already handles the use case

## Before creating new code

Before writing any new file or component:

1. Search the KB context for existing files that cover the same purpose
2. Search the codebase for existing utilities, components, or services that can be reused
3. If something similar exists, prefer extending it over creating a duplicate
4. If you must create something new, add @mentions to reference related existing files

## Git conventions

- Branch naming: `{{feature|fix|chore}}/{{ticket_id}}-short-description`
- Commit format: {{conventional_or_free_form}}
- PR size: max {{max_files_changed}} files changed

## KB @mention format

Within KB files, reference other files as:
- Whole file: `@schema/user`
- Specific section: `@schema/user#fields`
- Cross-app: `@shared/validation/common#email`

## Changelog

{{date}} — created
