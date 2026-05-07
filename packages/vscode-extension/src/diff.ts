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
 * Semantics: `sinceCommit` is the FIRST post-baseline commit that touched
 * the file (per the drift detector). To show the full accumulated drift,
 * the left side must be the state BEFORE that commit — i.e. `<since>^`.
 * Otherwise the change introduced by `<since>` itself is invisible.
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
  const relForDisplay = path.relative(kbRoot, absPath);
  if (relForDisplay.startsWith("..")) {
    void vscode.window.showErrorMessage(
      `Instrumentality: file ${absPath} is outside the workspace; cannot diff.`
    );
    return;
  }

  // The KB may be a superproject with submodules. Resolve the actual repo
  // containing this file so `git show <sha>:<path>` runs against the repo
  // that owns the SHA.
  let repoRoot: string;
  let relInRepo: string;
  try {
    repoRoot = await resolveRepoRoot(absPath);
    relInRepo = path.relative(repoRoot, absPath);
  } catch (err: any) {
    void vscode.window.showErrorMessage(
      `Instrumentality: cannot locate git repo for \`${relForDisplay}\`: ${err?.message ?? err}`
    );
    return;
  }

  // Left side: the file as the KB last knew it — i.e. before sinceCommit.
  // For a root commit or newly added file, the parent ref / path won't
  // exist; treat that as an empty file so the diff renders the addition.
  let leftUri: vscode.Uri;
  let rightUri: vscode.Uri;
  try {
    leftUri = vscode.Uri.file(
      await stageRevisionOrEmpty(repoRoot, relInRepo, `${sinceCommit}^`)
    );
  } catch (err: any) {
    void vscode.window.showErrorMessage(
      `Instrumentality: cannot read \`${relForDisplay}\` at ${sinceCommit}^: ${err?.message ?? err}`
    );
    return;
  }

  if (latestCommit) {
    try {
      rightUri = vscode.Uri.file(await stageRevision(repoRoot, relInRepo, latestCommit));
    } catch (err: any) {
      void vscode.window.showErrorMessage(
        `Instrumentality: cannot read \`${relForDisplay}\` at ${latestCommit}: ${err?.message ?? err}`
      );
      return;
    }
  } else {
    // Compare against the working tree.
    rightUri = vscode.Uri.file(absPath);
  }

  const title = `${path.basename(relInRepo)} (${sinceCommit.slice(0, 7)}^ → ${
    latestCommit ? latestCommit.slice(0, 7) : "working tree"
  })`;
  await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
}

async function resolveRepoRoot(absPath: string): Promise<string> {
  const startDir = fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()
    ? absPath
    : path.dirname(absPath);
  const { stdout } = await execFileP("git", ["rev-parse", "--show-toplevel"], {
    cwd: startDir,
    encoding: "utf8",
  });
  return stdout.trim();
}

async function stageRevision(
  repoRoot: string,
  relPath: string,
  sha: string
): Promise<string> {
  const { stdout } = await execFileP("git", ["show", `${sha}:${relPath}`], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "buffer",
  });
  return writeTemp(relPath, sha, stdout);
}

// Like stageRevision, but if the rev or path doesn't resolve (e.g. root
// commit's parent, or file added in `sha`), stage an empty file so the
// diff still renders.
async function stageRevisionOrEmpty(
  repoRoot: string,
  relPath: string,
  sha: string
): Promise<string> {
  try {
    return await stageRevision(repoRoot, relPath, sha);
  } catch {
    return writeTemp(relPath, sha, Buffer.alloc(0));
  }
}

function writeTemp(relPath: string, sha: string, data: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "instr-diff-"));
  const safeBase = path.basename(relPath);
  const filename = `${safeBase}.${sha.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 12)}`;
  const out = path.join(dir, filename);
  fs.writeFileSync(out, data);
  return out;
}
