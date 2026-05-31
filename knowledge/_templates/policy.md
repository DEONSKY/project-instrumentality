---
id: "{{id}}"
type: policy
aliases: ["{{id}}"]
cssclasses: [kb-policy]
app_scope: "{{app_scope}}"
depends_on: []
owner: "{{owner}}"
created: "{{date}}"
tags: []
---

<!--
  POLICY FILES = cross-cutting business / operational rules that span many
  features and are not owned by a single one (the "must / shall / always /
  never" rules of how the work is governed).
  Write in plain language. These are NOT code or knowledge standards — those
  live in standards/ with the structured rules[] format. These are NOT field-
  level input constraints — those live in data/validation/.
  Examples: barcode format rules, lot/shot numbering, part-type locking.
-->

## Description

{{One paragraph: what this policy governs and where it applies across the system.}}

## Rules

- {{Rule: a binding must/shall/always/never statement in plain language.}}
- {{Rule: another cross-cutting rule.}}

> [!question] Open questions
> - [ ] {{Unresolved question that needs a PM or tech-lead decision.}}
