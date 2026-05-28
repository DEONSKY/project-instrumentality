import * as path from "node:path";
import {
  getActionPrompt,
  stableEntryId,
  formatKbTarget,
  type StatusSummary,
  type PromptInput,
  type SectionKind,
  type SubmoduleEntry,
} from "@instrumentality/shared";

// ── Entry index ──────────────────────────────────────────────────────────────

export interface RenderedEntry {
  section: SectionKind;
  id: string;
  promptInput: PromptInput;
  prompt: string;
  sourceFile?: string;
  standardId?: string | null;
}

/**
 * Flatten a StatusSummary into a Map keyed by `<section>:<stable-id>` so the
 * view can resolve user actions back to the originating entry without
 * re-walking the status tree.
 *
 * Pure function — no `this`, no DOM. Output drives the `entryIndex` field on
 * InstrumentalityView; it's rebuilt on every refresh.
 */
export function buildEntryIndex(status: StatusSummary | null): Map<string, RenderedEntry> {
  const out = new Map<string, RenderedEntry>();
  if (!status) return out;
  const push = (e: Omit<RenderedEntry, "prompt">) => {
    const key = `${e.section}:${e.id}`;
    out.set(key, { ...e, prompt: getActionPrompt(e.promptInput) });
  };

  status.codeDrift.entries.forEach((e, i) =>
    push({
      section: "code-drift",
      id: stableEntryId(e.kbTarget, i),
      promptInput: { kind: "code-drift", entry: e },
      sourceFile: path.join("knowledge", e.kbTarget),
    })
  );
  status.kbDrift.entries.forEach((e, i) =>
    push({
      section: "kb-drift",
      id: stableEntryId(e.kbFile, i),
      promptInput: { kind: "kb-drift", entry: e },
      sourceFile: path.join("knowledge", e.kbFile),
    })
  );
  status.standardsDrift.entries.forEach((e, i) =>
    push({
      section: "standards-drift",
      id: stableEntryId(`${e.mode}:${e.queueKey}`, i),
      promptInput: { kind: "standards-drift", entry: e },
      sourceFile: Object.values(e.filesByParty).flat()[0]?.path,
      standardId: e.standardId,
    })
  );
  for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
    if (!p || p.requested.length === 0) continue;
    p.requested.forEach((r, i) =>
      push({
        section: "conform-pending",
        id: stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i),
        promptInput: { kind: "conform", entry: p },
        sourceFile: r.file,
        standardId: r.standard_id,
      })
    );
  }
  status.promotions.forEach((e, i) =>
    push({
      section: "promotions",
      id: stableEntryId(e.queueKey, i),
      promptInput: { kind: "promotion", entry: e },
      sourceFile: e.files[0]?.path,
      standardId: e.standardId,
    })
  );
  status.lint.violations.forEach((v, i) =>
    push({
      section: "lint",
      id: stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i),
      promptInput: { kind: "lint", entry: v },
      sourceFile: v.file,
    })
  );
  return out;
}

// ── CSS-escape ───────────────────────────────────────────────────────────────
// Minimal CSS.escape — Obsidian's Electron has window.CSS.escape, but
// using it directly inside the class requires DOM-only contexts. This
// inline form is enough for our known-safe section keys.

