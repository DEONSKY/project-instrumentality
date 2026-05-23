import { execFile, execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  CodeDriftEntry,
  ConformPending,
  KbDriftEntry,
  StandardDefinition,
  StandardsDriftEntry,
  PromotionEntry,
  StatusSummary,
  PatternAudit,
} from "./types.js";
import { readCodeDrift } from "./parsers/code-drift.js";
import { readKbDrift } from "./parsers/kb-drift.js";
import {
  readStandardsDrift,
  readStandardsBacklog,
} from "./parsers/standards-drift.js";
import { readConformPending } from "./parsers/conform-pending.js";
import { readPromotions } from "./parsers/promotions.js";
import { runLint } from "./parsers/lint.js";
import { readStandardDefinition, findRule } from "./parsers/standards.js";
import { readDriftLog, currentAndPreviousMonth } from "./parsers/drift-log.js";
import { getSubmoduleStatus } from "./submodule-status.js";
import { getHooksStatus } from "./hooks-status.js";

const execFileP = promisify(execFile);

function enrichWithStandards(
  kbRoot: string,
  drifts: StandardsDriftEntry[],
  promotions: PromotionEntry[],
  conformPendings: (ConformPending | null)[]
): void {
  const defs = new Map<string, StandardDefinition | null>();
  const lookup = (id: string | null): StandardDefinition | null => {
    if (!id) return null;
    if (defs.has(id)) return defs.get(id)!;
    const def = readStandardDefinition(kbRoot, id);
    defs.set(id, def);
    return def;
  };
  for (const e of drifts) {
    const def = lookup(e.standardId);
    e.resolvedRule = findRule(def, e.ruleId);
    e.resolvedStandard = def
      ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
      : null;
  }
  for (const e of promotions) {
    const def = lookup(e.standardId);
    e.resolvedRule = findRule(def, e.ruleId);
    e.resolvedStandard = def
      ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
      : null;
  }
  for (const p of conformPendings) {
    if (!p) continue;
    for (const r of p.requested) {
      const def = lookup(r.standard_id);
      r.resolvedStandard = def
        ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath }
        : null;
      r.resolvedRules = def
        ? r.rule_ids.map((id) => findRule(def, id)).filter((x): x is NonNullable<typeof x> => !!x)
        : [];
    }
  }
}

