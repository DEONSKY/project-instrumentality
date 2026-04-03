---
id: global-rules
type: standard
aliases: [Global Rules]
cssclasses: [kb-standard]
app_scope: all
always_load: true
owner: {{owner}}
created: {{date}}
---

## When implementing auth-related code

Follow these rules for all authentication and authorization:

- Supported roles: {{roles}}
- Auth mechanism: {{auth_mechanism}}
- Token strategy: {{token_strategy}}
- Session timeout: {{session_timeout}}

Never hardcode tokens, secrets, or credentials. Reference them by environment variable name only.

## When handling errors in API endpoints

All API errors MUST return this format — do not deviate:

```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "Human readable message",
    "field": "optional — for validation errors"
  }
}
```

When generating error handling code:
1. Always use a consistent error code from the project's error catalog
2. Never expose stack traces or internal details in the message
3. Include the `field` property only for validation errors

## When implementing list endpoints

Use {{cursor_or_offset}} pagination with these defaults:

- Default page size: {{page_size}}
- Max page size: {{max_page_size}}

Response envelope must always be:
```json
{
  "data": [],
  "meta": { "next_cursor": "", "total": 0 }
}
```

Do not create list endpoints without pagination. Even if the dataset seems small now, always paginate.

## When working with dates and times

- Format: ISO 8601 (`2024-03-18T10:22:00Z`)
- Timezone: Store and transmit as UTC everywhere
- Convert to local timezone only in UI display code, never in backend or API responses

## When generating IDs

- Strategy: {{uuid_or_nanoid_or_cuid}}
- Format: {{id_format}}

Use the project's ID generation utility. Do not create new ID generation logic.

## When using environment variables

- Naming: `SCREAMING_SNAKE_CASE`
- Secrets never appear in KB files — reference by name only (e.g. "uses `DATABASE_URL`")
- When adding a new env var, document it in this file's changelog

## Changelog

{{date}} — created