export function cssEscape(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// ── Branch alignment ─────────────────────────────────────────────────────────
//
// Encodes what the branch relationship MEANS for the user, not just
// match/mismatch. Drives the branch chip color and the row's left-border
// accent so the row is scannable at a glance.

export type BranchAlignment = "aligned" | "blocking" | "advisory" | "detached";

export function classifyBranch(
  e: SubmoduleEntry,
  parentBranch: string | null
): BranchAlignment {
  if (!e.branch) return "detached";
  if (parentBranch && e.branch === parentBranch) return "aligned";
  // Different from parent. Owned = blocking (pre-push hook rejects);
  // shared = advisory (shared modules legitimately live on their own
  // branches and don't enforce alignment).
  return e.type === "owned" ? "blocking" : "advisory";
}

// ── Mapping diagnostics fix-prompt builder ───────────────────────────────────
//
// Mirrors the buildAuditFixPrompt helper in the VSCode extension so both
// surfaces produce identical clipboard content. Hardcoded (not loaded from
// _templates/prompts/) per the plan's deliberate scope cut.

type AuditFinding = NonNullable<StatusSummary["patternAudit"]>["findings"][number];

export function buildAuditFixPrompt(f: AuditFinding): string {
  const header = `The knowledge/_rules.md → code_path_patterns audit surfaced this finding:\n\n`;
  let body = "";
  switch (f.type) {
    case "orphan_pattern":
      body = `Type: orphan_pattern\n`
        + `Pattern: intent=${f.intent ?? "(none)"}, kb_target=${formatKbTarget(f.kb_target)}\n`
        + `Paths: ${JSON.stringify(f.paths)}\n`
        + `\nThe paths globs above match zero files in the current repo. Decide:\n`
        + `1. If the code was moved/renamed, update the paths globs in knowledge/_rules.md to match the new location.\n`
        + `2. If the pattern is obsolete, remove it from knowledge/_rules.md.\n`
        + `3. If the paths are correct but the matching files were deleted, leave the pattern and acknowledge it's currently inactive.\n`;
      break;
    case "submodule_pattern_unresolved":
      body = `Type: submodule_pattern_unresolved\n`
        + `Pattern: intent=${f.intent ?? "(none)"}, kb_target=${formatKbTarget(f.kb_target)}\n`
        + `Paths: ${JSON.stringify(f.paths)}\n`
        + `\nThis pattern targets a submodule path but matched no files inside that submodule. Decide:\n`
        + `1. If the submodule layout changed, fix the path globs in knowledge/_rules.md.\n`
        + `2. If files have not yet been added to the submodule, leave the pattern and add the files later.\n`
        + `3. If the pattern is obsolete, remove it from knowledge/_rules.md.\n`;
      break;
    case "ghost_target":
      body = `Type: ghost_target\n`
        + `Hardcoded kb_target: ${f.resolved_target}\n`
        + `\nThe pattern targets a KB file that does not exist. Either:\n`
        + `1. Create knowledge/${f.resolved_target} via kb_scaffold (if the concept is real but undocumented).\n`
        + `2. Fix the kb_target in knowledge/_rules.md (if this was a typo).\n`
        + `3. Remove the pattern entirely (if the concept is gone).\n`;
      break;
    case "convention_violation":
      body = `Type: convention_violation\n`
        + `Pattern: intent=${f.intent}, kb_target=${formatKbTarget(f.kb_target)}\n`
        + `Expected folder for intent "${f.intent}": ${f.expected_folder}\n`
        + `\nThe convention table expects intent "${f.intent}" to target ${f.expected_folder}* but this pattern targets a different folder.\n`
        + `Either fix the kb_target in knowledge/_rules.md, or change the intent label if the mapping is intentional.\n`;
      break;
    case "unmapped_kb_group":
      body = `Type: unmapped_kb_group\n`
        + `Folder: ${f.folder}\n`
        + `Count: ${f.count}\n`
        + `Sample files: ${JSON.stringify(f.sample_files)}\n`
        + `\nThese KB files are not targeted by any code_path_patterns entry — code→KB drift detection is silent for them.\n`
        + `Add a pattern to knowledge/_rules.md → code_path_patterns. Typical shape:\n`
        + `\n  - intent: <see knowledge/_mcp/presets/ for examples>\n`
        + `    kb_target: "${f.folder}{name}.md"\n`
        + `    paths:\n`
        + `      - "<glob covering the related source files>"\n`
        + `\nGrep the repo for files related to these KB documents and choose paths globs that catch them.\n`;
      break;
    case "fanout_with_hardcoded":
      body = `Type: fanout_with_hardcoded\n`
        + `Pattern kb_target (hardcoded): ${formatKbTarget(f.kb_target)}\n`
        + `Distinct file basenames: ${f.distinct_concepts}\n`
        + `\nThis hardcoded kb_target catches ${f.distinct_concepts} distinct file basenames — one KB file is documenting many concepts.\n`
        + `Either switch the kb_target to a {name} template (so each concept gets its own KB file), or narrow the paths glob.\n`;
      break;
  }
  return header + body;
}
