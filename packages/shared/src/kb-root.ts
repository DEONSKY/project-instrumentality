import * as fs from "node:fs";
import * as path from "node:path";

// Any of these inside `knowledge/` marks the repo as a kb-mcp consumer.
// `_mcp/server.js` matches the source repo (project-instrumentality);
// `sync/`, `_rules.md`, `_index.yaml` match consumer repos that only have
// the KB content, not the MCP source.
const KB_INDICATORS: string[][] = [
  ["knowledge", "_mcp", "server.js"],
  ["knowledge", "sync"],
  ["knowledge", "_rules.md"],
  ["knowledge", "_index.yaml"],
];

function isKbRoot(dir: string): boolean {
  for (const segs of KB_INDICATORS) {
    if (fs.existsSync(path.join(dir, ...segs))) return true;
  }
  return false;
}

/**
 * Walk up from each candidate path looking for any of the KB indicators
 * inside a `knowledge/` directory. Returns the parent of `knowledge/`
 * (i.e. the repo root) so callers can pass it to subprocesses as `cwd`.
 * Returns null if none found.
 */
export function findKbRoot(startPaths: string[]): string | null {
  for (const start of startPaths) {
    let dir = path.resolve(start);
    while (true) {
      if (isKbRoot(dir)) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export function kbSyncPath(kbRoot: string, ...segments: string[]): string {
  return path.join(kbRoot, "knowledge", "sync", ...segments);
}
