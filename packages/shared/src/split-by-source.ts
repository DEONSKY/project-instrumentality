import type { DriftSource } from "./types.js";

/**
 * Label rendered above the per-section preview group — entries the author has
 * not yet published. Surfaced in both the VS Code sidebar/dashboard and the
 * Obsidian view so wording stays in lockstep.
 */
export const UNCOMMITTED_LABEL = "Uncommitted preview";

/**
 * Label for the published sub-group — entries that live in `knowledge/sync/*.md`
 * and are visible to reviewers downstream.
 */
export const PUBLISHED_LABEL = "Published";

/**
 * Stand-in displayed in the "Latest" column for a file whose most recent
 * touch is uncommitted. Replaces the SHA chip you'd see for a committed file.
 */
export const WORKING_TREE_LATEST = "working tree";

/**
 * Short hint shown next to the preview sub-group header so the author
 * understands the entries are local-only until they hit Publish.
 */
export const UNCOMMITTED_HINT =
  "Your in-progress edits — not yet shared with reviewers.";

/**
 * Split a list of drift-like entries into uncommitted and published buckets.
 * Treats absent `source` as "committed" for back-compat with consumers and
 * parsers that don't set the field.
 *
 * Preserves relative order within each bucket so existing sort logic upstream
 * stays meaningful.
 */
export function splitBySource<T extends { source?: DriftSource }>(
  entries: readonly T[]
): { uncommitted: T[]; published: T[] } {
  const uncommitted: T[] = [];
  const published: T[] = [];
  for (const entry of entries) {
    if (entry.source === "working-tree") uncommitted.push(entry);
    else published.push(entry);
  }
  return { uncommitted, published };
}
