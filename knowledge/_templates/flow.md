---
id: {{id}}
type: flow
aliases: [{{id}}]
cssclasses: [kb-flow]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
---

<!--
  FLOW FILES = business process steps, not implementation traces.
  Describe who does what and when, using actor/action/outcome language.
  No method names, no HTTP endpoints, no queue names, no class references.
  If a step is "calls PaymentService.charge()", rewrite it as "Payment is charged."
  Technical wiring belongs in standards/code/ or integration/ files.
-->

## Description

{{One paragraph describing what this flow does and when it is triggered.}}

## Steps

1. {{Step: actor → action → system response}}
2. {{Step: actor → action → system response}}
3. {{Step: actor → action → system response}}

## States

| state | description | terminal |
| ----- | ----------- | -------- |
| {{state}} | {{what this state means}} | {{yes|no}} |

> [!important] Guards
> Conditions that must be true before this flow can proceed.
> - {{Guard: condition that must hold}}
> - {{Guard: condition that must hold}}

> [!question] Open questions
> - [ ] {{Unresolved question that needs a decision.}}

## Changelog

{{date}} — created
