import * as fs from "node:fs";
import type {
  FileRef,
  QueueBaseline,
  StandardsDriftEntry,
} from "../types.js";
import { parseBaseline, splitHeaderAndBlocks } from "./baseline.js";
import { kbSyncPath } from "../kb-root.js";

const FILE_LINE_RE =
  /^\s+-\s+`([^`]+)`\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?/;

export function parseStandardsDrift(content: string): {
  entries: StandardsDriftEntry[];
  baseline: QueueBaseline;
} {
  const baseline = parseBaseline(content);
  const { blocks } = splitHeaderAndBlocks(content);
  const entries: StandardsDriftEntry[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^## (.+)/);
    const queueKey = headingMatch ? headingMatch[1].trim() : null;
    if (!queueKey) continue;

    const stdMatch = block.match(
      /\*\*Standard:\*\*\s*`([^`]+)`(?:\s*\(([^)]+)\))?/
    );
    const ruleMatch = block.match(/\*\*Rule:\*\*\s*`([^`]+)`\s*—\s*(\w+)/);
    const reasonMatch = block.match(/\*\*Reason:\*\*\s*(.+?)(?:\n|$)/);

    const filesByParty: Record<string, FileRef[]> = {};
    let currentParty: string | null = null;
    let inFiles = false;

    for (const line of block.split("\n")) {
      const partyMatch = line.match(
        /^- \*\*Files(?:\s*\(party:\s*([^)]+)\))?:\*\*/
      );
      if (partyMatch) {
        inFiles = true;
        currentParty = partyMatch[1] || null;
        const key = currentParty || "_";
        if (!filesByParty[key]) filesByParty[key] = [];
        continue;
      }
      if (/^- \*\*/.test(line)) {
        inFiles = false;
        continue;
      }
      if (!inFiles) continue;
      const m = line.match(FILE_LINE_RE);
      if (!m) continue;
      const partyKey = currentParty || "_";
      const f: FileRef = {
        path: m[1],
        sinceCommit: m[2],
        sinceDate: m[3],
      };
      if (m[4]) {
        f.latestCommit = m[4];
        f.latestDate = m[5];
      }
      filesByParty[partyKey].push(f);
    }

    entries.push({
      kind: "standards-drift",
      queueKey,
      standardId: stdMatch ? stdMatch[1] : null,
      standardKind: stdMatch ? stdMatch[2] || null : null,
      ruleId: ruleMatch ? ruleMatch[1] : null,
      severity: ruleMatch ? ruleMatch[2] : null,
      reason: reasonMatch ? reasonMatch[1].trim() : null,
      filesByParty,
    });
  }

  return { entries, baseline };
}

export function readStandardsDrift(kbRoot: string): {
  entries: StandardsDriftEntry[];
  baseline: QueueBaseline;
} {
  const file = kbSyncPath(kbRoot, "standards-drift.md");
  if (!fs.existsSync(file)) return { entries: [], baseline: { sha: null } };
  return parseStandardsDrift(fs.readFileSync(file, "utf8"));
}
