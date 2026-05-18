export type DriftKind = "code-drift" | "kb-drift" | "standards-drift";

/**
 * Origin of a drift entry. `committed` entries come from the published .md
 * queue or from a `baseline..HEAD` git diff. `working-tree` entries are
 * synthesised by the live readonly runner from the author's uncommitted
 * changes (staged + unstaged + untracked) — they only exist in the live
 * overlay and are never written to disk. Absent → treat as `committed`
 * for back-compat with consumers that don't know about the discriminator.
 */
export type DriftSource = "committed" | "working-tree";

export interface FileRef {
  path: string;
  sinceCommit?: string;
  sinceDate?: string;
  latestCommit?: string;
  latestDate?: string;
  renamedFrom?: string;
  /**
   * Commit author for the change range, derived from `git log --format=%ae`
   * over sinceCommit..latestCommit. Lets reviewers see at a glance whether
   * a drift came from themselves vs. someone else.
   */
  author?: string;
  source?: DriftSource;
}

/**
 * Author-attested "real change, but doesn't invalidate the KB." Soft signal —
 * the entry stays in the queue but is visually muted and reviewers can filter
 * it out. A later resolving verdict (apply / dismiss / etc.) overrides this.
 */
export interface Acknowledgement {
  /** Author handle (email local-part or git config name). */
  by: string;
  /** Commit SHA at which the acknowledgement was recorded. */
  atCommit: string;
  /** ISO date string. */
  atDate: string;
  /** Mandatory — prevents ack-spam. */
  reason: string;
}

export interface CodeDriftEntry {
  kind: "code-drift";
  kbTarget: string;
  codeFiles: FileRef[];
  hasShared: boolean;
  acknowledgement?: Acknowledgement;
  /**
   * Entry-level source. An entry is `working-tree` when at least one of its
   * codeFiles is `working-tree`; otherwise `committed`. Live overlay sets
   * this; queue-file parsers always set `committed`.
   */
  source?: DriftSource;
}

export interface KbDriftEntry {
  kind: "kb-drift";
  kbFile: string;
  renamedFrom?: string;
  codeAreas: string[];
  references: string[];
  refCount?: { count: number; anchor: string | null };
  sinceCommit?: string;
  sinceDate?: string;
  latestCommit?: string;
  latestDate?: string;
  unmapped: boolean;
  author?: string;
  acknowledgement?: Acknowledgement;
  source?: DriftSource;
}

export interface StandardRule {
  id: string;
  title: string | null;
  severity: "error" | "warn" | "info" | null;
  description: string | null;
  why: string | null;
  fixHint: string | null;
  examples: unknown[] | null;
  exceptions: unknown[] | null;
}

export interface StandardDefinition {
  id: string;
  kind: string | null;
  appScope: string | null;
  topic: string | null;
  tags: string[];
  rules: StandardRule[];
  filePath: string;
}

export interface ResolvedStandardRef {
  id: string;
  kind: string | null;
  topic: string | null;
  filePath: string;
}

export type StandardsDriftMode = "current" | "aspirational";

export interface StandardsDriftEntry {
  kind: "standards-drift";
  mode: StandardsDriftMode;
  queueKey: string;
  standardId: string | null;
  standardKind: string | null;
  ruleId: string | null;
  severity: string | null;
  reason: string | null;
  filesByParty: Record<string, FileRef[]>;
  resolvedRule?: StandardRule | null;
  resolvedStandard?: ResolvedStandardRef | null;
  acknowledgement?: Acknowledgement;
  source?: DriftSource;
}

export interface PromotionEntry {
  queueKey: string;
  standardId: string | null;
  standardKind: string | null;
  ruleId: string | null;
  severity: string | null;
  ruleFingerprint: string | null;
  files: { path: string; promotedAt: string; note?: string }[];
  resolvedRule?: StandardRule | null;
  resolvedStandard?: ResolvedStandardRef | null;
}

export interface ConformRequest {
  file: string;
  standard_id: string;
  rule_ids: string[];
  resolvedStandard?: ResolvedStandardRef | null;
  resolvedRules?: StandardRule[];
}

export interface ConformPending {
  mode: "current" | "aspirational";
  scope: string | null;
  requested: ConformRequest[];
  head_sha_short: string;
  head_date: string;
}

export interface LintViolation {
  file: string;
  severity: "error" | "warn";
  message: string;
}

export interface QueueBaseline {
  sha: string | null;
}

