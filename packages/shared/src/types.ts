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

export interface StandardsDriftEntry {
  kind: "standards-drift";
  queueKey: string;
  standardId: string | null;
  standardKind: string | null;
  ruleId: string | null;
  severity: string | null;
  reason: string | null;
  filesByParty: Record<string, FileRef[]>;
}

export interface PromotionEntry {
  queueKey: string;
  standardId: string | null;
  standardKind: string | null;
  ruleId: string | null;
  severity: string | null;
  ruleFingerprint: string | null;
  files: { path: string; promotedAt: string; note?: string }[];
}

export interface ConformPending {
  mode: "current" | "aspirational";
  scope: string | null;
  requested: { file: string; standard_id: string; rule_ids: string[] }[];
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
