---
id: schema-drift-queue
type: schema
aliases: [drift-queue, sync-queue-schema]
cssclasses: [kb-schema]
app_scope: all
owner: kb-mcp
created: 2026-05-21
tags: [schema, drift, sync, queue]
---

<!--
  SCHEMA FILES = data model definitions in DBML format.
  This file models the LOGICAL structure of queue entries in sync/*.md files.
  KB queue files are markdown, not SQL — DBML is used for type clarity and graph wiring.
-->

// drift-queue logical schema
// Models the entry shape written to sync/code-drift.md, sync/kb-drift.md,
// sync/standards-drift.md, and sync/standards-backlog.md.
// Format: dbdiagram.io DBML — https://dbml.dbdiagram.io/docs

Table drift_entry {
  entry_id        text   [pk, note: 'Stable hash of (file_path + rule_id + baseline_ref) for dedup']
  queue_file      text   [not null, note: 'sync/code-drift.md | sync/kb-drift.md | sync/standards-drift.md | sync/standards-backlog.md']
  direction       drift_direction [not null]
  file_path       text   [not null, note: 'Path relative to repo root']
  rule_id         text   [note: 'Set for standards-drift / standards-backlog; null for code/kb drift']
  baseline_ref    text   [not null, note: 'Git ref used for the diff window']
  status          entry_status [not null, default: 'open']
  rename_link     text   [note: 'For rename pairs: "← renamed from <old path>" or broken wikilink list']
  detected_at     timestamp [not null]
  resolved_at     timestamp [note: 'Null while status = open']
  resolved_by     text   [note: 'Phase 2 actor; null while open']
  reason          text   [note: 'Required when status = dismissed']
}

Table drift_log_event {
  event_id        text   [pk]
  entry_id        text   [ref: > drift_entry.entry_id]
  event_type      log_event_type [not null]
  occurred_at     timestamp [not null]
  month_partition text   [not null, note: 'YYYY-MM key for sync/drift-log/YYYY-MM.md']
  detail          text
}

Enum drift_direction {
  "code_to_kb"
  "kb_to_code"
  "standards_current"
  "standards_aspirational"
}

Enum entry_status {
  open
  summaries          // code→KB: KB updated
  reverted           // code→KB: code change was wrong
  kb_confirmed       // KB→code: code already matches
  applied            // standards: code fix applied
  exempted           // standards: rule exception recorded on the standard
  promoted           // standards: senior-dev review pending
  dismissed
}

Enum log_event_type {
  "OPENED"
  "RESOLVED"
  "AUTO-CLOSED-PROMOTION"      // rule changed
  "AUTO-CLOSED-STANDARD"       // standard removed
  "AUTO-DISMISSED"             // standard removed
}

// Ref: drift_log_event.entry_id > drift_entry.entry_id

// Used by:
// - [[specs/features/bidirectional-drift-detection]]
// - [[specs/flows/drift-resolution]]
// - [[data/validation/drift-entry-shape]]