// ── Drift-log audit events ──────────────────────────────────────────────────
//
// Every entry in `sync/drift-log/YYYY-MM.md` parses into one of these. The
// shape mirrors the writer in `knowledge/_mcp/tools/conform.js`'s
// appendToDriftLog (and drift.js for the kb_drift side).

export type DriftLogEventType =
  | "conformed-applied"
  | "conformed-exempted"
  | "conformed-promoted"
  | "dismissed-conform"
  | "closed-promotion"
  | "auto-dismissed-standard-removed"
  | "auto-closed-promotion-rule-changed"
  | "auto-closed-promotion-standard-removed"
  | "drift-resolved"
  | "drift-dismissed"
  | "drift-acknowledged"
  | "re-bootstrap"
  | "unknown";

export interface DriftLogEvent {
  date: string; // YYYY-MM-DD
  eventType: DriftLogEventType;
  rawHeading: string; // the full `## ... · ... · ...` line for fallback display
  queueKey?: string;
  kbTarget?: string;
  kbFile?: string;
  files?: string[];
  originatingFiles?: string[];
  reason?: string;
  note?: string;
  // System-only events have isSystem = true (auto-* and re-bootstrap).
  isSystem: boolean;
}

// ── Verdict shapes (for verdict picker forms in the consumer UI) ────────────
//
// Discriminated unions — when a consumer dispatches a verdict, it produces
// one of these and the prompt generator turns it into an MCP-call prompt.

export interface AppliedVerdict {
  verdict: "applied";
  queueKey: string;
}
export interface ExemptedVerdict {
  verdict: "exempted";
  queueKey: string;
  filePaths: string[];
  reason: string;
}
export interface PromotedVerdict {
  verdict: "promoted";
  queueKey: string;
  originatingFiles: string[];
  note?: string;
}
export interface DismissedVerdict {
  verdict: "dismissed";
  queueKey: string;
  reason: string;
}
export interface ClosedPromotionVerdict {
  verdict: "closed_promotion";
  queueKey: string;
  filePaths: string[];
  reason: string;
}

/**
 * Non-resolving verdict — annotates the entry as author-vetted but leaves it
 * in the queue for downstream reviewers. Carries a mandatory reason.
 *
 * Unlike the other verdicts (which only target standards-drift), this one is
 * valid on all three drift kinds, so it carries `kind` to route the prompt
 * to the right MCP tool (kb_drift vs kb_conform).
 */
export interface AcknowledgedVerdict {
  verdict: "acknowledged";
  kind: DriftKind;
  /**
   * Identifies the entry. For code-drift this is the kbTarget, for kb-drift
   * the kbFile, for standards-drift the queueKey.
   */
  entryKey: string;
  reason: string;
}

export type StandardsVerdict =
  | AppliedVerdict
  | ExemptedVerdict
  | PromotedVerdict
  | DismissedVerdict
  | AcknowledgedVerdict;

export type PromotionVerdict = ClosedPromotionVerdict;

export type StatusEntry =
  | CodeDriftEntry
  | KbDriftEntry
  | StandardsDriftEntry;

export interface StatusSummary {
  kbRoot: string;
  currentHeadShort: string | null;
  codeDrift: { entries: CodeDriftEntry[]; baseline: QueueBaseline };
  kbDrift: { entries: KbDriftEntry[]; baseline: QueueBaseline };
  standardsDrift: { entries: StandardsDriftEntry[]; baseline: QueueBaseline };
  conformPending: {
    current: (ConformPending & { staleAgainstHead: boolean }) | null;
    aspirational: (ConformPending & { staleAgainstHead: boolean }) | null;
  };
  promotions: PromotionEntry[];
  driftLogEvents: DriftLogEvent[];
  lint: { violations: LintViolation[]; ran: boolean; error?: string };
  submodules?: SubmoduleStatus;
  hooks?: HooksStatus;
  totals: {
    drifts: number;
    conformPending: number;
    promotions: number;
    lintErrors: number;
    lintWarnings: number;
    grand: number;
  };
  /**
   * Code-path globs from `knowledge/_rules.md` → `code_path_patterns[].paths`,
   * piggybacked through the live-status runner so the extensions can scope
   * their source-file watchers without spawning a second subprocess. Null
   * when not in live mode or when rules loading failed.
   */
  livePatterns?: string[] | null;
  /**
   * Mechanical findings from auditing `code_path_patterns` against the current
   * filesystem state. Surfaced by the live-status runner (kb_drift readonly).
   * Rendered in the panel-level "Mapping diagnostics" accordion. Null/empty
   * when no findings or when not in live mode.
   */
  patternAudit?: PatternAudit | null;
}

