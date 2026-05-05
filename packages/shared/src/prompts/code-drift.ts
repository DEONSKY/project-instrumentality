import type { CodeDriftEntry } from "../types.js";

export function codeDriftPrompt(entry: CodeDriftEntry): string {
  const files = entry.codeFiles.map((f) => `\`${f.path}\``).join(", ");
  const sharedSuffix = entry.hasShared ? ", shared module" : "";
  return `Resolve code drift for \`${entry.kbTarget}\` via kb_drift.
Files: ${files}${sharedSuffix}`;
}
