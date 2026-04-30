import * as fs from "node:fs";
import type { PromotionEntry } from "../types.js";
import { splitHeaderAndBlocks } from "./baseline.js";
import { kbSyncPath } from "../kb-root.js";

const FILE_LINE_RE =
  /^\s+-\s+`([^`]+)`\s+—\s+promoted\s+`([^`]+)`(?:,\s+note:\s+"((?:[^"\\]|\\.)*)")?/;

export function parsePromotions(content: string): PromotionEntry[] {
  const { blocks } = splitHeaderAndBlocks(content);
  const entries: PromotionEntry[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^## (.+)/);
    const queueKey = headingMatch ? headingMatch[1].trim() : null;
    if (!queueKey) continue;

    const stdMatch = block.match(
      /\*\*Standard:\*\*\s*`([^`]+)`(?:\s*\(([^)]+)\))?/
    );
    const ruleMatch = block.match(/\*\*Rule:\*\*\s*`([^`]+)`\s*—\s*(\w+)/);
    const fpMatch = block.match(/\*\*Rule fingerprint:\*\*\s*`([^`]+)`/);

    const files: PromotionEntry["files"] = [];
    let inFiles = false;
    for (const line of block.split("\n")) {
      if (/^- \*\*Files:\*\*/.test(line)) {
        inFiles = true;
        continue;
      }
      if (/^- \*\*/.test(line)) {
        inFiles = false;
        continue;
      }
      if (!inFiles) continue;
      const m = line.match(FILE_LINE_RE);
      if (!m) continue;
      const f: PromotionEntry["files"][number] = {
        path: m[1],
        promotedAt: m[2],
      };
      if (m[3]) f.note = m[3].replace(/\\"/g, '"');
      files.push(f);
    }

    const [defaultStd, defaultRule] = queueKey.split(".");
    entries.push({
      queueKey,
      standardId: stdMatch ? stdMatch[1] : defaultStd ?? null,
      standardKind: stdMatch ? stdMatch[2] || null : null,
      ruleId: ruleMatch ? ruleMatch[1] : defaultRule ?? null,
      severity: ruleMatch ? ruleMatch[2] : null,
      ruleFingerprint: fpMatch ? fpMatch[1] : null,
      files,
    });
  }

  return entries;
}

export function readPromotions(kbRoot: string): PromotionEntry[] {
  const file = kbSyncPath(kbRoot, "standards-promotions.md");
  if (!fs.existsSync(file)) return [];
  return parsePromotions(fs.readFileSync(file, "utf8"));
}
