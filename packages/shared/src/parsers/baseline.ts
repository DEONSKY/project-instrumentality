import type { QueueBaseline } from "../types.js";

const BASELINE_RE = /<!--\s*baseline:\s*([0-9a-f]{7,40})\s*-->/i;

export function parseBaseline(content: string): QueueBaseline {
  const m = content.match(BASELINE_RE);
  return { sha: m ? m[1] : null };
}

export function splitHeaderAndBlocks(content: string): {
  header: string;
  blocks: string[];
} {
  const headerEnd = content.indexOf("\n## ");
  const header = headerEnd === -1 ? content : content.slice(0, headerEnd);
  const entriesStr = headerEnd === -1 ? "" : content.slice(headerEnd + 1);
  const blocks = entriesStr.split(/\n(?=## )/).filter((b) => b.trim());
  return { header, blocks };
}
