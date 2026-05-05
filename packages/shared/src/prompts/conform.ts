import type { ConformPending } from "../types.js";

export function conformPrompt(entry: ConformPending): string {
  const lines = entry.requested
    .map(
      (r) =>
        `- \`${r.file}\` against \`${r.standard_id}\` (rules: ${r.rule_ids.map((x) => `\`${x}\``).join(", ")})`
    )
    .join("\n");
  const body = lines.length > 0 ? lines : "- (no pending evaluations)";
  return `Submit judgments via kb_conform (mode: ${entry.mode}, baseline \`${entry.head_sha_short}\`):
${body}`;
}
