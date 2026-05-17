/**
 * Project a `StatusSummary` into groups for rendering by an arbitrary axis:
 * "section" (default — one group per kind), "file" (cluster all entries
 * touching the same file), "standard" (cluster by resolved standard id),
 * or "lifecycle" (drift → conform → promotion → lint).
 *
 * Surfaces (VSCode tree, dashboard, Obsidian view) call `buildEntryHandles`
 * once per status, then `groupEntries(handles, mode)` to get the rendering
 * shape they need. Each handle carries enough metadata for any axis without
 * re-walking the StatusSummary.
 */
import { stableEntryId } from "./entry-id.js";
import { SECTION_GUIDE, type SectionKind } from "./section-guide.js";
import type { StatusSummary } from "./types.js";

export type GroupBy = "section" | "file" | "standard" | "lifecycle";
export type LifecycleStage = "drift" | "conform" | "promotion" | "lint" | "diagnostics";

export interface EntryHandle {
  section: SectionKind;
  id: string;
  sourceFile?: string;
  standardId?: string | null;
  lifecycle: LifecycleStage;
}

export interface Group {
  key: string;
  label: string;
  hint?: string;
  entries: EntryHandle[];
}

const SECTION_TO_LIFECYCLE: Record<SectionKind, LifecycleStage> = {
  "code-drift": "drift",
  "kb-drift": "drift",
  "standards-drift": "drift",
  "conform-pending": "conform",
  promotions: "promotion",
  lint: "lint",
  "mapping-diagnostics": "diagnostics",
};

const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  drift: "Drift detected",
  conform: "Conform pending",
  promotion: "Promotions to review",
  lint: "Lint to fix",
  diagnostics: "Mapping diagnostics",
};

const LIFECYCLE_HINT: Record<LifecycleStage, string> = {
  drift: "Code, KB, or standards have diverged. Reconcile to clear these.",
  conform: "Rules waiting for your judgment via kb_conform.",
  promotion:
    "Past judgments accepted a violation — revisit the rule before the next run.",
  lint: "Schema-level issues that will block kb_lint.",
  diagnostics:
    "Structural issues in code_path_patterns — fix in _rules.md to keep drift detection accurate.",
};

export function buildEntryHandles(status: StatusSummary): EntryHandle[] {
  const out: EntryHandle[] = [];

  status.codeDrift.entries.forEach((e, i) =>
    out.push({
      section: "code-drift",
      id: stableEntryId(e.kbTarget, i),
      sourceFile: `knowledge/${e.kbTarget}`,
      standardId: null,
      lifecycle: "drift",
    })
  );

  status.kbDrift.entries.forEach((e, i) =>
    out.push({
      section: "kb-drift",
      id: stableEntryId(e.kbFile, i),
      sourceFile: `knowledge/${e.kbFile}`,
      standardId: null,
      lifecycle: "drift",
    })
  );

  status.standardsDrift.entries.forEach((e, i) =>
    out.push({
      section: "standards-drift",
      id: stableEntryId(e.queueKey, i),
      sourceFile: Object.values(e.filesByParty).flat()[0]?.path,
      standardId: e.standardId,
      lifecycle: "drift",
    })
  );

  for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
    if (!p) continue;
    p.requested.forEach((r, i) =>
      out.push({
        section: "conform-pending",
        id: stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i),
        sourceFile: r.file,
        standardId: r.standard_id,
        lifecycle: "conform",
      })
    );
  }

  status.promotions.forEach((e, i) =>
    out.push({
      section: "promotions",
      id: stableEntryId(e.queueKey, i),
      sourceFile: e.files[0]?.path,
      standardId: e.standardId,
      lifecycle: "promotion",
    })
  );

  status.lint.violations.forEach((v, i) =>
    out.push({
      section: "lint",
      id: stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, i),
      sourceFile: v.file,
      standardId: null,
      lifecycle: "lint",
    })
  );

  return out;
}

