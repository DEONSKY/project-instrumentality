import type { LintViolation } from "../types.js";

export function lintPrompt(entry: LintViolation): string {
  return `Lint ${entry.severity}: \`${entry.file}\`

> ${entry.message}

Please open the file, fix the issue, and re-run lint. Common fixes: add the missing front-matter field, resolve the wikilink target, remove the conflict markers, or move misplaced fields to \`_index.yaml\`.`;
}
