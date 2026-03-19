---
id: schema-{{name}}
app_scope: all
depends_on:
  - data/relations.md
owner: {{owner}}
created: {{date}}
---

## Fields

| column | type | nullable | default | notes |
| ------ | ---- | -------- | ------- | ----- |
| id | {{uuid|bigint}} | no | gen_random_uuid() | primary key |
| {{column}} | {{type}} | {{yes|no}} | {{default}} | {{notes}} |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

## Indexes

| name | columns | type | unique |
| ---- | ------- | ---- | ------ |
| {{index_name}} | {{columns}} | {{btree|gin|gist}} | {{yes|no}} |

## Relations

See @data/relations#{{EntityName}} for full join definitions.

| column | references | on_delete |
| ------ | ---------- | --------- |
| {{column}}_id | {{other_table}}.id | {{cascade|restrict|set_null}} |

## Changelog

{{date}} — created
