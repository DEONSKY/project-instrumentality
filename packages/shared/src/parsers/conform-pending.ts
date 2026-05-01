import * as fs from "node:fs";
import * as path from "node:path";
import type { ConformPending } from "../types.js";
import { kbSyncPath } from "../kb-root.js";

const STANDARD_GROUPS = ["code", "contracts", "knowledge", "process"] as const;

export function parseConformPending(content: string): ConformPending | null {
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== "object") return null;
    if (data.mode !== "current" && data.mode !== "aspirational") return null;
    return {
      mode: data.mode,
      scope: data.scope ?? null,
      requested: Array.isArray(data.requested) ? data.requested : [],
      head_sha_short: typeof data.head_sha_short === "string" ? data.head_sha_short : "",
      head_date: typeof data.head_date === "string" ? data.head_date : "",
    };
  } catch {
    return null;
  }
}

export function readConformPending(
  kbRoot: string,
  mode: "current" | "aspirational"
): ConformPending | null {
  const file = kbSyncPath(kbRoot, ".conform-pending", `${mode}.json`);
  if (!fs.existsSync(file)) return null;
  return parseConformPending(fs.readFileSync(file, "utf8"));
}

export function conformPendingDir(kbRoot: string): string {
  return path.join(kbSyncPath(kbRoot, ".conform-pending"));
}

/**
 * Resolve a standard ID to its definition file path. Standards live in
 * `knowledge/standards/<group>/<id>.md` where group is one of
 * `code | contracts | knowledge | process`. Returns the absolute path of
 * the first match, or null if none of the four group folders contain it.
 */
export function resolveStandardPath(
  kbRoot: string,
  standardId: string
): string | null {
  if (!standardId) return null;
  const standardsDir = path.join(kbRoot, "knowledge", "standards");
  for (const group of STANDARD_GROUPS) {
    const candidate = path.join(standardsDir, group, `${standardId}.md`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
