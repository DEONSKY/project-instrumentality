// Shapes for the conform queues (standards-drift.md / standards-backlog.md),
// the pending-evaluation cache, and the conform audit-log records. Mirrors
// src/types/drift but specialized for conform's per-rule entry shape
// (queueKey = `<standard_id>.<rule_id>`, files grouped by party for contracts).

import type { Acknowledgement } from './drift'

// One file tracked under a conform queue entry, under a given party.
export interface ConformFile {
  path: string
  sinceCommit: string
  sinceDate: string
  latestCommit?: string | null
  latestDate?: string | null
  author?: string
  source?: string
  renamedFrom?: string
}

// One `## <standard>.<rule>` block. `filesByParty` keys are party names, or
// `_` for the non-contract single-block case.
export interface ConformEntry {
  queueKey: string
  standardId: string | null
  standardKind: string | null
  ruleId: string | null
  severity: string | null
  reason: string | null
  filesByParty: Record<string, ConformFile[]>
  acknowledgement?: Acknowledgement
  source?: string
}

export interface ConformState {
  header: string
  entries: ConformEntry[]
}

// Inputs to upsertQueueEntry.
// Minimal shapes upsertQueueEntry reads. No index signature so the standards
// index types (StandardIndexEntry / StandardRule) assign cleanly.
export interface ConformStandard { id?: string; kind?: string | null }
export interface ConformRule { id?: string; severity?: string | null }
export interface ConformUpsertFile {
  partyName?: string | null
  filePath: string
  sinceCommit: string
  sinceDate: string
  source?: string
  author?: string
}

// Heterogeneous audit-log record for conform events; `event_type`
// discriminates the rendered shape, remaining fields are per-event.
export interface ConformLogEntry {
  event_type?: string
  resolution?: string
  queue_key?: string
  file_paths?: string[]
  originating_files?: string[]
  reason?: string
  note?: string
  by?: string
  at_commit?: string
  [key: string]: unknown
}
