import type { ClosedPromotionVerdict } from "../../types.js";

// Senior-reviewer close-out: the standard stays as-is, but the listed files
// get a permanent exception via rule.exceptions[]. Same writeback path as
// the `exempted` verdict on standards-drift.

export function closedPromotionPrompt(v: ClosedPromotionVerdict): string {
  const files = v.filePaths.map((p) => `"${p}"`).join(", ");
  const reason = v.reason.replace(/"/g, '\\"');
  return `Close the promotion for \`${v.queueKey}\` — the rule is correct; these files are the exception. Please run:

kb_conform({
  closed_promotion: [{
    queue_key: "${v.queueKey}",
    file_paths: [${files}],
    reason: "${reason}"
  }]
})

This removes the suppression entry from the ledger and writes an exception into the rule so the files are permanently exempt.`;
}

// Re-run Phase 1 — wired to the stale-baseline banner. Not strictly a
// promotion verdict but lives here because it's a sibling MCP-call generator
// that the same banner UI needs.
export function rerunPhase1Prompt(mode: "current" | "aspirational" = "current"): string {
  if (mode === "aspirational") {
    return `The pending aspirational session is stale (the recorded baseline doesn't match HEAD). Please re-run Phase 1 detection:

kb_conform({ mode: "aspirational" })`;
  }
  return `The pending session is stale (the recorded baseline doesn't match HEAD). Please re-run Phase 1 detection:

kb_conform()`;
}
