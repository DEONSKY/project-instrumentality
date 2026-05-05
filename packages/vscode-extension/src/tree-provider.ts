import * as vscode from "vscode";
import * as path from "node:path";
import { stableEntryId } from "@instrumentality/shared";
import type {
  StatusSummary,
  CodeDriftEntry,
  KbDriftEntry,
  StandardsDriftEntry,
  PromotionEntry,
  LintViolation,
  PromptInput,
} from "@instrumentality/shared";

export type SectionKind =
  | "code-drift"
  | "kb-drift"
  | "standards-drift"
  | "conform-pending"
  | "promotions"
  | "lint";

export type SortMode = "default" | "severity" | "recency" | "path";

export interface FilterState {
  hiddenSections: Set<SectionKind>;
  hideInfoLint: boolean;
  textPattern: string;
}

export interface SectionNode {
  type: "section";
  kind: SectionKind;
  label: string;
  count: number;
  warning?: string;
}

export interface EntryNode {
  type: "entry";
  parentKind: SectionKind;
  /** Stable id matching the dashboard's id for the same entry. */
  entryId: string;
  promptInput: PromptInput;
  label: string;
  description: string;
  tooltip: vscode.MarkdownString;
  sourceFile?: string;
  standardFile?: string | null;
  iconId: string;
  iconColorId?: string;
  severityRank: number;
  recencyKey: string;
}

export interface MessageNode {
  type: "message";
  parentKind?: SectionKind;
  label: string;
  iconId?: string;
}

export type TreeNode = SectionNode | EntryNode | MessageNode;

const ICON: Record<SectionKind, string> = {
  "code-drift": "git-compare",
  "kb-drift": "book",
  "standards-drift": "law",
  "conform-pending": "checklist",
  promotions: "arrow-up",
  lint: "warning",
};

const SECTION_LABEL: Record<SectionKind, string> = {
  "code-drift": "Code Drifts",
  "kb-drift": "KB Drifts",
  "standards-drift": "Standards Drifts",
  "conform-pending": "Conform Pending",
  promotions: "Pending Promotions",
  lint: "Lint Issues",
};

function severityRank(s: string | null | undefined): number {
  if (s === "error") return 0;
  if (s === "warn") return 1;
  if (s === "info") return 2;
  return 3;
}

function severityColorId(s: string | null | undefined): string | undefined {
  if (s === "error") return "problemsErrorIcon.foreground";
  if (s === "warn") return "problemsWarningIcon.foreground";
  if (s === "info") return "problemsInfoIcon.foreground";
  return undefined;
}

