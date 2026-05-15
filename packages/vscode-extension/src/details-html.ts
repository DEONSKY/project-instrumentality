import * as path from "node:path";
import {
  SECTION_GUIDE,
  primaryActionLabel,
  copyActionLabel,
  type CodeDriftEntry,
  type KbDriftEntry,
  type StandardsDriftEntry,
  type PromotionEntry,
  type ConformPending,
  type ConformRequest,
  type LintViolation,
  type StandardRule,
  type PromptInput,
  type SectionKind,
} from "@instrumentality/shared";

export type { SectionKind };

export interface DiffableFile {
  /** Workspace-absolute path to the file. */
  absPath: string;
  /** Workspace-relative or display label. */
  label: string;
  sinceCommit: string;
  latestCommit?: string;
}

export interface DetailDescriptor {
  section: SectionKind;
  id: string;
  /** Title shown above the detail (used by the side Details view). */
  title: string;
  /** Optional small subtitle line. */
  subtitle?: string;
  /** Severity badge label (error|warn|info), null = no badge. */
  severity: "error" | "warn" | "info" | null;
  /** Inner detail-meta HTML body. */
  metaHtml: string;
  /** Source file path (workspace-relative or absolute), if any. */
  sourceFile?: string;
  /** Standard id when the entry is tied to a standard rule. */
  standardId?: string | null;
  /** Rule id within that standard. */
  ruleId?: string | null;
  /** The full prompt; rendered inside a disclosure block. */
  prompt: string;
  /** Whether the entry references a standard rule (controls Edit/Refine buttons). */
  hasStandardRule: boolean;
  /** Files this entry covers that have git provenance — drives the Show Diff list. */
  diffableFiles: DiffableFile[];
  /** Original prompt input — kept so callers can re-derive prompt later. */
  promptInput: PromptInput;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function severityClass(sev: string | null | undefined): string {
  if (sev === "error") return "sev-error";
  if (sev === "warn") return "sev-warn";
  if (sev === "info") return "sev-info";
  return "sev-none";
}

function truncate(s: string, max = 280): string {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function ruleBlocksHtml(rules: StandardRule[] | null | undefined): string {
  if (!rules || rules.length === 0) return "";
  return rules.map((r) => ruleBlockHtml(r)).join("");
}

function ruleBlockHtml(rule: StandardRule | null | undefined): string {
  if (!rule) return "";
  const parts: string[] = [];
  if (rule.title) {
    parts.push(
      `<div class="rule-row"><span class="rule-label">Rule:</span> <span class="rule-title">${escapeHtml(
        rule.title
      )}</span></div>`
    );
  }
  if (rule.severity) {
    parts.push(
      `<div class="rule-row"><span class="rule-label">Severity:</span> <span class="badge ${severityClass(
        rule.severity
      )}">${escapeHtml(rule.severity)}</span></div>`
    );
  }
  if (rule.description) {
    parts.push(
      `<div class="rule-row"><span class="rule-label">What:</span> ${escapeHtml(
        truncate(rule.description)
      )}</div>`
    );
  }
  if (rule.why) {
    parts.push(
      `<div class="rule-row"><span class="rule-label">Why:</span> ${escapeHtml(
        truncate(rule.why)
      )}</div>`
    );
  }
  if (rule.fixHint) {
    parts.push(
      `<div class="rule-row"><span class="rule-label">Fix:</span> ${escapeHtml(
        truncate(rule.fixHint)
      )}</div>`
    );
  }
  if (rule.examples?.length) {
    parts.push(
      `<div class="rule-row rule-aside"><span class="rule-label">Examples:</span> ${rule.examples.length} attached (open the standard to view)</div>`
    );
  }
  if (rule.exceptions?.length) {
    parts.push(
      `<div class="rule-row rule-aside"><span class="rule-label">Exceptions:</span> ${rule.exceptions.length} recorded</div>`
    );
  }
  return parts.length > 0 ? `<div class="rule-block">${parts.join("")}</div>` : "";
}

export function buildCodeDriftDetail(e: CodeDriftEntry): string {
  const filesList = e.codeFiles
    .map((f) => `<li><code>${escapeHtml(f.path)}</code></li>`)
    .join("");
  const sharedNote = e.hasShared
    ? `<div class="rule-row warn-note">Shared module touched — KB update should reflect cross-cutting impact.</div>`
    : "";
  return `<div class="detail-meta">
    <div><strong>KB target:</strong> <code>${escapeHtml(e.kbTarget)}</code></div>
    ${sharedNote}
    <div><strong>Changed files:</strong><ul>${filesList}</ul></div>
  </div>`;
}

export function buildKbDriftDetail(e: KbDriftEntry): string {
  const renamed = e.renamedFrom
    ? `<div><strong>Renamed from:</strong> <code>${escapeHtml(e.renamedFrom)}</code></div>`
    : "";
  const since = e.sinceCommit
    ? `<div><strong>Since:</strong> <code>${escapeHtml(e.sinceCommit)}</code> (${escapeHtml(
        e.sinceDate ?? ""
      )})</div>`
    : "";
  const areas =
    e.codeAreas.length === 0
      ? `<em>none mapped</em>`
      : e.codeAreas.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ");
  const unmapped = e.unmapped
    ? `<div class="rule-row warn-note">Unmapped — no <code>code_path_patterns</code> for this KB file. Verify implementation manually.</div>`
    : "";
  return `<div class="detail-meta">
    ${renamed}
    ${since}
    <div><strong>Code areas:</strong> ${areas}</div>
    ${unmapped}
  </div>`;
}

export function buildStandardsDriftDetail(e: StandardsDriftEntry): string {
  const reason = e.reason
    ? `<div><strong>Drift reason:</strong> ${escapeHtml(e.reason)}</div>`
    : "";
  const stdLine = e.standardId
    ? `<div><strong>Standard:</strong> <code>${escapeHtml(e.standardId)}</code>${
        e.standardKind ? ` (${escapeHtml(e.standardKind)})` : ""
      }</div>`
    : "";
  const ruleLine = e.ruleId
    ? `<div><strong>Rule id:</strong> <code>${escapeHtml(e.ruleId)}</code></div>`
    : "";
  const partyBlocks = Object.entries(e.filesByParty)
    .map(([party, files]) => {
      const label = party === "_" ? "Files" : `Files (party: ${escapeHtml(party)})`;
      const lis = files.map((f) => `<li><code>${escapeHtml(f.path)}</code></li>`).join("");
      return `<div><strong>${label}:</strong><ul>${lis}</ul></div>`;
    })
    .join("");
  return `<div class="detail-meta">
    ${stdLine}
    ${ruleLine}
    ${ruleBlockHtml(e.resolvedRule)}
    ${reason}
    ${partyBlocks}
  </div>`;
}

export function buildPromotionDetail(e: PromotionEntry): string {
  const rule = e.ruleId
    ? `<div><strong>Rule:</strong> <code>${escapeHtml(e.ruleId)}</code></div>`
    : "";
  const filesList = e.files
    .map(
      (f) =>
        `<li><code>${escapeHtml(f.path)}</code> — promoted ${escapeHtml(f.promotedAt)}${
          f.note ? ` <em>${escapeHtml(f.note)}</em>` : ""
        }</li>`
    )
    .join("");

  // Suppression contract: makes the ledger semantics visible inline so a
  // user staring at a promoted entry knows *why* it isn't re-firing and
  // *when* it will auto-clear. The fingerprint inputs come from the writer
  // (knowledge/_mcp/lib/promotion-ledger.js#computeRuleFingerprint); we
  // surface them as a static tooltip — no live recompute.
  const earliestPromotedAt =
    e.files.length > 0
      ? e.files
          .map((f) => f.promotedAt)
          .sort()
          .at(0) ?? null
      : null;
  const fingerprintShort = e.ruleFingerprint
    ? e.ruleFingerprint.length > 22
      ? e.ruleFingerprint.slice(0, 22) + "…"
      : e.ruleFingerprint
    : "(none recorded)";
  const fingerprintTooltip =
    "Hash inputs: rule.description, rule.severity, canonicalized rule.detect, " +
    "canonicalized rule.applies_to, plus parties[].applies_to.paths for contracts. " +
    "Mismatch on next sweep → auto-close.";
  const suppressionPanel = `<div class="suppression-contract">
    <div class="sc-title">Suppression contract</div>
    <div class="sc-row"><span class="sc-label">Suppressed since:</span> ${
      earliestPromotedAt ? `<code>${escapeHtml(earliestPromotedAt)}</code>` : "<em>(no files)</em>"
    }</div>
    <div class="sc-row"><span class="sc-label">Rule fingerprint:</span> <code title="${escapeAttrLocal(
      fingerprintTooltip
    )}">${escapeHtml(fingerprintShort)}</code></div>
    <div class="sc-row"><span class="sc-label">Auto-closes if:</span> rule definition changes (fingerprint mismatch on next Phase&nbsp;1 sweep) or the standard/rule is removed.</div>
    <div class="sc-row"><span class="sc-label">Or close manually:</span> use the <em>Close promotion</em> verdict to write an exception into the rule.</div>
    <div class="sc-row sc-actions">
      <button class="btn btn-tiny" data-action="openLedger">Open ledger</button>
    </div>
  </div>`;

  return `<div class="detail-meta">
    ${rule}
    ${ruleBlockHtml(e.resolvedRule)}
    <div><strong>Files:</strong><ul>${filesList}</ul></div>
    ${suppressionPanel}
  </div>`;
}

// Local copy of escapeAttr — details-html.ts is consumed by both the
// dashboard webview and the side Details view, and it's compiled
// standalone, so we don't import the version from webview-render to keep
// modules acyclic.
function escapeAttrLocal(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildConformDetail(
  p: ConformPending & { staleAgainstHead?: boolean },
  r: ConformRequest
): string {
  return `<div class="detail-meta">
    <div><strong>Mode:</strong> ${escapeHtml(p.mode)}</div>
    <div><strong>Baseline:</strong> <code>${escapeHtml(p.head_sha_short)}</code> (${escapeHtml(
    p.head_date
  )})</div>
    ${
      p.scope
        ? `<div><strong>Scope:</strong> <code>${escapeHtml(p.scope)}</code></div>`
        : ""
    }
    <div><strong>Standard:</strong> <code>${escapeHtml(r.standard_id)}</code></div>
    <div><strong>Rules:</strong> ${r.rule_ids
      .map((x) => `<code>${escapeHtml(x)}</code>`)
      .join(", ")}</div>
    ${ruleBlocksHtml(r.resolvedRules)}
    ${
      p.staleAgainstHead
        ? `<div class="rule-row warn-note">Recorded baseline differs from current HEAD — re-run kb_conform.</div>`
        : ""
    }
  </div>`;
}

export function buildLintDetail(v: LintViolation): string {
  return `<div class="detail-meta">
    <div><strong>File:</strong> <code>${escapeHtml(v.file)}</code></div>
    <div><strong>Severity:</strong> <span class="badge ${severityClass(
      v.severity
    )}">${escapeHtml(v.severity)}</span></div>
    <div><strong>Message:</strong> ${escapeHtml(v.message)}</div>
  </div>`;
}

/**
 * Render the action buttons + the (collapsed) prompt disclosure for an
 * entry. Used by the dashboard expanded row and the Details side view.
 *
 * Buttons fire `data-action` events that the host webview handles by
 * posting a message back to the extension. The prompt is intentionally
 * hidden behind a `<details>` so the panel stays focused on the entry's
 * content; copying it does not require unfolding.
 *
 * Action labels are verb-led per `SECTION_GUIDE` so a user reading the
 * panel knows what the button will do without re-deriving it from the
 * section header.
 */
export function buildActionsAndPrompt(d: DetailDescriptor): string {
  const sendLabel = primaryActionLabel(d.section);
  const copyLabel = copyActionLabel(d.section);
  const standardBtn = d.hasStandardRule
    ? `<button class="btn btn-tiny" data-action="openStandard">Open Standard</button>
       <button class="btn btn-tiny" data-action="editRule">Edit Rule</button>
       <button class="btn btn-tiny" data-action="refineStandard">Refine with Agent</button>`
    : "";
  const sourceBtn = d.sourceFile
    ? `<button class="btn btn-tiny" data-action="open">Open Source</button>`
    : "";
  const diffSection = renderDiffSection(d.diffableFiles);
  return `<div class="entry-actions">
      <button class="btn btn-primary btn-tiny" data-action="send">${escapeHtml(sendLabel)}</button>
      <button class="btn btn-tiny" data-action="copy">${escapeHtml(copyLabel)}</button>
      ${sourceBtn}
      ${standardBtn}
    </div>
    ${diffSection}
    <details class="prompt-disclosure">
      <summary>Show prompt</summary>
      <pre class="entry-detail-prompt">${escapeHtml(d.prompt)}</pre>
    </details>`;
}

/**
 * Diff buttons grouped under their own header. For single-file entries
 * we render one inline button; for multi-file entries we list each file
 * with its own button. Files without a `sinceCommit` are skipped — there
 * is nothing to compare against.
 */
function renderDiffSection(files: DiffableFile[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) {
    const f = files[0];
    return `<div class="diff-actions">
      <button class="btn btn-tiny" data-action="showFileDiff" data-diff-path="${escapeAttr(
        f.absPath
      )}" data-diff-since="${escapeAttr(f.sinceCommit)}" data-diff-latest="${escapeAttr(
      f.latestCommit ?? ""
    )}">Show Diff (${escapeHtml(f.sinceCommit.slice(0, 7))}${
      f.latestCommit ? `→${escapeHtml(f.latestCommit.slice(0, 7))}` : "→HEAD"
    })</button>
    </div>`;
  }
  const rows = files
    .map(
      (f) =>
        `<li><code>${escapeHtml(f.label)}</code>
        <button class="btn btn-tiny" data-action="showFileDiff" data-diff-path="${escapeAttr(
          f.absPath
        )}" data-diff-since="${escapeAttr(f.sinceCommit)}" data-diff-latest="${escapeAttr(
          f.latestCommit ?? ""
        )}">Show Diff</button></li>`
    )
    .join("");
  return `<div class="diff-actions">
    <details class="diff-disclosure">
      <summary>Show diffs (${files.length} file${files.length === 1 ? "" : "s"})</summary>
      <ul class="diff-list">${rows}</ul>
    </details>
  </div>`;
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** Render a complete detail panel including title — used by the side view. */
export function buildStandaloneDetail(d: DetailDescriptor): string {
  const sevBadge = d.severity
    ? `<span class="badge ${severityClass(d.severity)}">${escapeHtml(d.severity)}</span>`
    : "";
  const subtitle = d.subtitle
    ? `<div class="detail-subtitle">${escapeHtml(d.subtitle)}</div>`
    : "";
  const guide = SECTION_GUIDE[d.section];
  const guideBlock = `<div class="section-guide">
    <div class="section-guide-kind">${escapeHtml(guide.label)}</div>
    <div class="section-guide-what">${escapeHtml(guide.what)}</div>
    <div class="section-guide-todo">→ ${escapeHtml(guide.todo)}</div>
  </div>`;
  return `<div class="entry-detail open">
    ${guideBlock}
    <div class="detail-header">
      <div class="detail-title-row">
        <span class="detail-title">${escapeHtml(d.title)}</span>
        ${sevBadge}
      </div>
      ${subtitle}
    </div>
    ${d.metaHtml}
    ${buildActionsAndPrompt(d)}
  </div>`;
}

/** Pretty-print the source file basename for subtitles. */
export function basenameOf(p: string | undefined): string {
  if (!p) return "";
  return path.basename(p);
}

/**
 * Build the list of files for which we can show a git diff. Skips files
 * with no `sinceCommit` (nothing to compare). Workspace path resolution
 * is the caller's responsibility — the path passed in is whatever the
 * entry stored, which is workspace-relative for code/standards drift,
 * vault-relative for KB drift.
 */
export function collectDiffableFromCodeDrift(
  e: CodeDriftEntry,
  resolveAbs: (p: string) => string
): DiffableFile[] {
  return e.codeFiles
    .filter((f) => !!f.sinceCommit)
    .map((f) => ({
      absPath: resolveAbs(f.path),
      label: f.path,
      sinceCommit: f.sinceCommit!,
      latestCommit: f.latestCommit,
    }));
}

export function collectDiffableFromKbDrift(
  e: KbDriftEntry,
  resolveAbs: (p: string) => string
): DiffableFile[] {
  if (!e.sinceCommit) return [];
  return [
    {
      absPath: resolveAbs(`knowledge/${e.kbFile}`),
      label: e.kbFile,
      sinceCommit: e.sinceCommit,
      latestCommit: e.latestCommit,
    },
  ];
}

export function collectDiffableFromStandardsDrift(
  e: StandardsDriftEntry,
  resolveAbs: (p: string) => string
): DiffableFile[] {
  const out: DiffableFile[] = [];
  for (const files of Object.values(e.filesByParty)) {
    for (const f of files) {
      if (!f.sinceCommit) continue;
      out.push({
        absPath: resolveAbs(f.path),
        label: f.path,
        sinceCommit: f.sinceCommit,
        latestCommit: f.latestCommit,
      });
    }
  }
  return out;
}
