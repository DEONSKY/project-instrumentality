---
id: tech-stack
app_scope: all
always_load: true
owner: {{owner}}
created: {{date}}
---

## Apps

| app | language | framework | version |
| --- | -------- | --------- | ------- |
| {{app_name}} | {{language}} | {{framework}} | {{version}} |

## Key libraries

| library | purpose | version |
| ------- | ------- | ------- |
| {{lib}} | {{purpose}} | {{version}} |

## Database

Engine: {{postgres|mysql|mongo|sqlite}}
ORM / query layer: {{prisma|drizzle|sqlalchemy|etc}}
Migration tool: {{tool}}

## Infrastructure

Hosting: {{platform}}
CI/CD: {{tool}}
Container: {{docker|none}}
Secrets manager: {{tool}}

## Code generation context

LLMs generating code for this project should use:
- Language version: {{version}}
- Import style: {{esm|commonjs|etc}}
- Async pattern: {{async-await|promises|etc}}
- Test framework: {{jest|vitest|pytest|etc}}

## Changelog

{{date}} — created
