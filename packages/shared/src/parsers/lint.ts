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

/**
 * Spawn the standalone lint script with cwd set to kbRoot. The script is
 * hardcoded to look for ./knowledge — the cwd is what makes it work.
 * Always exits 0; violations are on stderr.
 */
export function runLint(
  kbRoot: string
): Promise<{ violations: LintViolation[]; ran: boolean; error?: string }> {
  const script = path.join(kbRoot, "knowledge", "_mcp", "scripts", "lint-standalone.js");
  if (!fs.existsSync(script)) {
    // Consumer repos won't have the MCP source in tree. Treat as "unavailable",
    // not an error — the user runs lint via their installed kb-mcp command.
    return Promise.resolve({ violations: [], ran: false });
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: kbRoot,
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
