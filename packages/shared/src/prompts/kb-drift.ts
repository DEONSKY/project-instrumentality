import type { KbDriftEntry } from "../types.js";

export function kbDriftPrompt(entry: KbDriftEntry): string {
  const renamed = entry.renamedFrom
    ? `\n\nNote: this KB file was renamed from \`${entry.renamedFrom}\`.`
    : "";

  const codeAreas =
    entry.codeAreas.length > 0
      ? entry.codeAreas.map((p) => `- \`${p}\``).join("\n")
      : "- _(no mapped code paths — the KB has no `code_path_patterns` for this file)_";

  const refs =
    entry.refCount && entry.refCount.count > 0
      ? `\n\n${entry.refCount.count} other KB file(s) reference this one via \`[[${entry.refCount.anchor}]]\`. They may need updating too.`
      : "";

  const since = entry.sinceCommit ? `\n\nDrift baseline: \`${entry.sinceCommit}\`` : "";
  const unmapped = entry.unmapped
    ? "\n\nWarning: KB spec changed but no code paths are mapped to it — verify the implementation manually, then add `code_path_patterns` in `_rules.md` to enable future automatic tracking."
    : "";

  return `KB drift: \`${entry.kbFile}\` was edited; code may be stale.${renamed}

Code areas to review:

${codeAreas}${refs}${since}${unmapped}

Please use \`kb_drift\` to inspect the entry. Decide whether the implementation needs to catch up to the new KB spec. If yes, draft the code change; if no, dismiss with a reason.`;
}
