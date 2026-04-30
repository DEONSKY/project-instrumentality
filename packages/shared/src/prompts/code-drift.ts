import type { CodeDriftEntry } from "../types.js";

export function codeDriftPrompt(entry: CodeDriftEntry): string {
  const fileLines = entry.codeFiles
    .map((f) => {
      const renamed = f.renamedFrom ? ` (renamed from \`${f.renamedFrom}\`)` : "";
      const since = f.sinceCommit ? ` since \`${f.sinceCommit}\`` : "";
      const latest =
        f.latestCommit && f.latestCommit !== f.sinceCommit
          ? `, latest \`${f.latestCommit}\``
          : "";
      return `- \`${f.path}\`${renamed}${since}${latest}`;
    })
    .join("\n");

  const sharedNote = entry.hasShared
    ? "\n\nNote: at least one of these files is a shared module — make sure the KB update reflects cross-cutting impact."
    : "";

  return `Code drift: KB target \`${entry.kbTarget}\` is out of sync.

The following code files changed without a matching KB update:

${fileLines}${sharedNote}

Please use the \`kb_drift\` tool to inspect the drift, decide whether the KB target needs updating, and resolve the entry. If the KB needs an update, draft it; if the code change is intentional and the KB already covers it, dismiss the entry with a reason.`;
}
