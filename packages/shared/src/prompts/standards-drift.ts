import type { StandardsDriftEntry } from "../types.js";

export function standardsDriftPrompt(entry: StandardsDriftEntry): string {
  const partyKeys = Object.keys(entry.filesByParty);
  let filesBlock: string;
  if (partyKeys.length === 0) {
    filesBlock = "_(no files recorded)_";
  } else if (partyKeys.length === 1 && partyKeys[0] === "_") {
    filesBlock = entry.filesByParty["_"]
      .map((f) => `- \`${f.path}\``)
      .join("\n");
  } else {
    filesBlock = partyKeys
      .sort()
      .map((party) => {
        const label = party === "_" ? "Files" : `Files (party: ${party})`;
        const lines = entry.filesByParty[party]
          .map((f) => `  - \`${f.path}\``)
          .join("\n");
        return `**${label}:**\n${lines}`;
      })
      .join("\n\n");
  }

  const reason = entry.reason ? `\n\nReason recorded: ${entry.reason}` : "";
  const stdLine = `\`${entry.standardId}\`${entry.standardKind ? ` (${entry.standardKind})` : ""}`;
  const ruleLine = `\`${entry.ruleId}\` — ${entry.severity ?? "warn"}`;

  return `Standards drift: rule \`${entry.queueKey}\` is failing.

- Standard: ${stdLine}
- Rule: ${ruleLine}

Affected files:

${filesBlock}${reason}

Please use \`kb_conform\` to resolve this entry. Pick one of:

- \`applied\` — code was fixed to satisfy the rule
- \`exempted\` — write an exception into the rule for these files
- \`promoted\` — escalate to senior review (suppresses re-detection until the rule changes)
- \`dismissed\` — false positive`;
}
