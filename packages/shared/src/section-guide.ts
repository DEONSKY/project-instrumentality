/**
 * Single source of truth for how each entry kind is presented to the user:
 *
 * - `label`     — section/heading title
 * - `what`      — one-line "what this entry represents"
 * - `todo`      — verb-led "what to do next"
 * - `primaryVerb` — used for the main action button
 *                   ("Resolve" → "Resolve via Agent" / "Copy Resolve Prompt")
 * - `lifecycleDiagram` — ASCII diagram surfaced in the first-run education
 *                        banner per section. Authored to match the
 *                        kb-mcp control flow described in the README.
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
  | "lint"
  | "mapping-diagnostics";

export interface SectionGuide {
  label: string;
  what: string;
  todo: string;
  primaryVerb: string;
  lifecycleDiagram: string;
  /**
   * Short blurb rendered above the per-section "Uncommitted preview" sub-group
   * so the author understands those entries are local-only until they publish.
   * Optional — sections that have no preview (e.g. conform-pending) omit it.
   */
  uncommittedHint?: string;
}

const CODE_DRIFT_DIAGRAM = `git push / post-merge hook
        │
        ▼
  code-drift.md entry
        │
        ▼
  Resolve via Agent
        │
   ┌────┴─────┬─────────┐
   ▼          ▼         ▼
 Update KB  Revert   Dismiss
(summaries) (reverted) (ghost)
   │          │         │
   └──────────┴─────────┴──→ drift-log/`;

const KB_DRIFT_DIAGRAM = `KB file edited → push hook
        │
        ▼
  kb-drift.md entry
        │
        ▼
  Resolve via Agent
  (reads diff, verifies code)
        │
   ┌────┴─────┐
   ▼          ▼
 Code      Dismiss
 confirmed (ghost)
   │          │
   └──────────┴──→ drift-log/`;

const STANDARDS_DRIFT_DIAGRAM = `kb_conform Phase 1 (preFilter)
        │
        ▼
   Phase 1.5 (judge)
        │
        ▼
  standards-drift.md entry
        │
   ┌────┴────┬────────┬─────────┬──────────┐
   ▼         ▼        ▼         ▼          ▼
 Apply    Exempt   Promote   Dismiss   Resolve via Agent
 (fix)  (rule.    (ledger    (false     (agent
        excep-     suppress) positive)  judges)
        tions[])
   │         │        │         │          │
   └─────────┴────────┴─────────┴──────────┴──→ drift-log/`;

const CONFORM_PENDING_DIAGRAM = `Phase 1 detect
        │
        ▼
  .conform-pending/<mode>.json
        │
        ▼
  Resolve via Agent
  (reads each triple,
   submits one judgment call)
        │
   ┌────┴────┬───────┐
   ▼         ▼       ▼
 pass     fail     n/a
 (skip)  (queues  (skip)
         drift)
        │
        └──→ standards-drift.md
             (now in normal verdict flow)`;

const PROMOTIONS_DIAGRAM = `previously-promoted (file, rule)
        │
        ▼
  standards-promotions.md
  (the suppression ledger)
        │
        │  fingerprint: sha256:abc1234
        │  suppresses (file, rule) in
        │  Phase 1 sweeps until either:
        │
   ┌────┴─────────────┐
   ▼                  ▼
 rule edited?     Close promotion
 fingerprint      (writes
 mismatches       exception
 (auto-close)     into rule)
        │                  │
        └──────────┬───────┘
                   ▼
              drift-log/`;

const LINT_DIAGRAM = `KB file change
        │
        ▼
  kb_lint scan
        │
        ▼
  schema-level violation
  (frontmatter / structure)
        │
        ▼
  Fix in source file
  (or pass force_lint to bypass once)`;

const MAPPING_DIAGNOSTICS_DIAGRAM = `_rules.md code_path_patterns
        │
        ▼
  audit (kb_drift readonly)
        │
        ▼
  finding (orphan / ghost /
   multi-target / convention /
   unmapped folder / fanout)
        │
        ▼
  Agent edits _rules.md
   (Tier 2 — humans/agent)`;

export const SECTION_GUIDE: Record<SectionKind, SectionGuide> = {
  "code-drift": {
    label: "Code Drift",
    what: "Code changed since the last KB sync.",
    todo: "Update the KB to reflect the change — or acknowledge if the change doesn't affect the KB.",
    primaryVerb: "Update",
    lifecycleDiagram: CODE_DRIFT_DIAGRAM,
    uncommittedHint:
      "Code edits in your working tree that would drift the KB. Publish to share with reviewers.",
  },
  "kb-drift": {
    label: "KB Drift",
    what: "KB content changed but the mapped code wasn't touched.",
    todo: "Verify the code still matches, revise the KB, or acknowledge if benign.",
    primaryVerb: "Update",
    lifecycleDiagram: KB_DRIFT_DIAGRAM,
    uncommittedHint:
      "KB edits in your working tree without a matching code touch. Publish to share with reviewers.",
  },
  "standards-drift": {
    label: "Standards Drift",
    what: "Code that broke a standard's rule.",
    todo: "Resolve via kb_conform: apply, exempt, promote, dismiss, or acknowledge.",
    primaryVerb: "Resolve",
    lifecycleDiagram: STANDARDS_DRIFT_DIAGRAM,
    uncommittedHint:
      "Standards violations from edits in your working tree. Publish to share with reviewers.",
  },
  "conform-pending": {
    label: "Conform Pending",
    what: "Standards rules waiting for your judgment.",
    todo: "Submit your judgment for these rules.",
    primaryVerb: "Submit",
    lifecycleDiagram: CONFORM_PENDING_DIAGRAM,
  },
  promotions: {
    label: "Pending Promotions",
    what: "Violations promoted on a previous run — the rule probably needs tightening.",
    todo: "Review the promotion: refine the rule, accept, or dismiss.",
    primaryVerb: "Review",
    lifecycleDiagram: PROMOTIONS_DIAGRAM,
  },
  lint: {
    label: "Lint Issues",
    what: "Schema-level problems in the KB itself.",
    todo: "Fix the lint issue in the source file.",
    primaryVerb: "Fix",
    lifecycleDiagram: LINT_DIAGRAM,
  },
  "mapping-diagnostics": {
    label: "Mapping Diagnostics",
    what: "code_path_patterns vs current filesystem — orphan paths, ghost targets, multi-target files, convention violations, unmapped KB folders.",
    todo: "Edit knowledge/_rules.md to fix the flagged patterns; rerun kb_drift to verify.",
    primaryVerb: "Fix",
    lifecycleDiagram: MAPPING_DIAGNOSTICS_DIAGRAM,
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
