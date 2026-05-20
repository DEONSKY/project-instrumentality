---
id: drift-entry-shape
type: validation
aliases: [drift-entry-validation, queue-entry-rules]
cssclasses: [kb-validation]
app_scope: all
depends_on:
  - data/schema/drift-queue.md
owner: kb-mcp
created: 2026-05-21
tags: [validation, drift, queue, sync]
---

<!--
  VALIDATION FILES = rule tables for field constraints and error messages.
  These rules govern what kb_drift / kb_conform may write into queue files.
  No implementation references — just the constraint.
-->

## Rules

| rule_id | field | type | constraint | error_message |
| ------- | ----- | ---- | ---------- | ------------- |
| baseline_ref | baseline_ref | format | Non-empty git ref string; never the literal "HEAD" | Baseline must resolve to a concrete ref, not HEAD |
| direction | direction | format | One of: code_to_kb, kb_to_code, standards_current, standards_aspirational | Unknown direction; cannot route entry to a queue file |
| entry_status | status | format | One of: open, summaries, reverted, kb_confirmed, applied, exempted, promoted, dismissed | Status not recognised by Phase 2 resolver |
| dismissed_reason | reason | business | status = "dismissed" → reason is non-empty | Dismissed entries require a reason for the audit trail |
| rename_link_format | rename_link | regex | Matches `^← renamed from .+$` OR a wikilink-list block | Rename annotation must be a single-line pointer or a wikilink-list |
| stale_pattern | _rules.md pattern | business | Pattern matches old paths but not new ones after rename | Stale _rules.md pattern — old path matched, new path doesn't |
| submodule_remote | submodule.remote | business | Submodule remote name equals parent remote name OR is explicitly mapped | Submodule remote mismatch; fix .gitmodules or detection will skip |
| month_partition | month_partition | format | Matches `^\d{4}-\d{2}$` | Audit partition key must be YYYY-MM |
| entry_id_stability | entry_id | business | hash(file_path + rule_id + baseline_ref) must be stable across runs | Entry ID changed between runs — duplicates will appear in queues |

## Shared patterns

```
baseline_ref      : non-empty, not "HEAD"
rename_link       : /^← renamed from .+$/
month_partition   : /^\d{4}-\d{2}$/
```

> [!warning] Cross-field rules
> - `status = open` → `resolved_at = null` AND `resolved_by = null`
> - `status ≠ open` → `resolved_at != null` AND `resolved_by != null`
> - `direction = standards_*` → `rule_id != null`
> - `direction = code_to_kb | kb_to_code` → `rule_id = null`
> - `status = dismissed` → `reason != null`

## Used by

- [[data/schema/drift-queue]]
- [[specs/features/bidirectional-drift-detection]]
- [[specs/flows/drift-resolution]]
