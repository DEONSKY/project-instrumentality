export type DriftKind = "code-drift" | "kb-drift" | "standards-drift";

export interface FileRef {
  path: string;
  sinceCommit?: string;
  sinceDate?: string;
  latestCommit?: string;
  latestDate?: string;
  renamedFrom?: string;
}

export interface CodeDriftEntry {
  kind: "code-drift";
  kbTarget: string;
  codeFiles: FileRef[];
  hasShared: boolean;
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

export type StandardsVerdict =
  | AppliedVerdict
  | ExemptedVerdict
  | PromotedVerdict
  | DismissedVerdict;

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
