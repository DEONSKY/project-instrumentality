import * as fs from "node:fs";
import type { KbDriftEntry, QueueBaseline } from "../types.js";
import { parseBaseline, splitHeaderAndBlocks } from "./baseline.js";
import { kbSyncPath } from "../kb-root.js";

export function parseKbDrift(content: string): {
  entries: KbDriftEntry[];
  baseline: QueueBaseline;
} {
  const baseline = parseBaseline(content);
  const { blocks } = splitHeaderAndBlocks(content);
  const entries: KbDriftEntry[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^## (.+)/);
    const kbFile = headingMatch ? headingMatch[1].trim() : null;
    if (!kbFile) continue;

    const renamedMatch = block.match(/\*\*Renamed from:\*\*\s*`([^`]+)`/);
    const sinceMatch = block.match(/\*\*Since:\*\*\s*`([^`]+)`\s*\(([^)]+)\)/);
    const latestMatch = block.match(/\*\*Latest:\*\*\s*`([^`]+)`\s*\(([^)]+)\)/);
    const unmapped = /KB spec changed without mapped code paths/.test(block);

    const codeAreas: string[] = [];
    const references: string[] = [];
    let inCodeAreas = false;
    let inRefs = false;
    let refCount: { count: number; anchor: string | null } | undefined;

    for (const line of block.split("\n")) {
      if (/^- \*\*Code areas to review:\*\*/.test(line)) {
        inCodeAreas = true;
        inRefs = false;
        continue;
      }
      if (/^- \*\*References to update:\*\*/.test(line)) {
        inCodeAreas = false;
        inRefs = true;
        const countMatch = line.match(
          /\*\*References to update:\*\*\s*(\d+)\s*file\(s\)\s*contain\s*`\[\[([^\]]+)\]\]`/
        );
        if (countMatch) {
          refCount = { count: parseInt(countMatch[1], 10), anchor: countMatch[2] };
        } else if (/none found/.test(line)) {
          refCount = { count: 0, anchor: null };
        }
        continue;
      }
      if (/^- \*\*/.test(line)) {
        inCodeAreas = false;
        inRefs = false;
        continue;
      }
      if (inCodeAreas) {
        const m = line.match(/^\s+-\s+`([^`]+)`/);
        if (m) codeAreas.push(m[1]);
      }
      if (inRefs) {
        const m = line.match(/^\s+-\s+`([^`]+)`/);
        if (m) references.push(m[1]);
      }
    }

    const entry: KbDriftEntry = {
      kind: "kb-drift",
      kbFile,
      codeAreas,
      references,
      unmapped,
    };
    if (renamedMatch) entry.renamedFrom = renamedMatch[1];
    if (refCount) entry.refCount = refCount;
    if (sinceMatch) {
      entry.sinceCommit = sinceMatch[1];
      entry.sinceDate = sinceMatch[2];
    }
    if (latestMatch) {
      entry.latestCommit = latestMatch[1];
      entry.latestDate = latestMatch[2];
    }
    entries.push(entry);
  }

  return { entries, baseline };
}

export function readKbDrift(kbRoot: string): {
  entries: KbDriftEntry[];
  baseline: QueueBaseline;
} {
  const file = kbSyncPath(kbRoot, "kb-drift.md");
  if (!fs.existsSync(file)) return { entries: [], baseline: { sha: null } };
  return parseKbDrift(fs.readFileSync(file, "utf8"));
}
