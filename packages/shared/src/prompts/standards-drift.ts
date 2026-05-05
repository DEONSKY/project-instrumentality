import type { StandardsDriftEntry } from "../types.js";

export function standardsDriftPrompt(entry: StandardsDriftEntry): string {
  const partyKeys = Object.keys(entry.filesByParty);
  let filesLine: string;
  if (partyKeys.length === 0) {
    filesLine = "(none)";
  } else if (partyKeys.length === 1 && partyKeys[0] === "_") {
    filesLine = entry.filesByParty["_"].map((f) => `\`${f.path}\``).join(", ");
  } else {
    filesLine = partyKeys
      .sort()
      .map((party) => {
        const label = party === "_" ? "files" : party;
        const paths = entry.filesByParty[party].map((f) => `\`${f.path}\``).join(", ");
        return `${label}: ${paths}`;
      })
      .join("; ");
  }
  const reason = entry.reason ? `\nReason: ${entry.reason}` : "";
  return `Resolve \`${entry.queueKey}\` via kb_conform.
Files: ${filesLine}${reason}`;
}
