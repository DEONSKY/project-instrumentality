---
id: relations
type: data
aliases: [Relations]
cssclasses: [kb-data]
app_scope: all
always_load: false
owner: {{owner}}
created: {{date}}
---

## Relations

One entry per meaningful entity relationship.
Schema files reference this as [[data/relations#{{entity}}]].

### {{EntityA}} → {{EntityB}}

Type: {{one-to-many|many-to-many|one-to-one}}
FK: {{entity_a}}.{{column}} → {{entity_b}}.id
Cascade: {{delete|restrict|set_null}}
Notes: {{any join table or special behaviour}}

### {{EntityA}} → {{EntityC}}

Type: {{one-to-many|many-to-many|one-to-one}}
FK: {{entity_a}}.{{column}} → {{entity_c}}.id
Cascade: {{delete|restrict|set_null}}
Notes:

## Changelog

{{date}} — created
