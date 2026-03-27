---
id: tech-stack
app_scope: all
always_load: true
owner: {{owner}}
created: {{date}}
---

## Apps

When generating code for an app, use the language, framework, and version listed here:

| app | language | framework | version |
| --- | -------- | --------- | ------- |
| {{app_name}} | {{language}} | {{framework}} | {{version}} |

Do not use a different framework or language version than what is listed above.

## Key libraries

Before suggesting a new library, check this table first. If a library already fulfills the purpose, use it instead of adding a new dependency:

| library | purpose | version |
| ------- | ------- | ------- |
| {{lib}} | {{purpose}} | {{version}} |

## Database

- Engine: {{postgres_or_mysql_or_mongo_or_sqlite}}
- ORM / query layer: {{orm_or_query_layer}}
- Migration tool: {{migration_tool}}

When writing database queries or migrations, always use the ORM listed above. Do not write raw SQL unless the ORM cannot express the query.

## Infrastructure

- Hosting: {{platform}}
- CI/CD: {{ci_cd_tool}}
- Container: {{docker_or_none}}
- Secrets manager: {{secrets_manager}}

## When you generate code for this project, you MUST

1. Use the language version listed in the Apps table above
2. Use {{import_style}} import style (e.g. `import` for ESM, `require` for CommonJS)
3. Use {{async_pattern}} for asynchronous operations
4. Write tests using {{test_framework}}
5. Follow the patterns established in existing code — do not introduce new patterns without discussing with the team

## Dependency rules

When the developer asks to add a new library:
1. Check the Key libraries table — if something already covers the purpose, suggest using it
2. Check compatibility with the framework version listed above
3. Prefer well-maintained libraries with active communities
4. Never add a library just for a single utility function — write it inline or use an existing lib/ helper

## Changelog

{{date}} — created
