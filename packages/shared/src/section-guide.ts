/**
 * Single source of truth for how each entry kind is presented to the user:
 *
 * - `label`     — section/heading title
 * - `what`      — one-line "what this entry represents"
 * - `todo`      — verb-led "what to do next"
 * - `primaryVerb` — used for the main action button
 *                   ("Resolve" → "Resolve via Agent" / "Copy Resolve Prompt")
 *
 * Used by the VSCode dashboard, Details side view, tree provider tooltips,
 * and the Obsidian view, so wording stays consistent and changes are
 * one-place edits.
 */

export type SectionKind =
  | "code-drift"
  | "kb-drift"
  | "standards-drift"
  | "conform-pending"
  | "promotions"
  | "lint";

export interface SectionGuide {
  label: string;
  what: string;
  todo: string;
  primaryVerb: string;
}

export const SECTION_GUIDE: Record<SectionKind, SectionGuide> = {
  "code-drift": {
    label: "Code Drift",
    what: "Code changed since the last KB sync.",
    todo: "Update the KB to reflect the change.",
    primaryVerb: "Update",
  },
  "kb-drift": {
    label: "KB Drift",
    what: "KB content changed but the mapped code wasn't touched.",
    todo: "Verify the code still matches, or revise the KB.",
    primaryVerb: "Update",
  },
  "standards-drift": {
    label: "Standards Drift",
    what: "Code that broke a standard's rule.",
    todo: "Resolve via kb_conform: apply, exempt, promote, or dismiss.",
    primaryVerb: "Resolve",
  },
  "conform-pending": {
    label: "Conform Pending",
    what: "Standards rules waiting for your judgment.",
    todo: "Submit your judgment for these rules.",
    primaryVerb: "Submit",
  },
  promotions: {
    label: "Pending Promotions",
    what: "Violations promoted on a previous run — the rule probably needs tightening.",
    todo: "Review the promotion: refine the rule, accept, or dismiss.",
    primaryVerb: "Review",
  },
  lint: {
    label: "Lint Issues",
    what: "Schema-level problems in the KB itself.",
    todo: "Fix the lint issue in the source file.",
    primaryVerb: "Fix",
  },
};

/** "Resolve via Agent" / "Update via Agent" / etc. */
export function primaryActionLabel(section: SectionKind): string {
  return `${SECTION_GUIDE[section].primaryVerb} via Agent`;
}

/** "Copy Resolve Prompt" / "Copy Update Prompt" / etc. */
export function copyActionLabel(section: SectionKind): string {
  return `Copy ${SECTION_GUIDE[section].primaryVerb} Prompt`;
}
