---
id: ui-copy
type: ui-copy
aliases: [UI Copy]
cssclasses: [kb-ui]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
---

## Error messages

| error_code | user-facing message | notes |
| ---------- | ------------------- | ----- |
| REQUIRED_FIELD | This field is required | |
| INVALID_EMAIL | Enter a valid email address | |
| {{CODE}} | {{message}} | {{when shown}} |

## Success messages

| action | message |
| ------ | ------- |
| {{action}} | {{message}} |

## Empty states

| screen | message | cta label |
| ------ | ------- | --------- |
| {{screen}} | {{No items yet.}} | {{Create one}} |

## Confirmation dialogs

| action | title | body | confirm label | cancel label |
| ------ | ----- | ---- | ------------- | ------------ |
| delete | Delete {{item}}? | This cannot be undone. | Delete | Cancel |
| {{action}} | {{title}} | {{body}} | {{confirm}} | {{cancel}} |

## Button and label copy

| element | label |
| ------- | ----- |
| save button | Save changes |
| {{element}} | {{label}} |

## Changelog

{{date}} — created
