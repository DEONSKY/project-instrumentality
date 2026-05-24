import * as fs from "node:fs";
import type { DriftLogEvent, DriftLogEventType } from "../types.js";
import { splitHeaderAndBlocks } from "./baseline.js";
import { kbSyncPath } from "../kb-root.js";

// Heading shape (from conform.js / drift.js writers):
//   ## YYYY-MM-DD · CATEGORY · sub-discriminator
// Examples:
//   ## 2026-04-27 · CONFORMED · applied
//   ## 2026-04-27 · DISMISSED-CONFORM
//   ## 2026-04-27 · CLOSED-PROMOTION
//   ## 2026-04-27 · AUTO-CLOSED-PROMOTION · rule changed
//   ## 2026-04-17 · RESOLVED · kb→code
// `m` flag is load-bearing: blocks split by splitHeaderAndBlocks are
// multi-line (the heading + the - **Field:** bullets that follow), and
// without /m the trailing `$` only anchors at end-of-string, so the regex
// never matched and every drift-log parsed to zero events. This is the
// actual F19 root cause — the ACKNOWLEDGED switch was a downstream symptom.
const HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+)$/m;

function classifyHeading(rest: string): {
  type: DriftLogEventType;
  isSystem: boolean;
} {
  const upper = rest.toUpperCase();
  // F19: ACKNOWLEDGED was missing from this switch — events fell through to
  // "unknown" and rendered as "Unknown" in the Activity tab, making the tab
  // look empty when it actually contained acknowledged entries. The writer
  // (conform/queue.js appendToDriftLog) emits `## <date> · ACKNOWLEDGED ·
  // standards-drift` for the 'acknowledged' event type.
  if (upper.startsWith("ACKNOWLEDGED")) return { type: "drift-acknowledged", isSystem: false };
  if (upper.startsWith("CONFORMED")) {
    if (upper.includes("APPLIED")) return { type: "conformed-applied", isSystem: false };
    if (upper.includes("EXEMPTED")) return { type: "conformed-exempted", isSystem: false };
    if (upper.includes("PROMOTED")) return { type: "conformed-promoted", isSystem: false };
  }
  if (upper.startsWith("DISMISSED-CONFORM")) return { type: "dismissed-conform", isSystem: false };
  if (upper.startsWith("CLOSED-PROMOTION")) return { type: "closed-promotion", isSystem: false };
  if (upper.startsWith("AUTO-DISMISSED")) {
    return { type: "auto-dismissed-standard-removed", isSystem: true };
  }
  if (upper.startsWith("AUTO-CLOSED-PROMOTION")) {
    if (upper.includes("RULE CHANGED")) {
      return { type: "auto-closed-promotion-rule-changed", isSystem: true };
    }
    return { type: "auto-closed-promotion-standard-removed", isSystem: true };
  }
  if (upper.startsWith("RESOLVED")) return { type: "drift-resolved", isSystem: false };
  if (upper.startsWith("DISMISSED")) return { type: "drift-dismissed", isSystem: false };
  if (upper.startsWith("RE-BOOTSTRAP") || upper.includes("BOOTSTRAP")) {
    return { type: "re-bootstrap", isSystem: true };
  }
  return { type: "unknown", isSystem: false };
}

function extractField(block: string, label: string): string | undefined {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`);
  const m = block.match(re);
  return m ? m[1].trim() : undefined;
}

function extractFileList(block: string, label: string): string[] | undefined {
  const raw = extractField(block, label);
  if (!raw) return undefined;
  const out: string[] = [];
  for (const m of raw.matchAll(/`([^`]+)`/g)) out.push(m[1]);
  return out.length > 0 ? out : undefined;
}

function unquote(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^`(.+)`$/, "$1");
}

export function parseDriftLog(content: string): DriftLogEvent[] {
  const { blocks } = splitHeaderAndBlocks(content);
  const events: DriftLogEvent[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(HEADING_RE);
    if (!headingMatch) continue;
    const date = headingMatch[1];
    const rest = headingMatch[2];
    const { type, isSystem } = classifyHeading(rest);

    const ev: DriftLogEvent = {
      date,
      eventType: type,
      rawHeading: `## ${date} · ${rest}`,
      isSystem,
    };

    const queueKey = unquote(extractField(block, "Queue key"));
    if (queueKey) ev.queueKey = queueKey;

    const kbTarget = unquote(extractField(block, "KB target"));
    if (kbTarget) ev.kbTarget = kbTarget;

    const kbFile = unquote(extractField(block, "KB file"));
    if (kbFile) ev.kbFile = kbFile;

    const files = extractFileList(block, "Files");
    if (files) ev.files = files;

    const orig = extractFileList(block, "Originating files");
    if (orig) ev.originatingFiles = orig;

    const reason = extractField(block, "Reason");
    if (reason) ev.reason = reason;

    const note = extractField(block, "Note");
    if (note) ev.note = note;

    events.push(ev);
  }
  return events;
}

/**
 * Read drift-log files for the given month keys (e.g. ["2026-05", "2026-04"]).
 * Returns events newest-first across all months. Missing files are skipped.
 */
export function readDriftLog(kbRoot: string, monthKeys: string[]): DriftLogEvent[] {
  const all: DriftLogEvent[] = [];
  for (const month of monthKeys) {
    const file = kbSyncPath(kbRoot, "drift-log", `${month}.md`);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    const parsed = parseDriftLog(content);
    // F19: surface parse failures (non-empty file → zero events) so any
    // future heading-shape change is loud instead of silently emptying the
    // Activity tab. Cheap one-line warn; doesn't fire on the common case.
    if (parsed.length === 0 && content.trim().length > 0) {
      const firstHeadings = content
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .slice(0, 3);
      // eslint-disable-next-line no-console
      console.warn(
        `[drift-log] parsed 0 events from ${file} (${content.length} chars). First headings: ${JSON.stringify(firstHeadings)}`
      );
    }
    all.push(...parsed);
  }
  // Sort newest-first by date string (lexicographic works for YYYY-MM-DD).
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return all;
}

/**
 * Compute the {current, previous} month keys from a Date. Used to bound the
 * drift-log read so a long-running KB doesn't blow context with all-time
 * history.
 */
export function currentAndPreviousMonth(now: Date = new Date()): string[] {
  const yyyy = now.getUTCFullYear();
  const mm = now.getUTCMonth(); // 0-indexed
  const cur = `${yyyy}-${String(mm + 1).padStart(2, "0")}`;
  const prevDate = new Date(Date.UTC(yyyy, mm - 1, 1));
  const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return [cur, prev];
}
