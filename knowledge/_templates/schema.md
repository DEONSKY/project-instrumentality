---
id: schema-{{name}}
type: schema
aliases: [{{name}}]
cssclasses: [kb-schema]
app_scope: all
owner: {{owner}}
created: {{date}}
---

<!--
  SCHEMA FILES = data model definitions in DBML format.
  Write: table names, column names, types, constraints, defaults, foreign keys, indexes, enums.
  Do NOT write ORM mappings, entity class names, or repository names.
  Do NOT write business rules — link to the relevant feature or validation file instead.
-->

// {{name}} database schema
// Format: dbdiagram.io DBML — https://dbml.dbdiagram.io/docs

Table {{table_name}} {
  id integer [pk, increment]
  created_at timestamp [default: `now()`]
  updated_at timestamp [default: `now()`]
}

// Ref: {{table_name}}.column > other_table.id

// Enum {{enum_name}} {
//   value1
//   value2
// }
