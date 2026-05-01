import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LintViolation } from "../types.js";

const LINE_RE = /^\[kb-lint\]\s+(WARN|ERROR)\s+(\S+):\s+(.*)$/;

export function parseLintStderr(stderr: string): LintViolation[] {
  const out: LintViolation[] = [];
  for (const raw of stderr.split("\n")) {
    const m = raw.match(LINE_RE);
    if (!m) continue;
    out.push({
      severity: m[1] === "ERROR" ? "error" : "warn",
      file: m[2],
      message: m[3],
    });
  }
  return out;
}

export interface RunLintOptions {
  /**
   * Override command to run instead of the bundled standalone script.
   * Useful when the MCP source isn't in tree (consumer projects). Example:
   *   "npx kb-lint" or "/abs/path/to/lint-standalone.js"
   * The command is split on whitespace; cwd is set to kbRoot; stderr is
   * parsed the same way.
   */
  commandOverride?: string;
}

/**
 * Run lint and parse violations from stderr. Default behavior:
 *   - look for `<kbRoot>/knowledge/_mcp/scripts/lint-standalone.js`;
 *   - if missing, return `{ ran: false }` (consumer projects don't ship it).
 * With `commandOverride`, run that command instead.
 *
 * Always exits 0 on the lint side; violations are on stderr.
 */
export function runLint(
  kbRoot: string,
  opts: RunLintOptions = {}
): Promise<{ violations: LintViolation[]; ran: boolean; error?: string }> {
  if (opts.commandOverride && opts.commandOverride.trim().length > 0) {
    return runShell(opts.commandOverride.trim(), kbRoot);
  }
  const script = path.join(kbRoot, "knowledge", "_mcp", "scripts", "lint-standalone.js");
  if (!fs.existsSync(script)) {
    return Promise.resolve({ violations: [], ran: false });
  }
  return runProcess(process.execPath, [script], kbRoot);
}

function runShell(
  command: string,
  cwd: string
): Promise<{ violations: LintViolation[]; ran: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolve({ violations: [], ran: false, error: err.message });
    });
    child.on("close", () => {
      resolve({ violations: parseLintStderr(stderr), ran: true });
    });
  });
}

function runProcess(
  bin: string,
  args: string[],
  cwd: string
): Promise<{ violations: LintViolation[]; ran: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolve({ violations: [], ran: false, error: err.message });
    });
    child.on("close", () => {
      resolve({ violations: parseLintStderr(stderr), ran: true });
    });
  });
}
