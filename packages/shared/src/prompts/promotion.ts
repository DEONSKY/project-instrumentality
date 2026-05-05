import type { PromotionEntry } from "../types.js";

export function promotionPrompt(entry: PromotionEntry): string {
  const files = entry.files
    .map((f) => `\`${f.path}\` (promoted ${f.promotedAt})`)
    .join(", ");
  return `Review promotion \`${entry.queueKey}\` via kb_conform.
Files: ${files}`;
}
