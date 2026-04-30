import type { ConformPending } from "../types.js";

export function conformPrompt(entry: ConformPending): string {
  const scopeLine = entry.scope ? `\n- Scope: \`${entry.scope}\`` : "";
  const reqLines = entry.requested
    .map(
      (r) =>
        `- \`${r.file}\` against \`${r.standard_id}\` (rules: ${r.rule_ids.map((x) => `\`${x}\``).join(", ")})`
    )
    .join("\n");
  const reqBlock = reqLines.length > 0 ? reqLines : "_(no pending evaluations)_";

  return `Conform pending (mode: ${entry.mode}) at baseline \`${entry.head_sha_short}\` (${entry.head_date}).${scopeLine}

The agent owes back judgments for these (file, standard, rule) triples:

${reqBlock}

Please call \`kb_conform\` with \`submit_judgments\` covering ALL of the requested triples in a single call (the tool validates completeness). For each triple, pick \`pass\`, \`fail\`, or \`n/a\` and supply a short reason for fails.`;
}