const SECTION_ORDER: SectionKind[] = [
  "code-drift",
  "kb-drift",
  "standards-drift",
  "conform-pending",
  "promotions",
  "lint",
];

const LIFECYCLE_ORDER: LifecycleStage[] = ["drift", "conform", "promotion", "lint"];

export function groupEntries(handles: EntryHandle[], mode: GroupBy): Group[] {
  switch (mode) {
    case "section":
      return groupBySection(handles);
    case "file":
      return groupByFile(handles);
    case "standard":
      return groupByStandard(handles);
    case "lifecycle":
      return groupByLifecycle(handles);
  }
}

function groupBySection(handles: EntryHandle[]): Group[] {
  const buckets = new Map<SectionKind, EntryHandle[]>();
  for (const h of handles) {
    if (!buckets.has(h.section)) buckets.set(h.section, []);
    buckets.get(h.section)!.push(h);
  }
  return SECTION_ORDER.map((section) => {
    const guide = SECTION_GUIDE[section];
    return {
      key: `section:${section}`,
      label: guide.label,
      hint: guide.what,
      entries: buckets.get(section) ?? [],
    };
  });
}

function groupByFile(handles: EntryHandle[]): Group[] {
  const buckets = new Map<string, EntryHandle[]>();
  for (const h of handles) {
    const key = h.sourceFile ?? "(no file)";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(h);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      // Place "(no file)" last; everything else alphabetical.
      if (a[0] === "(no file)") return 1;
      if (b[0] === "(no file)") return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([key, entries]) => ({
      key: `file:${key}`,
      label: key,
      hint: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} touching this file`,
      entries,
    }));
}

function groupByStandard(handles: EntryHandle[]): Group[] {
  const buckets = new Map<string, EntryHandle[]>();
  for (const h of handles) {
    const key = h.standardId || "(no standard)";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(h);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      if (a[0] === "(no standard)") return 1;
      if (b[0] === "(no standard)") return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([key, entries]) => ({
      key: `standard:${key}`,
      label: key === "(no standard)" ? key : key,
      hint:
        key === "(no standard)"
          ? "Drift / lint entries not tied to a standard."
          : `All entries tied to standard \`${key}\` — drift, conform, and promotions together.`,
      entries,
    }));
}

function groupByLifecycle(handles: EntryHandle[]): Group[] {
  const buckets = new Map<LifecycleStage, EntryHandle[]>();
  for (const h of handles) {
    if (!buckets.has(h.lifecycle)) buckets.set(h.lifecycle, []);
    buckets.get(h.lifecycle)!.push(h);
  }
  return LIFECYCLE_ORDER.map((stage) => ({
    key: `lifecycle:${stage}`,
    label: LIFECYCLE_LABEL[stage],
    hint: LIFECYCLE_HINT[stage],
    entries: buckets.get(stage) ?? [],
  }));
}

/**
 * Pipeline-strip totals — independent of the current group-by axis. Always
 * shows the four stages with counts; consumers render this as a navigation
 * aid at the top of the dashboard.
 */
export interface PipelineSegment {
  stage: LifecycleStage;
  label: string;
  count: number;
}

export function pipelineSegments(status: StatusSummary): PipelineSegment[] {
  return LIFECYCLE_ORDER.map((stage) => ({
    stage,
    label: LIFECYCLE_LABEL[stage],
    count: countForStage(status, stage),
  }));
}

function countForStage(status: StatusSummary, stage: LifecycleStage): number {
  switch (stage) {
    case "drift":
      return (
        status.codeDrift.entries.length +
        status.kbDrift.entries.length +
        status.standardsDrift.entries.length
      );
    case "conform":
      return (
        (status.conformPending.current?.requested.length ?? 0) +
        (status.conformPending.aspirational?.requested.length ?? 0)
      );
    case "promotion":
      return status.promotions.length;
    case "lint":
      return status.lint.violations.length;
    case "diagnostics":
      return status.patternAudit?.findings.length ?? 0;
  }
}
