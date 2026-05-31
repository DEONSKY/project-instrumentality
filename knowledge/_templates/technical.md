---
id: "{{id}}"
type: technical
aliases: ["{{id}}"]
cssclasses: [kb-technical]
app_scope: "{{app_scope}}"
depends_on: []
owner: "{{owner}}"
created: "{{date}}"
tags: []
---

<!--
  TECHNICAL FILES = internal system specs that are neither user-facing features
  nor external integrations: scheduled jobs, DB triggers, logging, automatic
  emails, track structure, and migration / cutover runbooks (under
  technical/migration/).
  This template is intentionally loose — keep a Description, then add whatever
  the source provides (behaviour notes, source->target mapping tables, risk
  matrices, operational checklists). Do NOT force a fixed schema.
  Do NOT document external API contracts here — those are integrations/.
-->

## Description

{{One paragraph: what this technical component is, when it runs, and what it affects.}}

## Details

{{Free-form: behaviour, triggers/schedule, source->target mappings, risk matrix,
operational checks — whatever the source describes. Tables are welcome.}}

> [!question] Open questions
> - [ ] {{Unresolved technical question.}}
