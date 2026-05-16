import * as fs from "node:fs";
import type {
  Acknowledgement,
  CodeDriftEntry,
  FileRef,
  QueueBaseline,
} from "../types.js";
import { parseBaseline, splitHeaderAndBlocks } from "./baseline.js";
import { kbSyncPath } from "../kb-root.js";

const FILE_LINE_RE =
  /^\s+-\s+`([^`]+)`(?:\s+←\s+renamed from\s+`([^`]+)`)?\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?(?:\s+—\s+by\s+@(\S+))?/;

const ACK_RE =
  /\*\*Acknowledged\*\*:\s*@(\S+)\s+at\s+`([^`]+)`\s+\(([^)]+)\)\s+—\s+"([^"]+)"/;

function parseAck(block: string): Acknowledgement | undefined {
  const m = block.match(ACK_RE);
  if (!m) return undefined;
  return { by: m[1], atCommit: m[2], atDate: m[3], reason: m[4] };
}

export function parseCodeDrift(content: string): {
  entries: CodeDriftEntry[];
  baseline: QueueBaseline;
} {
  const baseline = parseBaseline(content);
  const { blocks } = splitHeaderAndBlocks(content);
  const entries: CodeDriftEntry[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^## (.+)/);
    const kbTarget = headingMatch ? headingMatch[1].trim() : null;
    if (!kbTarget) continue;

    const hasShared = /\*\*Shared module:\*\*\s*true/.test(block);
    const codeFiles: FileRef[] = [];
    for (const line of block.split("\n")) {
      const m = line.match(FILE_LINE_RE);
      if (!m) continue;
      const f: FileRef = {
        path: m[1],
        sinceCommit: m[3],
        sinceDate: m[4],
      };
      if (m[2]) f.renamedFrom = m[2];
      if (m[5]) {
        f.latestCommit = m[5];
        f.latestDate = m[6];
      }
      if (m[7]) f.author = m[7];
      codeFiles.push(f);
    }

    const entry: CodeDriftEntry = { kind: "code-drift", kbTarget, codeFiles, hasShared };
    const ack = parseAck(block);
    if (ack) entry.acknowledgement = ack;
    entries.push(entry);
  }

  return { entries, baseline };
}

export function readCodeDrift(kbRoot: string): {
  entries: CodeDriftEntry[];
  baseline: QueueBaseline;
} {
  const file = kbSyncPath(kbRoot, "code-drift.md");
  if (!fs.existsSync(file)) return { entries: [], baseline: { sha: null } };
  return parseCodeDrift(fs.readFileSync(file, "utf8"));
}
