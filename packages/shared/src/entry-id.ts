/**
 * Stable IDs identify a single entry across surfaces (tree view, dashboard
 * webview, future Obsidian plugin) so they can highlight the same row when
 * the user navigates from one to the other.
 *
 * The seed is the entry's natural key (kbTarget, kbFile, queueKey, etc.).
 * The fallback index is used when the seed is empty. The same seed always
 * produces the same id; consumers MUST agree on the seed for each entry kind.
 */
export function stableEntryId(seed: string, fallbackIndex: number): string {
  const safe = (seed || "").replace(/[^a-zA-Z0-9_.\-/:@]/g, "_").slice(0, 120);
  return safe || `idx${fallbackIndex}`;
}
