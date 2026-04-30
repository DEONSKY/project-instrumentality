import * as vscode from "vscode";
import * as path from "node:path";
import type {
  StatusSummary,
  CodeDriftEntry,
  KbDriftEntry,
  StandardsDriftEntry,
  PromotionEntry,
  ConformPending,
  LintViolation,
} from "@instrumentality/shared";
import type { PromptInput } from "@instrumentality/shared";

type SectionKind =
  | "code-drift"
  | "kb-drift"
  | "standards-drift"
  | "conform-pending"
  | "promotions"
  | "lint";

interface SectionNode {
  type: "section";
  kind: SectionKind;
  label: string;
  count: number;
  warning?: string;
}

interface EntryNode {
  type: "entry";
  promptInput: PromptInput;
  label: string;
  description: string;
  tooltip: string;
  sourceFile?: string;
  iconId: string;
}

interface MessageNode {
  type: "message";
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

export class KbSyncTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private status: StatusSummary | null = null;
  private kbRoot: string | null = null;
  private loadError: string | null = null;

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

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.type === "section") {
      const item = new vscode.TreeItem(
        `${node.label} (${node.count})`,
        node.count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.iconPath = new vscode.ThemeIcon(ICON[node.kind]);
      item.contextValue = "kbSync.section";
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
      item.iconPath = new vscode.ThemeIcon(node.iconId);
      item.contextValue = "kbSync.entry";
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
    msg.contextValue = "kbSync.message";
    return msg;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (this.loadError) {
      return [{ type: "message", label: this.loadError, iconId: "error" }];
    }
    if (!this.status) {
      return [
        {
          type: "message",
          label: "knowledge base not detected — open a workspace containing knowledge/_mcp/",
          iconId: "info",
        },
      ];
    }

    if (!node) {
      const s = this.status;
      const sections: SectionNode[] = [
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
      return sections;
    }

    if (node.type !== "section") return [];

    const s = this.status;
    switch (node.kind) {
      case "code-drift":
        return s.codeDrift.entries.length
          ? s.codeDrift.entries.map((e) => this.codeDriftNode(e))
          : [{ type: "message", label: "No code drift", iconId: "check" }];
      case "kb-drift":
        return s.kbDrift.entries.length
          ? s.kbDrift.entries.map((e) => this.kbDriftNode(e))
          : [{ type: "message", label: "No KB drift", iconId: "check" }];
      case "standards-drift":
        return s.standardsDrift.entries.length
          ? s.standardsDrift.entries.map((e) => this.standardsDriftNode(e))
          : [{ type: "message", label: "No standards drift", iconId: "check" }];
      case "conform-pending":
        return this.conformChildren(s);
      case "promotions":
        return s.promotions.length
          ? s.promotions.map((e) => this.promotionNode(e))
          : [{ type: "message", label: "No pending promotions", iconId: "check" }];
      case "lint":
        if (!s.lint.ran) {
          return [
            {
              type: "message",
              label: s.lint.error || "lint subprocess unavailable in this workspace",
              iconId: "info",
            },
          ];
        }
        return s.lint.violations.length
          ? s.lint.violations.map((v) => this.lintNode(v))
          : [{ type: "message", label: "No lint issues", iconId: "check" }];
    }
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

  private conformChildren(s: StatusSummary): TreeNode[] {
    const out: TreeNode[] = [];
    for (const p of [s.conformPending.current, s.conformPending.aspirational]) {
      if (!p || p.requested.length === 0) continue;
      for (const r of p.requested) {
        out.push({
          type: "entry",
          label: r.file,
          description: `${r.standard_id}: ${r.rule_ids.join(", ")} (${p.mode} @ ${p.head_sha_short})`,
          tooltip: `Pending evaluation against ${r.standard_id} for rules ${r.rule_ids.join(", ")}.\nMode: ${p.mode}\nBaseline: ${p.head_sha_short} (${p.head_date})${p.staleAgainstHead ? "\n⚠ baseline differs from current HEAD" : ""}`,
          sourceFile: r.file,
          iconId: ICON["conform-pending"],
          promptInput: { kind: "conform", entry: p },
        });
      }
    }
    if (out.length === 0) {
      return [{ type: "message", label: "No conform pending", iconId: "check" }];
    }
    return out;
  }

  private codeDriftNode(e: CodeDriftEntry): EntryNode {
    const filesPreview = e.codeFiles.slice(0, 3).map((f) => f.path).join(", ");
    const more = e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3} more)` : "";
    return {
      type: "entry",
      label: e.kbTarget,
      description: `${e.codeFiles.length} file(s)${e.hasShared ? " · shared" : ""}`,
      tooltip: `KB target: ${e.kbTarget}\nFiles: ${filesPreview}${more}`,
      sourceFile: path.join("knowledge", e.kbTarget),
      iconId: ICON["code-drift"],
      promptInput: { kind: "code-drift", entry: e },
    };
  }

  private kbDriftNode(e: KbDriftEntry): EntryNode {
    return {
      type: "entry",
      label: e.kbFile,
      description: e.unmapped ? "unmapped" : `${e.codeAreas.length} area(s)`,
      tooltip: `KB file: ${e.kbFile}\n${e.unmapped ? "Unmapped — verify manually" : `Code areas: ${e.codeAreas.slice(0, 3).join(", ")}`}`,
      sourceFile: path.join("knowledge", e.kbFile),
      iconId: ICON["kb-drift"],
      promptInput: { kind: "kb-drift", entry: e },
    };
  }

  private standardsDriftNode(e: StandardsDriftEntry): EntryNode {
    const fileCount = Object.values(e.filesByParty).reduce((sum, files) => sum + files.length, 0);
    const firstFile =
      Object.values(e.filesByParty).flat()[0]?.path ?? undefined;
    return {
      type: "entry",
      label: e.queueKey,
      description: `${e.severity ?? "warn"} · ${fileCount} file(s)`,
      tooltip: `${e.standardId} (${e.standardKind ?? "?"}) · ${e.ruleId}\n${e.reason ?? ""}`,
      sourceFile: firstFile,
      iconId: ICON["standards-drift"],
      promptInput: { kind: "standards-drift", entry: e },
    };
  }

  private promotionNode(e: PromotionEntry): EntryNode {
    return {
      type: "entry",
      label: e.queueKey,
      description: `${e.files.length} file(s)`,
      tooltip: `${e.standardId ?? "?"} · ${e.ruleId ?? "?"}\nFingerprint: ${e.ruleFingerprint ?? "?"}`,
      sourceFile: e.files[0]?.path,
      iconId: ICON.promotions,
      promptInput: { kind: "promotion", entry: e },
    };
  }

  private lintNode(v: LintViolation): EntryNode {
    return {
      type: "entry",
      label: v.file,
      description: `${v.severity}: ${v.message.length > 60 ? v.message.slice(0, 60) + "…" : v.message}`,
      tooltip: `${v.severity.toUpperCase()} · ${v.file}\n${v.message}`,
      sourceFile: v.file,
      iconId: v.severity === "error" ? "error" : "warning",
      promptInput: { kind: "lint", entry: v },
    };
  }
}
