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
 *   1. options.explicitPath                               (settings override, e.g. instrumentality.kbMcpPath)
 *   2. $KB_MCP_HOME/knowledge/_mcp/tools/                 (env override)
 *   3. <kbRoot>/knowledge/_mcp/tools/                     (in-source — kb-mcp dev mode)
 *   4. <kbRoot>/node_modules/kb-mcp/knowledge/_mcp/tools/
 *   5. <kbRoot>/node_modules/instrumentality-mcp/knowledge/_mcp/tools/
 *   6. <npm root -g>/kb-mcp/knowledge/_mcp/tools/
 *   7. options.bundledToolsDir                            (extension-bundled fallback)
 *
 * Returns `null` if nothing resolves. Caller is expected to surface
 * `paths_checked` in the user-visible error so the user can see exactly
 * which locations were tried.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export type McpToolsSource =
  | "setting"
  | "env"
  | "workspace"
  | "node_modules"
  | "node_modules_alt"
  | "global"
  | "bundled";

export interface ResolvedKbMcp {
  driftScript: string;
  conformScript: string;
  source: McpToolsSource;
}

export interface ResolveKbMcpOptions {
  /**
   * Explicit path from a user-facing setting (e.g. VS Code's
   * `instrumentality.kbMcpPath` or the Obsidian plugin's equivalent). Can
   * point at either the kb-mcp repo root or directly at `.../knowledge/_mcp/tools`.
   * Checked first — always wins when set.
   */
  explicitPath?: string;
  /**
   * Path to the kb-mcp tools bundled inside the extension itself (built by
   * `scripts/bundle-runner`). Checked last so user-installed copies still
   * win, but provides a zero-config default for shipped installs.
   */
  bundledToolsDir?: string;
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
  void conformAbs;
  return fs.existsSync(driftAbs);
}

function candidateFrom(toolsDir: string): { drift: string; conform: string } {
  return {
    drift: path.join(toolsDir, "drift.js"),
    conform: path.join(toolsDir, "conform.js"),
  };
}

// Normalize a caller-supplied explicit path that may point at either:
//   - the kb-mcp repo root (we append knowledge/_mcp/tools)
//   - the tools directory directly (drift.js sits in it)
// Returns the resolved tools directory if either layout is valid; null otherwise.
function normalizeExplicitToolsDir(rawPath: string): string | null {
  if (fs.existsSync(path.join(rawPath, "drift.js"))) return rawPath;
  const nested = path.join(rawPath, "knowledge", "_mcp", "tools");
  if (fs.existsSync(path.join(nested, "drift.js"))) return nested;
  return null;
}

export function resolveKbMcp(
  kbRoot: string,
  options: ResolveKbMcpOptions = {}
): ResolvedKbMcp | null {
  const tried: Array<{ source: McpToolsSource; toolsDir: string }> = [];

  if (options.explicitPath) {
    const dir = normalizeExplicitToolsDir(options.explicitPath);
    if (dir) {
      const c = candidateFrom(dir);
      tried.push({ source: "setting", toolsDir: dir });
      if (bothExist(c.drift, c.conform)) {
        return { driftScript: c.drift, conformScript: c.conform, source: "setting" };
      }
    }
  }

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

  // Bundled fallback — checked LAST so any user-installed copy (setting, env,
  // workspace, node_modules, global) wins. This makes shipped extensions work
  // with zero config while still letting devs override with a source checkout.
  if (options.bundledToolsDir) {
    const c = candidateFrom(options.bundledToolsDir);
    tried.push({ source: "bundled", toolsDir: options.bundledToolsDir });
    if (bothExist(c.drift, c.conform)) {
      return { driftScript: c.drift, conformScript: c.conform, source: "bundled" };
    }
  }

  return null;
}

/**
 * Build a one-line, human-readable summary of where the resolver looked.
 * Useful for diagnostics in user-visible "publish failed" messages so the
 * user knows what to fix (set $KB_MCP_HOME, `npm install kb-mcp`, etc.).
 */
export function describePathsChecked(
  kbRoot: string,
  options: ResolveKbMcpOptions = {}
): string[] {
  const out: string[] = [];
  if (options.explicitPath) {
    out.push(`setting (instrumentality.kbMcpPath) → ${options.explicitPath}`);
  } else {
    out.push("setting (instrumentality.kbMcpPath) (not set)");
  }
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
  if (options.bundledToolsDir) {
    out.push(
      `bundled → ${path.join(options.bundledToolsDir, "drift.js")}`
    );
  } else {
    out.push("bundled (extension did not provide a path)");
  }
  return out;
}
