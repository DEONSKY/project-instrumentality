import type { StandardsDriftEntry } from "../types.js";

export type StandardAuthorMode = "refine" | "exception" | "example";

export function standardAuthorPrompt(
  entry: StandardsDriftEntry,
  mode: StandardAuthorMode
): string {
  const files = Object.values(entry.filesByParty)
    .flat()
    .map((f) => `\`${f.path}\``)
    .join(", ");
  const filesLine = files.length > 0 ? files : "(no files recorded)";

  const standardId = entry.standardId ?? "?";
  const ruleId = entry.ruleId ?? "?";
  const stdPath = entry.resolvedStandard?.filePath
    ? ` (\`${entry.resolvedStandard.filePath}\`)`
    : "";

  const rule = entry.resolvedRule;
  const ruleBlock = rule
    ? [
        `Existing rule:`,
        `- title: ${rule.title ?? "(missing)"}`,
        `- severity: ${rule.severity ?? "(missing)"}`,
        `- description: ${rule.description ?? "(missing)"}`,
        `- why: ${rule.why ?? "(missing)"}`,
        `- fix_hint: ${rule.fixHint ?? "(missing)"}`,
      ].join("\n")
    : "Existing rule: not resolvable from this workspace — load it from the standard file.";

  const reasonLine = entry.reason ? `\nDrift reason: ${entry.reason}` : "";

  if (mode === "exception") {
    return `Author a new \`exceptions\` entry for rule \`${ruleId}\` in standard \`${standardId}\`${stdPath}.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Inspect the listed files and identify the legitimate pattern that should be exempted (do not weaken the rule for non-legitimate cases).
2. Append a structured \`exceptions\` entry under the rule with: \`pattern\` (path glob or matcher), \`reason\` (why this case is intentional), and \`reviewed\` (today's date).
3. Edit the standard YAML file in place. Keep all other rule fields untouched.`;
  }

  if (mode === "example") {
    return `Add a good/bad example pair to rule \`${ruleId}\` in standard \`${standardId}\`${stdPath}.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Read the listed files and extract a minimal \`bad\` snippet that matches the violation.
2. Author the corresponding \`good\` snippet that satisfies the rule.
3. Append both as a structured \`examples\` entry on the rule (each with \`label\`, \`code\`, and a one-line \`note\`). Edit the standard YAML in place.`;
  }

  // mode === "refine"
  return `Refine rule \`${ruleId}\` in standard \`${standardId}\`${stdPath} based on real violations.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Read the listed files and identify the precise pattern the rule should catch.
2. Rewrite the rule's \`description\`, \`why\`, and \`fix_hint\` so they (a) describe the violation in concrete terms, (b) explain the consequence, and (c) point at the fix shape. Keep wording terse.
3. Adjust \`severity\` only if the new evidence justifies it; otherwise leave it untouched.
4. Edit the standard YAML file in place. Do not touch other rules in the same file.`;
}
