import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  CodeDriftEntry,
  ConformPending,
  KbDriftEntry,
  StandardDefinition,
  StandardsDriftEntry,
  PromotionEntry,
  StatusSummary,
} from "./types.js";
import { readCodeDrift } from "./parsers/code-drift.js";
import { readKbDrift } from "./parsers/kb-drift.js";
import {
  readStandardsDrift,
  readStandardsBacklog,
} from "./parsers/standards-drift.js";
import { readConformPending } from "./parsers/conform-pending.js";
import { readPromotions } from "./parsers/promotions.js";
import { runLint } from "./parsers/lint.js";
import { readStandardDefinition, findRule } from "./parsers/standards.js";
import { readDriftLog, currentAndPreviousMonth } from "./parsers/drift-log.js";
import { getSubmoduleStatus } from "./submodule-status.js";
import { getHooksStatus } from "./hooks-status.js";

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
  /**
   * Live mode — instead of reading the committed `knowledge/sync/*.md` files,
   * spawn the live-status runner which calls `drift.runTool({ readonly: true })`
   * and `conform.runTool({ readonly: true })` and overlays the in-memory
   * entries onto the returned summary. Use this for the watcher in the
   * extension: the dashboard reflects the working-tree state without writing
   * to disk. Falls back to disk-read silently if the runner script isn't
   * present (consumer projects without the MCP source in tree).
   */
  live?: boolean;
}

export async function getStatus(
  kbRoot: string,
  opts: GetStatusOptions = {}
): Promise<StatusSummary> {
  const liveOverlay = opts.live ? await runLiveStatus(kbRoot) : null;

  const [
    codeDrift,
    kbDrift,
    standardsDriftCurrent,
    standardsBacklog,
    currentPending,
    asp,
    promotions,
    driftLogEvents,
    lint,
    head,
    submodules,
    hooks,
  ] = await Promise.all([
    Promise.resolve(readCodeDrift(kbRoot)),
    Promise.resolve(readKbDrift(kbRoot)),
    Promise.resolve(readStandardsDrift(kbRoot)),
    Promise.resolve(readStandardsBacklog(kbRoot)),
    Promise.resolve(readConformPending(kbRoot, "current")),
    Promise.resolve(readConformPending(kbRoot, "aspirational")),
    Promise.resolve(readPromotions(kbRoot)),
    Promise.resolve(readDriftLog(kbRoot, currentAndPreviousMonth())),
    opts.skipLint
      ? Promise.resolve({ violations: [], ran: false })
      : runLint(kbRoot, { commandOverride: opts.lintCommand }),
    getCurrentHeadShort(kbRoot),
    getSubmoduleStatus(kbRoot).catch(() => null),
    getHooksStatus(kbRoot).catch(() => null),
  ]);

  // Overlay live computations onto the disk-read summaries when present.
  // Baseline stays from the disk-read header; only the entry sets are
  // swapped. Standards-drift current + backlog are kept separate by the
  // runner (entries[] vs backlogEntries[]) so the existing merge logic
  // below still applies.
  const codeDriftFinal = liveOverlay
    ? { entries: liveOverlay.codeEntries, baseline: codeDrift.baseline }
    : codeDrift;
  const kbDriftFinal = liveOverlay
    ? { entries: liveOverlay.kbEntries, baseline: kbDrift.baseline }
    : kbDrift;
  const standardsCurrentFinal = liveOverlay
    ? { entries: liveOverlay.standardsEntries, baseline: standardsDriftCurrent.baseline }
    : standardsDriftCurrent;
  const standardsBacklogFinal = liveOverlay
    ? { entries: liveOverlay.backlogEntries, baseline: standardsBacklog.baseline }
    : standardsBacklog;

  // Merge current-mode standards-drift entries with aspirational backlog
  // entries. Each carries its own `mode` discriminator so the UI can render
  // them differently (advisory chip + demoted opacity for aspirational).
  // Baseline tracking stays with the current-mode queue — that's the
  // PR-blocking artifact; backlog is advisory.
  const standardsDrift = {
    entries: [...standardsCurrentFinal.entries, ...standardsBacklogFinal.entries],
    baseline: standardsCurrentFinal.baseline,
  };

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
    codeDriftFinal.entries.length + kbDriftFinal.entries.length + standardsDrift.entries.length;
  const conformPendingCount =
    (conformCurrent?.requested.length ?? 0) +
    (conformAspirational?.requested.length ?? 0);
  const lintErrors = lint.violations.filter((v) => v.severity === "error").length;
  const lintWarnings = lint.violations.filter((v) => v.severity === "warn").length;

  return {
    kbRoot,
    currentHeadShort: head,
    codeDrift: codeDriftFinal,
    kbDrift: kbDriftFinal,
    standardsDrift,
    conformPending: { current: conformCurrent, aspirational: conformAspirational },
    promotions,
    driftLogEvents,
    lint,
    submodules: submodules ?? undefined,
    hooks: hooks ?? undefined,
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

// ── Live-status runner ───────────────────────────────────────────────────────
//
// Spawns knowledge/_mcp/scripts/live-status.js. Returns null when the script
// is absent (consumer projects without the MCP source) or on any error — the
// caller falls back to the disk-read state.

interface LiveOverlay {
  headSha: string | null;
  codeEntries: CodeDriftEntry[];
  kbEntries: KbDriftEntry[];
  standardsEntries: StandardsDriftEntry[];
  backlogEntries: StandardsDriftEntry[];
}

function runLiveStatus(kbRoot: string): Promise<LiveOverlay | null> {
  const script = path.join(kbRoot, "knowledge", "_mcp", "scripts", "live-status.js");
  if (!fs.existsSync(script)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: kbRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const trimmed = stdout.trim();
      if (!trimmed) return resolve(null);
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.error) return resolve(null);
        // Tag standards entries with their mode so the existing merge logic
        // and `mode`-aware UI rendering still works. The runner returns them
        // un-tagged since they come straight from the in-memory state.
        const tagMode = (entries: StandardsDriftEntry[], mode: "current" | "aspirational") =>
          entries.map((e) => ({ ...e, mode }));
        resolve({
          headSha: parsed.headSha ?? null,
          codeEntries: parsed.codeEntries ?? [],
          kbEntries: parsed.kbEntries ?? [],
          standardsEntries: tagMode(parsed.standardsEntries ?? [], "current"),
          backlogEntries: tagMode(parsed.backlogEntries ?? [], "aspirational"),
        });
      } catch {
        resolve(null);
      }
    });
  });
}
