---
id: schema-{{name}}
type: schema
aliases: [{{name}}]
cssclasses: [kb-schema]
app_scope: all
owner: {{owner}}
created: {{date}}
---

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
