/**
 * Locate the kb-mcp tool scripts (`drift.js`, `conform.js`) for the publish
 * pipeline. Consumer repos that use kb-mcp via an MCP client don't usually
 * have the source in-tree — they install it via npm (per-project or global)
 * or point at an out-of-tree checkout via $KB_MCP_HOME.
 *
 * Both the VS Code extension and the Obsidian plugin call this so the
 * "Publish Drift Queue" action works regardless of where kb-mcp lives.
 *
 * Lookup order (first match wins):
 *   1. $KB_MCP_HOME/knowledge/_mcp/tools/                 (explicit override)
 *   2. <kbRoot>/knowledge/_mcp/tools/                     (in-source — kb-mcp dev mode)
 *   3. <kbRoot>/node_modules/kb-mcp/knowledge/_mcp/tools/
 *   4. <kbRoot>/node_modules/instrumentality-mcp/knowledge/_mcp/tools/
 *   5. <npm root -g>/kb-mcp/knowledge/_mcp/tools/
 *
 * Returns `null` if nothing resolves. Caller is expected to surface
 * `paths_checked` in the user-visible error so the user can see exactly
 * which locations were tried.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export type McpToolsSource =
  | "env"
  | "workspace"
  | "node_modules"
  | "node_modules_alt"
  | "global";

export interface ResolvedKbMcp {
  driftScript: string;
  conformScript: string;
  source: McpToolsSource;
}

// `npm root -g` shells out — cache for the process lifetime so repeat
// resolutions don't pay the spawn cost. Only computed when earlier steps fail.
let cachedNpmRootGlobal: string | null | undefined = undefined;

function npmRootGlobal(): string | null {
  if (cachedNpmRootGlobal !== undefined) return cachedNpmRootGlobal;
  try {
    // Windows: npm.cmd ; *nix: npm. execFileSync resolves PATH for both.
    const bin = process.platform === "win32" ? "npm.cmd" : "npm";
    const out = execFileSync(bin, ["root", "-g"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    cachedNpmRootGlobal = out.trim() || null;
  } catch {
    // npm not on PATH, timeout, or any other failure — treat as "no global".
    cachedNpmRootGlobal = null;
  }
  return cachedNpmRootGlobal;
}

function bothExist(driftAbs: string, conformAbs: string): boolean {
  // Drift is required; conform is optional in some installs. The handler
  // accepts that conform may be missing — keep the same semantics here so we
  // don't reject an install just because conform.js isn't present.
  return fs.existsSync(driftAbs);
}

function candidateFrom(toolsDir: string): { drift: string; conform: string } {
  return {
    drift: path.join(toolsDir, "drift.js"),
    conform: path.join(toolsDir, "conform.js"),
  };
}

export function resolveKbMcp(kbRoot: string): ResolvedKbMcp | null {
  const tried: Array<{ source: McpToolsSource; toolsDir: string }> = [];

  if (process.env.KB_MCP_HOME) {
    const dir = path.join(process.env.KB_MCP_HOME, "knowledge", "_mcp", "tools");
    tried.push({ source: "env", toolsDir: dir });
    const c = candidateFrom(dir);
    if (bothExist(c.drift, c.conform)) {
      return { driftScript: c.drift, conformScript: c.conform, source: "env" };
    }
  }

  const workspace = path.join(kbRoot, "knowledge", "_mcp", "tools");
  tried.push({ source: "workspace", toolsDir: workspace });
  {
    const c = candidateFrom(workspace);
    if (bothExist(c.drift, c.conform)) {
      return { driftScript: c.drift, conformScript: c.conform, source: "workspace" };
    }
  }

  const node_modules = path.join(
    kbRoot,
    "node_modules",
    "kb-mcp",
    "knowledge",
    "_mcp",
    "tools"
  );
  tried.push({ source: "node_modules", toolsDir: node_modules });
  {
    const c = candidateFrom(node_modules);
    if (bothExist(c.drift, c.conform)) {
      return { driftScript: c.drift, conformScript: c.conform, source: "node_modules" };
    }
  }

  const node_modules_alt = path.join(
    kbRoot,
    "node_modules",
    "instrumentality-mcp",
    "knowledge",
    "_mcp",
    "tools"
  );
  tried.push({ source: "node_modules_alt", toolsDir: node_modules_alt });
  {
    const c = candidateFrom(node_modules_alt);
    if (bothExist(c.drift, c.conform)) {
      return {
        driftScript: c.drift,
        conformScript: c.conform,
        source: "node_modules_alt",
      };
    }
  }

  const globalRoot = npmRootGlobal();
  if (globalRoot) {
    const dir = path.join(globalRoot, "kb-mcp", "knowledge", "_mcp", "tools");
    tried.push({ source: "global", toolsDir: dir });
    const c = candidateFrom(dir);
    if (bothExist(c.drift, c.conform)) {
      return { driftScript: c.drift, conformScript: c.conform, source: "global" };
    }
  }

  return null;
}

/**
 * Build a one-line, human-readable summary of where the resolver looked.
 * Useful for diagnostics in user-visible "publish failed" messages so the
 * user knows what to fix (set $KB_MCP_HOME, `npm install kb-mcp`, etc.).
 */
export function describePathsChecked(kbRoot: string): string[] {
  const out: string[] = [];
  if (process.env.KB_MCP_HOME) {
    out.push(
      `$KB_MCP_HOME → ${path.join(
        process.env.KB_MCP_HOME,
        "knowledge",
        "_mcp",
        "tools",
        "drift.js"
      )}`
    );
  } else {
    out.push("$KB_MCP_HOME (not set)");
  }
  out.push(`workspace → ${path.join(kbRoot, "knowledge", "_mcp", "tools", "drift.js")}`);
  out.push(
    `node_modules/kb-mcp → ${path.join(
      kbRoot,
      "node_modules",
      "kb-mcp",
      "knowledge",
      "_mcp",
      "tools",
      "drift.js"
    )}`
  );
  out.push(
    `node_modules/instrumentality-mcp → ${path.join(
      kbRoot,
      "node_modules",
      "instrumentality-mcp",
      "knowledge",
      "_mcp",
      "tools",
      "drift.js"
    )}`
  );
  const globalRoot = npmRootGlobal();
  out.push(
    globalRoot
      ? `npm -g → ${path.join(
          globalRoot,
          "kb-mcp",
          "knowledge",
          "_mcp",
          "tools",
          "drift.js"
        )}`
      : "npm -g (unavailable)"
  );
  return out;
}
