import * as fs from "node:fs";
import * as yaml from "js-yaml";
import type {
  StandardDefinition,
  StandardRule,
} from "../types.js";
import { resolveStandardPath } from "./conform-pending.js";

interface CacheEntry {
  mtimeMs: number;
  def: StandardDefinition | null;
}
const cache = new Map<string, CacheEntry>();

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function coerceSeverity(s: unknown): StandardRule["severity"] {
  if (s === "error" || s === "warn" || s === "info") return s;
  return null;
}

function coerceString(s: unknown): string | null {
  if (typeof s === "string" && s.length > 0) return s;
  return null;
}

function coerceArray(s: unknown): unknown[] | null {
  if (Array.isArray(s) && s.length > 0) return s;
  return null;
}

function parseRules(rawRules: unknown): StandardRule[] {
  if (!Array.isArray(rawRules)) return [];
  const out: StandardRule[] = [];
  for (const r of rawRules) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = coerceString(rec.id);
    if (!id) continue;
    out.push({
      id,
      title: coerceString(rec.title),
      severity: coerceSeverity(rec.severity),
      description: coerceString(rec.description),
      why: coerceString(rec.why),
      fixHint: coerceString(rec.fix_hint),
      examples: coerceArray(rec.examples),
      exceptions: coerceArray(rec.exceptions),
    });
  }
  return out;
}

export function parseStandardDefinition(
  content: string,
  filePath: string
): StandardDefinition | null {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return null;
  let data: unknown;
  try {
    data = yaml.load(m[1]);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (rec.type !== "standard") return null;
  const id = coerceString(rec.id);
  if (!id) return null;
  return {
    id,
    kind: coerceString(rec.kind),
    appScope: coerceString(rec.app_scope),
    topic: coerceString(rec.topic),
    tags: Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === "string") : [],
    rules: parseRules(rec.rules),
    filePath,
  };
}

export function readStandardDefinition(
  kbRoot: string,
  standardId: string
): StandardDefinition | null {
  if (!standardId) return null;
  const filePath = resolveStandardPath(kbRoot, standardId);
  if (!filePath) return null;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.def;

  let def: StandardDefinition | null;
  try {
    def = parseStandardDefinition(fs.readFileSync(filePath, "utf8"), filePath);
  } catch {
    def = null;
  }
  cache.set(filePath, { mtimeMs: stat.mtimeMs, def });
  return def;
}

export function findRule(
  def: StandardDefinition | null,
  ruleId: string | null
): StandardRule | null {
  if (!def || !ruleId) return null;
  return def.rules.find((r) => r.id === ruleId) ?? null;
}

/**
 * Locate the line range of a rule inside a standard YAML file. Used to
 * position the cursor when "Edit Rule" is invoked. Scans the raw file for
 * the line `- id: <ruleId>` (with surrounding indentation) inside the
 * `rules:` block. Returns 0-indexed lines or null if not found.
 *
 * `end` is best-effort: it points at the line just before the next
 * `- id:` entry or end-of-frontmatter (`---`).
 */
export function findRuleLineRange(
  filePath: string,
  ruleId: string
): { start: number; end: number } | null {
  if (!ruleId) return null;
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);

  // Find the `rules:` key (not nested) inside the frontmatter.
  let inFrontmatter = false;
  let frontmatterEnd = -1;
  let rulesStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line.trim() === "---") {
      frontmatterEnd = i;
      break;
    }
    if (inFrontmatter && /^rules:\s*$/.test(line)) {
      rulesStart = i;
    }
  }
  if (rulesStart < 0) return null;
  const scanEnd = frontmatterEnd > 0 ? frontmatterEnd : lines.length;

  // Within rules:, find `  - id: <ruleId>`.
  const target = new RegExp(`^\\s+-\\s+id:\\s+${escapeRegex(ruleId)}\\s*$`);
  let start = -1;
  let end = scanEnd - 1;
  for (let i = rulesStart + 1; i < scanEnd; i++) {
    if (target.test(lines[i])) {
      start = i;
      // walk forward to next sibling `- id:` or scan end
      for (let j = i + 1; j < scanEnd; j++) {
        if (/^\s+-\s+id:\s+/.test(lines[j])) {
          end = j - 1;
          return { start, end };
        }
      }
      end = scanEnd - 1;
      return { start, end };
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Test-only: clear the mtime cache. */
export function _clearStandardsCache(): void {
  cache.clear();
}
