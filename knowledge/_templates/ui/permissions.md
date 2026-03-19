---
id: ui-permissions
app_scope: {{app_scope}}
depends_on:
  - foundation/global-rules.md
owner: {{owner}}
created: {{date}}
---

## Permission matrix

| screen / action | {{role_a}} | {{role_b}} | {{role_c}} |
| --------------- | ---------- | ---------- | ---------- |
| {{screen}} — view | yes | yes | no |
| {{screen}} — edit | yes | no | no |
| {{screen}} — delete | yes | no | no |

## Visibility rules

UI elements hidden vs disabled vs absent for each role.

- hidden: element not rendered at all
- disabled: rendered but not interactive
- absent: route/page not accessible

| element | {{role_a}} | {{role_b}} | rule |
| ------- | ---------- | ---------- | ---- |
| {{element}} | visible | hidden | {{condition}} |

## Conditional fields

Fields that appear only under certain conditions regardless of role.

- {{field}} shown only when {{condition}}
- {{field}} editable only when {{condition}}

## Changelog

{{date}} — created
