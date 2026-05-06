import * as vscode from "vscode";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Open VSCode's native diff editor between two revisions of a file.
 *
 * Implementation: shell out to `git show <sha>:<rel>` and stage each
 * revision into a temp file, then call `vscode.diff` with both URIs.
 *
 * Why temp files instead of `git:` URIs: the `git:` scheme is provided
 * by VSCode's bundled git extension and its query parameters are an
 * undocumented internal contract that has churned across releases.
 * Temp files keep this independent of any particular git extension.
 *
 * `latestCommit` is optional; when missing we diff against the working
 * tree (for entries that captured a `since` but not a `latest`).
 */
export async function showFileDiff(
  kbRoot: string,
  absPath: string,
  sinceCommit: string,
  latestCommit?: string
): Promise<void> {
  const rel = path.relative(kbRoot, absPath);
  if (rel.startsWith("..")) {
    void vscode.window.showErrorMessage(
      `Instrumentality: file ${absPath} is outside the workspace; cannot diff.`
    );
    return;
  }

  let leftUri: vscode.Uri;
  let rightUri: vscode.Uri;
  try {
    leftUri = vscode.Uri.file(await stageRevision(kbRoot, rel, sinceCommit));
  } catch (err: any) {
    void vscode.window.showErrorMessage(
      `Instrumentality: cannot read \`${rel}\` at ${sinceCommit}: ${err?.message ?? err}`
    );
    return;
  }

  if (latestCommit) {
    try {
      rightUri = vscode.Uri.file(await stageRevision(kbRoot, rel, latestCommit));
    } catch (err: any) {
      void vscode.window.showErrorMessage(
        `Instrumentality: cannot read \`${rel}\` at ${latestCommit}: ${err?.message ?? err}`
      );
      return;
    }
  } else {
    // Compare against the working tree.
    rightUri = vscode.Uri.file(absPath);
  }

  const title = `${path.basename(rel)} (${sinceCommit.slice(0, 7)}${
    latestCommit ? ` → ${latestCommit.slice(0, 7)}` : " → working tree"
  })`;
  await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
}

async function stageRevision(
  kbRoot: string,
  relPath: string,
  sha: string
): Promise<string> {
  const { stdout } = await execFileP("git", ["show", `${sha}:${relPath}`], {
    cwd: kbRoot,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "buffer",
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "instr-diff-"));
  const safeBase = path.basename(relPath);
  const filename = `${safeBase}.${sha.slice(0, 7)}`;
  const out = path.join(dir, filename);
  fs.writeFileSync(out, stdout);
  return out;
}
