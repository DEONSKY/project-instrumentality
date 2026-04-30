import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StatusSummary } from "./types.js";
import { readCodeDrift } from "./parsers/code-drift.js";
import { readKbDrift } from "./parsers/kb-drift.js";
import { readStandardsDrift } from "./parsers/standards-drift.js";
import { readConformPending } from "./parsers/conform-pending.js";
import { readPromotions } from "./parsers/promotions.js";
import { runLint } from "./parsers/lint.js";

const execFileP = promisify(execFile);

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
        : runLint(kbRoot),
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
