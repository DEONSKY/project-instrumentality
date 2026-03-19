---
id: global-rules
app_scope: all
always_load: true
owner: {{owner}}
created: {{date}}
---

## Auth and roles

Supported roles: {{roles}}
Auth mechanism: {{auth_mechanism}}
Token strategy: {{token_strategy}}
Session timeout: {{session_timeout}}

## Error format

All API errors return:
```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "Human readable message",
    "field": "optional — for validation errors"
  }
}
```

## Pagination

Strategy: {{cursor|offset}}
Default page size: {{page_size}}
Max page size: {{max_page_size}}
Response envelope:
```json
{
  "data": [],
  "meta": { "next_cursor": "", "total": 0 }
}
```

## Date and time

Format: ISO 8601 (2024-03-18T10:22:00Z)
Timezone: UTC everywhere. Convert to local in UI only.

## IDs

Strategy: {{uuid|nanoid|cuid}}
Format: {{format}}

## Environment variables

Naming: SCREAMING_SNAKE_CASE
Secrets never in KB files. Reference by name only.

## Changelog

{{date}} — created
