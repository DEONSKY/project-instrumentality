---
id: decision-{{id}}
type: decision
aliases: [{{id}}]
cssclasses: [kb-decision]
app_scope: all
depends_on: []
owner: {{owner}}
created: {{date}}
tags: []
status: {{proposed|accepted|superseded}}
---

<!--
  DECISION FILES = architectural records, not implementation guides.
  Document the context, the choice made, alternatives considered, and trade-offs.
  Technical depth is appropriate — library names, patterns, and constraints are all valid.
  Do NOT write implementation instructions (those belong in standards/code/ files).
  Do NOT write business requirements (those belong in feature files).
-->

## Context

{{Describe the situation, constraints, and why a decision was needed.}}

## Decision

{{State clearly what was decided.}}

## Alternatives considered

### {{Option A}}

{{Describe the alternative and why it was not chosen.}}

### {{Option B}}

{{Describe the alternative and why it was not chosen.}}

> [!info] Consequences
>
> **Positive:**
> - {{Benefit or positive outcome.}}
>
> **Negative / trade-offs:**
> - {{Cost or trade-off accepted.}}
