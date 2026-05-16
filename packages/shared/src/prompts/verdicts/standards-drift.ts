import type {
  AcknowledgedVerdict,
  AppliedVerdict,
  ExemptedVerdict,
  PromotedVerdict,
  DismissedVerdict,
} from "../../types.js";

// All four standards-drift verdict prompts target a single MCP call. The
// prompt explicitly tells the agent to run the call rather than re-judge —
// the user has already made the decision via the verdict picker.

export function appliedPrompt(v: AppliedVerdict): string {
  return `The code for \`${v.queueKey}\` was fixed. Please run:

kb_conform({ applied: [{ queue_key: "${v.queueKey}" }] })`;
}

export function exemptedPrompt(v: ExemptedVerdict): string {
  const files = v.filePaths.map((p) => `"${p}"`).join(", ");
  const reason = v.reason.replace(/"/g, '\\"');
  return `Exempt \`${v.queueKey}\` for the listed files. Please run:

kb_conform({
  exempted: [{
    queue_key: "${v.queueKey}",
    file_paths: [${files}],
    reason: "${reason}"
  }]
})

This appends an exception entry to the rule definition so future Phase 1 sweeps skip these files.`;
}

export function promotedPrompt(v: PromotedVerdict): string {
  const files = v.originatingFiles.map((p) => `"${p}"`).join(", ");
  const note = v.note ? `,\n    note: "${v.note.replace(/"/g, '\\"')}"` : "";
  return `Promote \`${v.queueKey}\` — the code is correct; the standard should change. Please run:

kb_conform({
  promoted: [{
    queue_key: "${v.queueKey}",
    originating_files: [${files}]${note}
  }]
})

The (file, rule) pair will be suppressed from re-detection until the rule definition changes (auto-close on fingerprint mismatch) or a senior reviewer calls closed_promotion.`;
}

export function dismissedPrompt(v: DismissedVerdict): string {
  const reason = v.reason.replace(/"/g, '\\"');
  return `Dismiss \`${v.queueKey}\` as a false positive. Please run:

kb_conform({
  dismissed: [{
    queue_key: "${v.queueKey}",
    reason: "${reason}"
  }]
})`;
}

// Acknowledge — soft, non-resolving annotation. Routes to kb_drift for
// code/kb-drift entries (keyed by kbTarget/kbFile) and kb_conform for
// standards-drift (keyed by queueKey). The entry stays in the queue with an
// `**Acknowledged**: …` marker; a later resolving verdict still overrides.
export function acknowledgedPrompt(v: AcknowledgedVerdict): string {
  const reason = v.reason.replace(/"/g, '\\"');
  if (v.kind === "standards-drift") {
    return `Acknowledge \`${v.entryKey}\` — author-vetted, leave in queue for review. Please run:

kb_conform({
  acknowledge: [{
    queue_key: "${v.entryKey}",
    reason: "${reason}"
  }]
})`;
  }
  const keyField = v.kind === "code-drift" ? "kb_target" : "kb_file";
  return `Acknowledge \`${v.entryKey}\` — author-vetted, leave in queue for review. Please run:

kb_drift({
  acknowledge: [{
    ${keyField}: "${v.entryKey}",
    reason: "${reason}"
  }]
})`;
}
