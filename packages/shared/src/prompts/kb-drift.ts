import type { KbDriftEntry } from "../types.js";

export function kbDriftPrompt(entry: KbDriftEntry): string {
  const areas = entry.unmapped
    ? "(unmapped — verify manually)"
    : entry.codeAreas.map((a) => `\`${a}\``).join(", ");
  const since = entry.sinceCommit ? `\nSince: \`${entry.sinceCommit}\`` : "";
  return `Resolve KB drift for \`${entry.kbFile}\` via kb_drift.
Code areas: ${areas}${since}`;
}