async function getCurrentHeadShort(kbRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", ["rev-parse", "--short", "HEAD"], {
      cwd: kbRoot,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export interface GetStatusOptions {
  /** Skip the lint subprocess (faster; useful when callers already have it). */
  skipLint?: boolean;
  /** Override lint command (e.g. "npx kb-lint") for consumer projects. */
  lintCommand?: string;
  /**
   * Live mode — instead of reading the committed `knowledge/sync/*.md` files,
   * spawn the live-status runner which calls `drift.runTool({ readonly: true })`
   * and `conform.runTool({ readonly: true })` and overlays the in-memory
   * entries onto the returned summary. Use this for the watcher in the
   * extension: the dashboard reflects the working-tree state without writing
   * to disk. Falls back to disk-read silently if no runner script is found.
   */
  live?: boolean;
  /**
   * Absolute path to a fallback live-status.js to spawn when the consumer
   * project doesn't vendor `knowledge/_mcp/` in tree. The VS Code extension
   * passes its bundled runner here (`<extensionPath>/dist/runner/scripts/
   * live-status.js`) so the overlay works in any project, vendored or not.
   * Vendored path always wins when both exist — it's the version that
   * matches the consumer's own sync semantics.
   */
  bundledRunnerPath?: string;
}

export async function getStatus(
  kbRoot: string,
  opts: GetStatusOptions = {}
): Promise<StatusSummary> {
  const liveOverlay = opts.live
    ? await runLiveStatus(kbRoot, opts.bundledRunnerPath)
    : null;

  const [
    codeDrift,
    kbDrift,
    standardsDriftCurrent,
    standardsBacklog,
    currentPending,
    asp,
    promotions,
    driftLogEvents,
    lint,
    head,
    submodules,
    hooks,
  ] = await Promise.all([
    Promise.resolve(readCodeDrift(kbRoot)),
    Promise.resolve(readKbDrift(kbRoot)),
    Promise.resolve(readStandardsDrift(kbRoot)),
    Promise.resolve(readStandardsBacklog(kbRoot)),
    Promise.resolve(readConformPending(kbRoot, "current")),
    Promise.resolve(readConformPending(kbRoot, "aspirational")),
    Promise.resolve(readPromotions(kbRoot)),
    Promise.resolve(readDriftLog(kbRoot, currentAndPreviousMonth())),
    opts.skipLint
      ? Promise.resolve({ violations: [], ran: false })
      : runLint(kbRoot, { commandOverride: opts.lintCommand }),
    getCurrentHeadShort(kbRoot),
    getSubmoduleStatus(kbRoot).catch(() => null),
    getHooksStatus(kbRoot).catch(() => null),
  ]);

  // Overlay live computations onto the disk-read summaries when present.
  // Baseline stays from the disk-read header; only the entry sets are
  // swapped. Standards-drift current + backlog are kept separate by the
  // runner (entries[] vs backlogEntries[]) so the existing merge logic
  // below still applies.
  const codeDriftFinal = liveOverlay
    ? { entries: liveOverlay.codeEntries, baseline: codeDrift.baseline }
    : codeDrift;
  const kbDriftFinal = liveOverlay
    ? { entries: liveOverlay.kbEntries, baseline: kbDrift.baseline }
    : kbDrift;
  const standardsCurrentFinal = liveOverlay
    ? { entries: liveOverlay.standardsEntries, baseline: standardsDriftCurrent.baseline }
    : standardsDriftCurrent;
  const standardsBacklogFinal = liveOverlay
    ? { entries: liveOverlay.backlogEntries, baseline: standardsBacklog.baseline }
    : standardsBacklog;

  // Merge current-mode standards-drift entries with aspirational backlog
  // entries. Each carries its own `mode` discriminator so the UI can render
  // them differently (advisory chip + demoted opacity for aspirational).
  // Baseline tracking stays with the current-mode queue — that's the
  // PR-blocking artifact; backlog is advisory.
  const standardsDrift = {
    entries: [...standardsCurrentFinal.entries, ...standardsBacklogFinal.entries],
    baseline: standardsCurrentFinal.baseline,
  };

  const stale = (recorded: string) =>
    head !== null && recorded.length > 0 && !head.startsWith(recorded) && !recorded.startsWith(head);

  const conformCurrent = currentPending
    ? { ...currentPending, staleAgainstHead: stale(currentPending.head_sha_short) }
    : null;
  const conformAspirational = asp
    ? { ...asp, staleAgainstHead: stale(asp.head_sha_short) }
    : null;

  enrichWithStandards(kbRoot, standardsDrift.entries, promotions, [
    currentPending,
    asp,
  ]);

  const driftCount =
    codeDriftFinal.entries.length + kbDriftFinal.entries.length + standardsDrift.entries.length;
  const conformPendingCount =
    (conformCurrent?.requested.length ?? 0) +
    (conformAspirational?.requested.length ?? 0);
  const lintErrors = lint.violations.filter((v) => v.severity === "error").length;
  const lintWarnings = lint.violations.filter((v) => v.severity === "warn").length;

  return {
    kbRoot,
    currentHeadShort: head,
    codeDrift: codeDriftFinal,
    kbDrift: kbDriftFinal,
    standardsDrift,
    conformPending: { current: conformCurrent, aspirational: conformAspirational },
    promotions,
    driftLogEvents,
    lint,
    submodules: submodules ?? undefined,
    hooks: hooks ?? undefined,
    totals: {
      drifts: driftCount,
      conformPending: conformPendingCount,
      promotions: promotions.length,
      lintErrors,
      lintWarnings,
      grand: driftCount + conformPendingCount + promotions.length + lintErrors + lintWarnings,
    },
    livePatterns: liveOverlay ? liveOverlay.codePatterns : null,
    patternAudit: liveOverlay ? liveOverlay.patternAudit : null,
  };
}

// ── Live-status runner ───────────────────────────────────────────────────────
//
// Spawns the readonly live-status runner. Probe order:
//   1. `<kbRoot>/knowledge/_mcp/scripts/live-status.js` (vendored — wins
//      when present so consumer drift logic stays in lockstep with the
//      consumer's own kb-mcp version).
//   2. `bundledRunnerPath` from the caller (the VS Code extension's
//      shipped copy under `<extensionPath>/dist/runner/scripts/`).
// Returns null when neither resolves or on any spawn error — caller falls
// back to the disk-read state silently.

interface LiveOverlay {
  headSha: string | null;
  codeEntries: CodeDriftEntry[];
  kbEntries: KbDriftEntry[];
  standardsEntries: StandardsDriftEntry[];
  backlogEntries: StandardsDriftEntry[];
  /**
   * Code-path globs from `knowledge/_rules.md` so the extension can scope its
   * source-file watcher to the patterns the detector actually cares about.
   * Null when rules loading failed in the runner — the extension falls back
   * to a workspace-wide watcher.
   */
  codePatterns: string[] | null;
  /** Mechanical pattern audit findings from the live drift call. */
  patternAudit: PatternAudit | null;
}

// Cache the resolved node binary path — looking it up via a login shell
// is ~50ms on first call but later calls hit this cache. `null` means we
// successfully looked it up but didn't find one (don't re-search); a
// string is the resolved absolute path.
let resolvedNodeBinary: string | null | undefined = undefined;

/**
 * Find a real Node binary when our own runtime is Electron (Obsidian),
 * since `process.execPath` points at the Electron app which intercepts
 * CLI invocations. Tries platform-appropriate install paths and version
 * managers, then falls back to an interactive shell so version-manager
 * setup in the user's profile/rc files is honored.
 *
 * Supports Linux, macOS, and Windows. Honors nvm / nvm-windows / volta /
 * fnm / asdf / Homebrew / system installers. Returns null if no node
 * binary is found anywhere — caller falls back to the disk-read snapshot.
 */
function findNodeBinary(): string | null {
  if (resolvedNodeBinary !== undefined) return resolvedNodeBinary;
  const isWindows = process.platform === "win32";
  const home = process.env.HOME || process.env.USERPROFILE || "";

  // Direct path candidates, platform-keyed. Cheapest check.
  const candidates: string[] = [];
  if (isWindows) {
    candidates.push(
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Program Files (x86)\\nodejs\\node.exe"
    );
    if (home) {
      candidates.push(
        path.join(home, "AppData", "Local", "Volta", "bin", "node.exe"),
        path.join(home, "AppData", "Roaming", "fnm", "aliases", "default", "node.exe"),
        path.join(home, "AppData", "Local", "Programs", "node", "node.exe"),
        path.join(home, "scoop", "shims", "node.exe")
      );
    }
  } else {
    candidates.push(
      "/usr/local/bin/node",
      "/usr/bin/node",
      "/opt/homebrew/bin/node", // Homebrew on Apple Silicon
      "/snap/bin/node"          // Snap on Linux
    );
    if (home) {
      candidates.push(
        path.join(home, ".volta", "bin", "node"),
        path.join(home, ".fnm", "aliases", "default", "bin", "node"),
        path.join(home, ".asdf", "shims", "node"),
        path.join(home, ".local", "bin", "node")
      );
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      resolvedNodeBinary = c;
      return c;
    }
  }

  // nvm-managed installs use a versioned subdir — pick the highest version.
  // Layout differs by platform: nvm (Unix) → ~/.nvm/versions/node/vX.Y.Z/bin/node,
  // nvm-windows → %APPDATA%\nvm\vX.Y.Z\node.exe.
  const nvmInfo = home
    ? isWindows
      ? {
          dir: path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "nvm"),
          exe: "node.exe",
          binSegments: [] as string[],
        }
      : {
          dir: path.join(home, ".nvm", "versions", "node"),
          exe: "node",
          binSegments: ["bin"],
        }
    : null;
  if (nvmInfo) {
    try {
      if (fs.existsSync(nvmInfo.dir)) {
        const versions = fs
          .readdirSync(nvmInfo.dir)
          .filter((v) => /^v\d/.test(v))
          .sort((a, b) => {
            const ap = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
            const bp = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
            for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
              const av = ap[i] ?? 0;
              const bv = bp[i] ?? 0;
              if (av !== bv) return bv - av; // descending
            }
            return 0;
          });
        for (const v of versions) {
          const candidate = path.join(nvmInfo.dir, v, ...nvmInfo.binSegments, nvmInfo.exe);
          if (fs.existsSync(candidate)) {
            resolvedNodeBinary = candidate;
            return candidate;
          }
        }
      }
    } catch {
      // nvm dir unreadable — fall through to shell lookup
    }
  }

  // Last resort: ask the user's own shell. On Unix we spawn an interactive
  // bash (so ~/.bashrc is sourced — that's where nvm typically wires
  // itself). On Windows we use `where node` via cmd.exe.
  const shellAttempts: { cmd: string; args: string[] }[] = isWindows
    ? [{ cmd: "cmd.exe", args: ["/c", "where node"] }]
    : [
        { cmd: "/bin/bash", args: ["-ic", "command -v node"] },
        { cmd: "/bin/bash", args: ["-lc", "command -v node"] },
        { cmd: "/bin/sh", args: ["-lc", "command -v node"] },
      ];
  for (const { cmd, args } of shellAttempts) {
    try {
      const out = execFileSync(cmd, args, {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      // `where` may print multiple matches; take the first.
      const first = out.split(/\r?\n/)[0].trim();
      if (first && fs.existsSync(first)) {
        resolvedNodeBinary = first;
        return first;
      }
    } catch {
      // shell missing, command failed, or timeout — try next variant
    }
  }

  resolvedNodeBinary = null;
  return null;
}

function runLiveStatus(
  kbRoot: string,
  bundledRunnerPath: string | undefined
): Promise<LiveOverlay | null> {
  const vendored = path.join(kbRoot, "knowledge", "_mcp", "scripts", "live-status.js");
  let script: string | null = null;
  const vendoredExists = fs.existsSync(vendored);
  const bundledExists = !!(bundledRunnerPath && fs.existsSync(bundledRunnerPath));
  if (vendoredExists) {
    script = vendored;
  } else if (bundledExists) {
    script = bundledRunnerPath!;
  }
  // Detect whether we're running inside an Electron app (Obsidian plugin
  // host) versus a plain Node process (VS Code extension host). Obsidian
  // intercepts CLI invocations of its own binary and prints "Command
  // line interface is not enabled" instead of executing the script as
  // Node — even with ELECTRON_RUN_AS_NODE=1, since the env var is
  // stripped or ignored before reaching the runtime. So when we're in
  // Electron, shell out to `node` on PATH; otherwise use process.execPath
  // (which is already Node).
  const isElectron = !!(process.versions as { electron?: string }).electron;
  const binary = isElectron ? findNodeBinary() : process.execPath;
  // eslint-disable-next-line no-console
  console.log(
    "[instrumentality] runLiveStatus resolve:",
    JSON.stringify({
      kbRoot,
      vendored,
      vendoredExists,
      bundledRunnerPath: bundledRunnerPath ?? null,
      bundledExists,
      chosen: script,
      isElectron,
      binary,
    })
  );
  if (!script) return Promise.resolve(null);
  if (!binary) {
    // eslint-disable-next-line no-console
    console.error(
      "[instrumentality] no node binary found — install Node.js or launch the host from a shell with `node` on PATH."
    );
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const child = spawn(binary, [script], {
      cwd: kbRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[instrumentality] live-status spawn error:", err);
      resolve(null);
    });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (stderr.trim()) {
        // eslint-disable-next-line no-console
        console.warn("[instrumentality] live-status stderr:", stderr.trim());
      }
      if (!trimmed) {
        // eslint-disable-next-line no-console
        console.error("[instrumentality] live-status produced no stdout (exit", code, ")");
        return resolve(null);
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.error) {
          // eslint-disable-next-line no-console
          console.error("[instrumentality] live-status error:", parsed.error);
          return resolve(null);
        }
        // eslint-disable-next-line no-console
        console.log(
          "[instrumentality] live-status parsed keys:",
          Object.keys(parsed),
          "patternAudit=",
          parsed.patternAudit
            ? (Array.isArray(parsed.patternAudit.findings)
                ? `findings(${parsed.patternAudit.findings.length})`
                : "(findings not array)")
            : "null"
        );
        // Tag standards entries with their mode so the existing merge logic
        // and `mode`-aware UI rendering still works. The runner returns them
        // un-tagged since they come straight from the in-memory state.
        const tagMode = (entries: StandardsDriftEntry[], mode: "current" | "aspirational") =>
          entries.map((e) => ({ ...e, mode }));
        resolve({
          headSha: parsed.headSha ?? null,
          codeEntries: parsed.codeEntries ?? [],
          kbEntries: parsed.kbEntries ?? [],
          standardsEntries: tagMode(parsed.standardsEntries ?? [], "current"),
          backlogEntries: tagMode(parsed.backlogEntries ?? [], "aspirational"),
          codePatterns: Array.isArray(parsed.codePatterns) ? parsed.codePatterns : null,
          patternAudit: parsed.patternAudit && Array.isArray(parsed.patternAudit.findings)
            ? parsed.patternAudit
            : null,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[instrumentality] live-status JSON parse failed:",
          err,
          "first 500 chars of stdout:",
          trimmed.slice(0, 500)
        );
        resolve(null);
      }
    });
  });
}
