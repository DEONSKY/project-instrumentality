import * as vscode from "vscode";
import * as path from "node:path";
import type { LintViolation } from "@instrumentality/shared";

/**
 * Pushes lint violations into a DiagnosticCollection so they appear in the
 * Problems panel and as inline squiggles in editors. We don't have line/column
 * info from `lint-standalone.js`, so each violation gets a single-line range
 * pointing at line 1 of the file. The Problems panel still groups by file
 * and clicking jumps to the file, which is the main UX win.
 */
export class KbDiagnostics {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("instrumentality");
  }

  update(kbRoot: string, violations: LintViolation[]) {
    this.collection.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const v of violations) {
      const abs = path.isAbsolute(v.file) ? v.file : path.join(kbRoot, v.file);
      const key = abs;
      const range = new vscode.Range(0, 0, 0, 0);
      const sev =
        v.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(range, v.message, sev);
      diag.source = "kb-lint";
      const list = byFile.get(key) ?? [];
      list.push(diag);
      byFile.set(key, list);
    }
    for (const [file, diags] of byFile) {
      this.collection.set(vscode.Uri.file(file), diags);
    }
  }

  clear() {
    this.collection.clear();
  }

  dispose() {
    this.collection.dispose();
  }
}