function truncate(s: string, max = 60): string {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const TOOLTIP_FOOTER = "\n\n→ Click Send Prompt to ask the agent to resolve this.";

function makeTooltip(body: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(body + TOOLTIP_FOOTER);
  md.isTrusted = false;
  return md;
}

export const DEFAULT_FILTER: FilterState = {
  hiddenSections: new Set(),
  hideInfoLint: false,
  textPattern: "",
};

export class KbSyncTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private status: StatusSummary | null = null;
  private kbRoot: string | null = null;
  private loadError: string | null = null;
  private sectionByKind: Map<SectionKind, SectionNode> = new Map();
  private parentByEntry: WeakMap<EntryNode, SectionNode> = new WeakMap();

  constructor(
    private getSort: () => SortMode,
    private getFilter: () => FilterState,
    private resolveStandardForEntry: (e: EntryNode) => string | null
  ) {}

  setStatus(status: StatusSummary, kbRoot: string) {
    this.status = status;
    this.kbRoot = kbRoot;
    this.loadError = null;
    this._onDidChangeTreeData.fire();
  }

  setError(message: string) {
    this.loadError = message;
    this._onDidChangeTreeData.fire();
  }

  setEmpty() {
    this.status = null;
    this.kbRoot = null;
    this.loadError = null;
    this._onDidChangeTreeData.fire();
  }

  refreshTree() {
    this._onDidChangeTreeData.fire();
  }

  getCurrentKbRoot(): string | null {
    return this.kbRoot;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.type === "section") {
      const item = new vscode.TreeItem(
        `${node.label} (${node.count})`,
        node.count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.iconPath = new vscode.ThemeIcon(ICON[node.kind]);
      item.contextValue = "instrumentality.section";
      if (node.warning) {
        item.tooltip = node.warning;
        item.description = "⚠";
      }
      return item;
    }
    if (node.type === "entry") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.description;
      item.tooltip = node.tooltip;
      item.iconPath = node.iconColorId
        ? new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor(node.iconColorId))
        : new vscode.ThemeIcon(node.iconId);
      item.contextValue = node.standardFile ? "instrumentality.entry.standard" : "instrumentality.entry";
      if (node.sourceFile && this.kbRoot) {
        const abs = path.isAbsolute(node.sourceFile)
          ? node.sourceFile
          : path.join(this.kbRoot, node.sourceFile);
        item.command = {
          command: "vscode.open",
          title: "Open",
          arguments: [vscode.Uri.file(abs)],
        };
      }
      return item;
    }
    const msg = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    if (node.iconId) msg.iconPath = new vscode.ThemeIcon(node.iconId);
    msg.contextValue = "instrumentality.message";
    return msg;
  }

  /** Required for TreeView.reveal() — bidirectional navigation in Phase B. */
  getParent(node: TreeNode): TreeNode | null {
    if (node.type === "section") return null;
    if (node.type === "message") {
      return node.parentKind ? this.sectionByKind.get(node.parentKind) ?? null : null;
    }
    return this.parentByEntry.get(node) ?? this.sectionByKind.get(node.parentKind) ?? null;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    // Welcome-view contribution covers the no-kb / no-status case; return [].
    if (this.loadError) {
      return [{ type: "message", label: this.loadError, iconId: "error" }];
    }
    if (!this.status) return [];

    if (!node) {
      const sections = this.buildSections(this.status);
      this.sectionByKind = new Map(sections.map((s) => [s.kind, s]));
      const filter = this.getFilter();
      return sections.filter((s) => !filter.hiddenSections.has(s.kind));
    }

    if (node.type !== "section") return [];
    const entries = this.entriesForSection(this.status, node);
    for (const e of entries) {
      if (e.type === "entry") this.parentByEntry.set(e, node);
    }
    return entries;
  }

  private buildSections(s: StatusSummary): SectionNode[] {
    return [
      { type: "section", kind: "code-drift", label: SECTION_LABEL["code-drift"], count: s.codeDrift.entries.length },
      { type: "section", kind: "kb-drift", label: SECTION_LABEL["kb-drift"], count: s.kbDrift.entries.length },
      { type: "section", kind: "standards-drift", label: SECTION_LABEL["standards-drift"], count: s.standardsDrift.entries.length },
      {
        type: "section",
        kind: "conform-pending",
        label: SECTION_LABEL["conform-pending"],
        count:
          (s.conformPending.current?.requested.length ?? 0) +
          (s.conformPending.aspirational?.requested.length ?? 0),
        warning: this.conformWarning(s),
      },
      { type: "section", kind: "promotions", label: SECTION_LABEL.promotions, count: s.promotions.length },
      {
        type: "section",
        kind: "lint",
        label: SECTION_LABEL.lint,
        count: s.lint.violations.length,
        warning: s.lint.error,
      },
    ];
  }

  private entriesForSection(s: StatusSummary, section: SectionNode): TreeNode[] {
    let raw: EntryNode[] = [];
    let emptyMessage = "No entries";
    let emptyIcon = "check";

    switch (section.kind) {
      case "code-drift":
        raw = s.codeDrift.entries.map((e, i) => this.codeDriftNode(e, i, section));
        emptyMessage = "No code drift";
        break;
      case "kb-drift":
        raw = s.kbDrift.entries.map((e, i) => this.kbDriftNode(e, i, section));
        emptyMessage = "No KB drift";
        break;
      case "standards-drift":
        raw = s.standardsDrift.entries.map((e, i) => this.standardsDriftNode(e, i, section));
        emptyMessage = "No standards drift";
        break;
      case "conform-pending":
        raw = this.conformEntries(s, section);
        emptyMessage = "No conform pending";
        break;
      case "promotions":
        raw = s.promotions.map((e, i) => this.promotionNode(e, i, section));
        emptyMessage = "No pending promotions";
        break;
      case "lint":
        if (!s.lint.ran) {
          return [
            {
              type: "message",
              parentKind: section.kind,
              label: s.lint.error || "lint subprocess unavailable in this workspace",
              iconId: "info",
            },
          ];
        }
        raw = s.lint.violations.map((v, i) => this.lintNode(v, i, section));
        emptyMessage = "No lint issues";
        break;
    }

    const filter = this.getFilter();
    const filtered = raw.filter((e) => {
      if (section.kind === "lint" && filter.hideInfoLint && e.severityRank > 1) return false;
      if (filter.textPattern) {
        const hay = (e.label + " " + e.description).toLowerCase();
        if (!hay.includes(filter.textPattern.toLowerCase())) return false;
      }
      return true;
    });

    const sorted = this.sortEntries(filtered);
    if (sorted.length === 0) {
      return [{ type: "message", parentKind: section.kind, label: emptyMessage, iconId: emptyIcon }];
    }
    return sorted;
  }

  private sortEntries(entries: EntryNode[]): EntryNode[] {
    const mode = this.getSort();
    const cp = [...entries];
    switch (mode) {
      case "severity":
        cp.sort((a, b) => a.severityRank - b.severityRank || a.label.localeCompare(b.label));
        break;
      case "recency":
        cp.sort((a, b) => b.recencyKey.localeCompare(a.recencyKey) || a.label.localeCompare(b.label));
        break;
      case "path":
        cp.sort((a, b) => (a.sourceFile || a.label).localeCompare(b.sourceFile || b.label));
        break;
      case "default":
      default:
        // preserve underlying queue order
        break;
    }
    return cp;
  }

  private conformWarning(s: StatusSummary): string | undefined {
    const stale =
      s.conformPending.current?.staleAgainstHead ||
      s.conformPending.aspirational?.staleAgainstHead;
    if (stale) {
      return `recorded baseline differs from current HEAD (${s.currentHeadShort ?? "?"}) — re-run kb_conform`;
    }
    return undefined;
  }

  private conformEntries(s: StatusSummary, section: SectionNode): EntryNode[] {
    const out: EntryNode[] = [];
    for (const p of [s.conformPending.current, s.conformPending.aspirational]) {
      if (!p || p.requested.length === 0) continue;
      p.requested.forEach((r, i) => {
        const firstRule = r.rule_ids[0] ?? "?";
        const allRules = r.rule_ids.map((x) => `\`${x}\``).join(", ");
        const staleNote = p.staleAgainstHead
          ? "\n\n⚠ Recorded baseline differs from current HEAD — re-run `kb_conform`."
          : "";
        const tooltipBody =
          `**Conform pending** (mode: \`${p.mode}\`)\n\n` +
          `Standard: \`${r.standard_id}\`\n\n` +
          `Rules: ${allRules}\n\n` +
          `Baseline: \`${p.head_sha_short}\` (${p.head_date})${staleNote}`;
        const node: EntryNode = {
          type: "entry",
          parentKind: section.kind,
          entryId: stableEntryId(`${p.mode}:${r.file}:${r.standard_id}`, i),
          label: r.file,
          description: `${r.standard_id}.${firstRule} @ ${p.head_sha_short}`,
          tooltip: makeTooltip(tooltipBody),
          sourceFile: r.file,
          iconId: ICON["conform-pending"],
          severityRank: p.staleAgainstHead ? 1 : 2,
          recencyKey: p.head_date || "",
          promptInput: { kind: "conform", entry: p },
        };
        node.standardFile = this.resolveStandardForEntry(node);
        out.push(node);
      });
    }
    return out;
  }

  private codeDriftNode(e: CodeDriftEntry, index: number, section: SectionNode): EntryNode {
    const filesPreview = e.codeFiles.slice(0, 5).map((f) => `- \`${f.path}\``).join("\n");
    const more = e.codeFiles.length > 5 ? `\n- _(+${e.codeFiles.length - 5} more)_` : "";
    const recency = e.codeFiles.reduce((acc, f) => {
      const d = f.latestDate || f.sinceDate || "";
      return d > acc ? d : acc;
    }, "");
    const sharedNote = e.hasShared
      ? "\n\n⚠ Shared module touched — KB update should reflect cross-cutting impact."
      : "";
    const description = e.hasShared
      ? `${e.codeFiles.length} file(s) · shared module touched`
      : `${e.codeFiles.length} file(s)`;
    const tooltipBody =
      `**Code drift** — KB target \`${e.kbTarget}\`\n\n` +
      `Changed files:\n${filesPreview}${more}${sharedNote}`;
    return {
      type: "entry",
      parentKind: section.kind,
      entryId: stableEntryId(e.kbTarget, index),
      label: e.kbTarget,
      description,
      tooltip: makeTooltip(tooltipBody),
      sourceFile: path.join("knowledge", e.kbTarget),
      iconId: ICON["code-drift"],
      severityRank: e.hasShared ? 1 : 2,
      recencyKey: recency,
      promptInput: { kind: "code-drift", entry: e },
    };
  }

  private kbDriftNode(e: KbDriftEntry, index: number, section: SectionNode): EntryNode {
    const description = e.unmapped
      ? truncate("unmapped — verify manually")
      : e.renamedFrom
      ? truncate(`${e.codeAreas.length} area(s) · renamed from ${e.renamedFrom}`)
      : `${e.codeAreas.length} area(s)`;
    const areasMd =
      e.codeAreas.length > 0
        ? e.codeAreas.slice(0, 5).map((a) => `- \`${a}\``).join("\n")
        : "- _(no mapped code paths)_";
    const moreAreas = e.codeAreas.length > 5 ? `\n- _(+${e.codeAreas.length - 5} more)_` : "";
    const renamedNote = e.renamedFrom
      ? `\n\nRenamed from \`${e.renamedFrom}\`.`
      : "";
    const unmappedNote = e.unmapped
      ? "\n\n⚠ Unmapped — no `code_path_patterns` for this KB file. Verify implementation manually."
      : "";
    const tooltipBody =
      `**KB drift** — \`${e.kbFile}\`${renamedNote}\n\n` +
      `Code areas to review:\n${areasMd}${moreAreas}${unmappedNote}`;
    return {
      type: "entry",
      parentKind: section.kind,
      entryId: stableEntryId(e.kbFile, index),
      label: e.kbFile,
      description,
      tooltip: makeTooltip(tooltipBody),
      sourceFile: path.join("knowledge", e.kbFile),
      iconId: ICON["kb-drift"],
      severityRank: e.unmapped ? 1 : 2,
      recencyKey: e.latestDate || e.sinceDate || "",
      promptInput: { kind: "kb-drift", entry: e },
    };
  }

  private standardsDriftNode(e: StandardsDriftEntry, index: number, section: SectionNode): EntryNode {
    const fileCount = Object.values(e.filesByParty).reduce((sum, files) => sum + files.length, 0);
    const firstFile = Object.values(e.filesByParty).flat()[0]?.path ?? undefined;
    const recency = Object.values(e.filesByParty)
      .flat()
      .reduce((acc, f) => {
        const d = f.latestDate || f.sinceDate || "";
        return d > acc ? d : acc;
      }, "");
    const severity = e.severity ?? "warn";
    const description = e.reason
      ? `${severity} · ${truncate(e.reason)}`
      : `${severity} · ${fileCount} file(s)`;
    const partyKeys = Object.keys(e.filesByParty);
    let filesMd: string;
    if (partyKeys.length === 1 && partyKeys[0] === "_") {
      filesMd = e.filesByParty["_"].map((f) => `- \`${f.path}\``).join("\n");
    } else {
      filesMd = partyKeys
        .sort()
        .map((party) => {
          const label = party === "_" ? "Files" : `${party}`;
          const lines = e.filesByParty[party].map((f) => `  - \`${f.path}\``).join("\n");
          return `**${label}:**\n${lines}`;
        })
        .join("\n\n");
    }
    const reasonMd = e.reason ? `\n\n**Reason:** ${e.reason}` : "";
    const tooltipBody =
      `**Standards drift** — \`${e.queueKey}\` (${severity})\n\n` +
      `Standard: \`${e.standardId ?? "?"}\`${e.standardKind ? ` (${e.standardKind})` : ""}\n\n` +
      `Rule: \`${e.ruleId ?? "?"}\`${reasonMd}\n\n` +
      `${filesMd}`;
    return {
      type: "entry",
      parentKind: section.kind,
      entryId: stableEntryId(e.queueKey, index),
      label: e.queueKey,
      description,
      tooltip: makeTooltip(tooltipBody),
      sourceFile: firstFile,
      iconId: ICON["standards-drift"],
      iconColorId: severityColorId(e.severity),
      severityRank: severityRank(e.severity),
      recencyKey: recency,
      promptInput: { kind: "standards-drift", entry: e },
    };
  }

  private promotionNode(e: PromotionEntry, index: number, section: SectionNode): EntryNode {
    const filesMd = e.files
      .slice(0, 5)
      .map((f) => {
        const note = f.note ? ` — _${f.note}_` : "";
        return `- \`${f.path}\` (promoted ${f.promotedAt})${note}`;
      })
      .join("\n");
    const moreFiles = e.files.length > 5 ? `\n- _(+${e.files.length - 5} more)_` : "";
    const tooltipBody =
      `**Pending promotion** — \`${e.queueKey}\` (${e.severity ?? "warn"})\n\n` +
      `Standard: \`${e.standardId ?? "?"}\`${e.standardKind ? ` (${e.standardKind})` : ""}\n\n` +
      `Rule: \`${e.ruleId ?? "?"}\`\n\n` +
      `Fingerprint: \`${e.ruleFingerprint ?? "?"}\`\n\n` +
      `Promoted files:\n${filesMd}${moreFiles}`;
    return {
      type: "entry",
      parentKind: section.kind,
      entryId: stableEntryId(e.queueKey, index),
      label: e.queueKey,
      description: `${e.files.length} file(s)`,
      tooltip: makeTooltip(tooltipBody),
      sourceFile: e.files[0]?.path,
      iconId: ICON.promotions,
      iconColorId: severityColorId(e.severity),
      severityRank: severityRank(e.severity),
      recencyKey: e.files.reduce((acc, f) => (f.promotedAt > acc ? f.promotedAt : acc), ""),
      promptInput: { kind: "promotion", entry: e },
    };
  }

  private lintNode(v: LintViolation, index: number, section: SectionNode): EntryNode {
    const tooltipBody =
      `**Lint ${v.severity}** — \`${v.file}\`\n\n` +
      `> ${v.message}`;
    return {
      type: "entry",
      parentKind: section.kind,
      entryId: stableEntryId(`${v.file}:${v.message.slice(0, 40)}`, index),
      label: v.file,
      description: `${v.severity} · ${truncate(v.message)}`,
      tooltip: makeTooltip(tooltipBody),
      sourceFile: v.file,
      iconId: v.severity === "error" ? "error" : "warning",
      iconColorId: severityColorId(v.severity),
      severityRank: severityRank(v.severity),
      recencyKey: "",
      promptInput: { kind: "lint", entry: v },
    };
  }

  /**
   * Locate an entry node by section + stable id. Used by the dashboard to
   * reveal a tree leaf for a clicked card. Re-runs the section's getChildren
   * because nodes are recreated on each render.
   */
  findEntryByRef(section: SectionKind, entryId: string): EntryNode | null {
    const sectionNode = this.sectionByKind.get(section);
    if (!sectionNode) return null;
    const children = this.getChildren(sectionNode);
    for (const c of children) {
      if (c.type === "entry" && c.entryId === entryId) return c;
    }
    return null;
  }
}
