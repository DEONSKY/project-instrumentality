// Shared shapes for the drift queues (code-drift.md / kb-drift.md) and the
// drift audit log. These describe the in-memory state that queue.ts parses
// from and serializes back to the markdown queue files, plus the heterogeneous
// records appended to the drift log.

export interface Acknowledgement {
  by: string
  atCommit: string
  atDate: string
  reason: string
}

export interface RefCount {
  count: number
  anchor: string | null
}

// A single code file tracked under a code-drift entry. `since` is the drift
// anchor (pinned), `latest` the most recent touch.
export interface CodeFile {
  path: string
  renamedFrom?: string
  sinceCommit: string
  sinceDate: string
  latestCommit?: string
  latestDate?: string
  author?: string
  source?: string
}

// One `## <kb_target>` block in code-drift.md.
export interface CodeDriftEntry {
  kbTarget: string
  codeFiles: CodeFile[]
  hasShared: boolean
  acknowledgement?: Acknowledgement
  fingerprint?: string
  source?: string
}

// One `## <kb_file>` block in kb-drift.md.
export interface KbDriftEntry {
  kbFile: string
  renamedFrom?: string
  codeAreas: string[]
  refCount?: RefCount
  references: string[]
  sinceCommit?: string
  sinceDate?: string
  latestCommit?: string
  latestDate?: string
  author?: string
  acknowledgement?: Acknowledgement
  fingerprint?: string
  unmapped: boolean
  source?: string
}

export interface CodeDriftState {
  header: string
  entries: CodeDriftEntry[]
}

export interface KbDriftState {
  header: string
  entries: KbDriftEntry[]
}

// Heterogeneous audit-log record. `event_type` discriminates the rendered
// shape; the remaining fields are populated per event type, so all are
// optional and an open index keeps each emit site readable.
export interface DriftLogEntry {
  event_type?: string
  // purge
  baseline?: string
  code_count?: number
  kb_count?: number
  code_body?: string
  kb_body?: string
  // re-bootstrap
  old_sha?: string
  new_sha?: string
  repo?: string
  resolver_used?: string
  // dismissed / acknowledged / auto-closed
  queue?: string
  queue_key?: string
  reason?: string
  by?: string
  at_commit?: string
  old_fingerprint?: string
  new_fingerprint?: string | null
  // resolved
  resolution?: string
  direction?: string
  kb_target?: string
  kb_file?: string
  code_file?: string
  code_files?: string[]
  renamed_from?: string
  unmapped?: boolean
  summary?: string
  [key: string]: unknown
}