/** Pattern-audit finding union — produced by knowledge/_mcp/lib/pattern-audit.js. */
export type PatternAuditFinding =
  | {
      type: "orphan_pattern";
      pattern_index: number;
      intent?: string;
      // Mirrors the rule's `kb_target` field — string OR string[] when the
      // pattern declares fallback alternatives.
      kb_target: string | string[];
      paths: string[];
      is_submodule_pattern: boolean;
    }
  | {
      type: "ghost_target";
      pattern_index: number;
      // Always a single resolved path (the first candidate when array form).
      resolved_target: string;
      reason: "kb_file_missing";
    }
  | {
      type: "convention_violation";
      pattern_index: number;
      intent: string;
      kb_target: string | string[];
      expected_folder: string;
    }
  | {
      type: "unmapped_kb_group";
      folder: string;
      count: number;
      sample_files: string[];
    }
  | {
      type: "fanout_with_hardcoded";
      pattern_index: number;
      kb_target: string | string[];
      distinct_concepts: number;
    };

export interface PatternAudit {
  findings: PatternAuditFinding[];
}

/**
 * Normalize a `kb_target` field (string or array of fallback alternatives)
 * to a single user-readable string for display. Joins arrays with ` | ` so
 * the UI shows all candidates without picking one — that disambiguation
 * happens at resolve time, not at display time.
 */
export function formatKbTarget(t: string | string[]): string {
  return Array.isArray(t) ? t.join(" | ") : t;
}

// ── Submodule status ────────────────────────────────────────────────────────
//
// Mirrors what knowledge/_mcp/tools/sub.js exposes via `kb_sub status`, but
// computed in-process by the extension so the sidebar can show always-on
// state without round-tripping through the MCP. The `wouldBlockPush`
// re-implements the rule encoded in the managed pre-push hook (see
// knowledge/_mcp/tools/init.js) so the UI can preflight a push before it
// runs.

export type SubmoduleType = "owned" | "shared";

export interface SubmoduleEntry {
  /** `[submodule "<name>"]` from .gitmodules */
  name: string;
  /** path relative to the parent repo root */
  path: string;
  /** absolute path on disk */
  fullPath: string;
  /** "shared" when .gitmodules sets `kb-shared = true`, else "owned" */
  type: SubmoduleType;
  /** current submodule branch, or null when detached / unreadable */
  branch: string | null;
  /** true when the parent's HEAD ls-tree pointer differs from upstream */
  pointerChanged: boolean;
  /**
   * Only set for **owned** submodules whose pointer changed AND whose
   * branch is not the parent's branch. Same rule the pre-push hook uses.
   */
  branchMismatch: boolean;
  /**
   * Absolute path of the resolved gitdir's HEAD file. Used by the
   * extension to install a FileSystemWatcher so branch switches inside
   * the submodule refresh the UI without polling.
   */
  gitdirHeadPath: string | null;
}

export interface SubmoduleStatus {
  /** Parent branch (null if detached HEAD on the parent). */
  parentBranch: string | null;
  /** Parent's `.git/HEAD` path — also watched. */
  parentGitdirHeadPath: string | null;
  /** Empty when `.gitmodules` is absent. */
  entries: SubmoduleEntry[];
  /**
   * Precomputed pre-push preflight. When any owned submodule has
   * branchMismatch=true, `wouldBlock` is true and `blockingPaths` lists
   * the offending submodule paths. UI uses this to decorate "Run push"
   * red and surface the same remediation the hook would print.
   */
  wouldBlock: boolean;
  blockingPaths: string[];
  /**
   * Shared submodules whose pointer changed — the pre-push hook warns
   * (not blocks). Surfaced as an inline note next to "Run push".
   */
  sharedPointerChanged: string[];
}

// ── Hooks status ────────────────────────────────────────────────────────────
//
// Reads `.git/hooks/{pre-commit,pre-push,post-merge,post-checkout}` and
// checks for the `# kb-mcp managed` marker that knowledge/_mcp/tools/init.js
// writes. UI shows a small header badge so the user knows whether the
// hooks are still in place (a teammate's `git config core.hooksPath`
// override, a stale repo clone, etc., can silently disable them).

export type HooksHealth = "managed" | "partial" | "missing";

export interface HookFileStatus {
  /** Hook filename, e.g. "pre-push". */
  name: string;
  /** True when the file exists. */
  present: boolean;
  /** True when the `# kb-mcp managed` marker line is present. */
  managed: boolean;
}

export interface HooksStatus {
  health: HooksHealth;
  hooks: HookFileStatus[];
}
