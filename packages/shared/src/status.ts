import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ConformPending,
  StandardDefinition,
  StandardsDriftEntry,
  PromotionEntry,
  StatusSummary,
} from "./types.js";
import { readCodeDrift } from "./parsers/code-drift.js";
import { readKbDrift } from "./parsers/kb-drift.js";
import { readStandardsDrift } from "./parsers/standards-drift.js";
import { readConformPending } from "./parsers/conform-pending.js";
import { readPromotions } from "./parsers/promotions.js";
import { runLint } from "./parsers/lint.js";
import { readStandardDefinition, findRule } from "./parsers/standards.js";

const execFileP = promisify(execFile);

function enrichWithStandards(
  kbRoot: string,
  drifts: StandardsDriftEntry[],
  promotions: PromotionEntry[],
  conformPendings: (ConformPending | null)[]
): void {
  const defs = new Map<string, StandardDefinition | null>();
  const lookup = (id: string | null): StandardDefinition | null => {
    if (!id) return null;
    if (defs.has(id)) return defs.get(id)!;
    const def = readStandardDefinition(kbRoot, id);
    defs.set(id, def);
    return def;
  };
  for (const e of drifts) {
    const def = lookup(e.standardId);
    e.resolvedRule = findRule(def, e.ruleId);
    e.resolvedStandard = def
      ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
      : null;
  }
  for (const e of promotions) {
    const def = lookup(e.standardId);
    e.resolvedRule = findRule(def, e.ruleId);
    e.resolvedStandard = def
      ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
      : null;
  }
  for (const p of conformPendings) {
    if (!p) continue;
    for (const r of p.requested) {
      const def = lookup(r.standard_id);
      r.resolvedStandard = def
        ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
        : null;
      r.resolvedRules = def
        ? r.rule_ids.map((id) => findRule(def, id)).filter((x): x is NonNullable<typeof x> => !!x)
        : [];
    }
  }
}

async function getCurrentHeadShort(kbRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", ["rev-parse", "--short", "HEAD"], {
      cwd: kbRoot,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export interface GetStatusOptions {
  /** Skip the lint subprocess (faster; useful when callers already have it). */
  skipLint?: boolean;
  /** Override lint command (e.g. "npx kb-lint") for consumer projects. */
  lintCommand?: string;
}

export async function getStatus(
  kbRoot: string,
  opts: GetStatusOptions = {}
): Promise<StatusSummary> {
  const [codeDrift, kbDrift, standardsDrift, currentPending, asp, promotions, lint, head] =
    await Promise.all([
      Promise.resolve(readCodeDrift(kbRoot)),
      Promise.resolve(readKbDrift(kbRoot)),
      Promise.resolve(readStandardsDrift(kbRoot)),
      Promise.resolve(readConformPending(kbRoot, "current")),
      Promise.resolve(readConformPending(kbRoot, "aspirational")),
      Promise.resolve(readPromotions(kbRoot)),
      opts.skipLint
        ? Promise.resolve({ violations: [], ran: false })
        : runLint(kbRoot, { commandOverride: opts.lintCommand }),
      getCurrentHeadShort(kbRoot),
    ]);

  const stale = (recorded: string) =>
    head !== null && recorded.length > 0 && !head.startsWith(recorded) && !recorded.startsWith(head);

  const conformCurrent = currentPending
    ? { ...currentPending, staleAgainstHead: stale(currentPending.head_sha_short) }
    : null;
  const conformAspirational = asp
    ? { ...asp, staleAgainstHead: stale(asp.head_sha_short) }
    : null;

  enrichWithStandards(kbRoot, standardsDrift.entries, promotions, [
    currentPending,
    asp,
  ]);

  const driftCount =
    codeDrift.entries.length + kbDrift.entries.length + standardsDrift.entries.length;
  const conformPendingCount =
    (conformCurrent?.requested.length ?? 0) +
    (conformAspirational?.requested.length ?? 0);
  const lintErrors = lint.violations.filter((v) => v.severity === "error").length;
  const lintWarnings = lint.violations.filter((v) => v.severity === "warn").length;

  return {
    kbRoot,
    currentHeadShort: head,
    codeDrift,
    kbDrift,
    standardsDrift,
    conformPending: { current: conformCurrent, aspirational: conformAspirational },
    promotions,
    lint,
    totals: {
      drifts: driftCount,
      conformPending: conformPendingCount,
      promotions: promotions.length,
      lintErrors,
      lintWarnings,
      grand: driftCount + conformPendingCount + promotions.length + lintErrors + lintWarnings,
    },
  };
}
