import type { PromotionEntry } from "../types.js";

export function promotionPrompt(entry: PromotionEntry): string {
  const fileLines = entry.files
    .map((f) => {
      const note = f.note ? ` — note: "${f.note}"` : "";
      return `- \`${f.path}\` (promoted ${f.promotedAt})${note}`;
    })
    .join("\n");

  return `Pending promotion: \`${entry.queueKey}\` is awaiting senior review.

- Standard: \`${entry.standardId}\`${entry.standardKind ? ` (${entry.standardKind})` : ""}
- Rule: \`${entry.ruleId}\` — ${entry.severity ?? "warn"}

Promoted files:

${fileLines}

A senior reviewer should decide whether to update the rule itself or close the promotion. Use \`kb_conform\` with \`closed_promotion: [...]\` to close (writes an exception to the rule and removes the entry); update the rule definition directly to auto-close on fingerprint mismatch.`;
}
