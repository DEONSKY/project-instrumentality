import type { LintViolation } from "../types.js";

export function lintPrompt(entry: LintViolation): string {
  return `Fix lint ${entry.severity} in \`${entry.file}\`: ${entry.message}`;
}
