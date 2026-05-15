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
  totals: {
    drifts: number;
    conformPending: number;
    promotions: number;
    lintErrors: number;
    lintWarnings: number;
    grand: number;
  };
}
