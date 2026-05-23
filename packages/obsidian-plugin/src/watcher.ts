import * as fs from "node:fs";
import * as path from "node:path";

// 500ms tradeoff: long enough to coalesce a formatter-on-save burst (and
// to soak up the live drift readonly pass which takes 200–500ms), short
// enough that the view still feels responsive to a single save.
const DEBOUNCE_MS = 500;
const POLL_FALLBACK_MS = 5000;

// Paths whose changes are uninteresting for drift detection. Filtered
// inside the kbRoot fallback watcher so an `npm install` or a build
// doesn't fire a refresh per artifact. Match against the watcher's
// `filename` arg (relative to kbRoot) — uses leading-segment check so
// `node_modules` matches but `path/node_modules/foo` also matches.
const IGNORED_DIR_SEGMENTS = [".git", "node_modules", "dist", "build", ".obsidian", "out", "target"];

/**
 * Extract the watchable directory root from a glob pattern. `src/**`/*.ts`
 * → `src`; `packages/**` → `packages`; `*.md` → `.`. We don't try to be
 * clever about character classes or extglobs — anything with a wildcard
 * character collapses to its prefix. The Node fs.watch call is recursive,
 * so watching the root is enough to catch every matched file.
 */
function patternBaseDir(pattern: string): string {
  const idx = pattern.search(/[*?[]/);
  if (idx === -1) return path.dirname(pattern) || ".";
  const head = pattern.slice(0, idx);
  // Trim trailing slash and any partial path segment after the last `/`.
  const slash = head.lastIndexOf("/");
  return slash === -1 ? "." : head.slice(0, slash);
}

/**
 * Watches `<kbRoot>/knowledge/sync/` for changes. Obsidian's Vault.on('modify')
 * doesn't fire reliably for files written by external processes (kb-mcp's Node
 * process), so we use Node's fs.watch directly. A 5s poll fallback covers
 * platforms where fs.watch is unreliable (network FS, sandboxed installs).
 *
 * Also accepts a list of code-path globs from `knowledge/_rules.md` so
 * source-file edits (anywhere matched by those globs) fire a debounced
 * refresh — that's what keeps the "Uncommitted preview" sub-groups current.
 */
export class SyncWatcher {
  private fsWatcher: fs.FSWatcher | null = null;
  private extraWatchers: fs.FSWatcher[] = [];
  private codeRootWatchers: Map<string, fs.FSWatcher> = new Map();
  // Always-on recursive watcher on kbRoot. Mirrors the VS Code __fallback__
  // approach — if _rules.md patterns don't match how this platform observes
  // a file (commonly across submodule git boundaries) saves still fire a
  // debounced refresh. Noise dirs are filtered inside the callback.
  private rootFallbackWatcher: fs.FSWatcher | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMtimeSum = 0;

  constructor(private kbRoot: string, private onChange: () => void) {}

  /**
   * `extraPaths` is an optional list of additional files to watch — used
   * for submodule gitdir HEAD files so branch switches inside a
   * submodule refresh the UI without polling. The set is reset on every
   * call: pass the current desired set and we'll diff against existing
   * watchers, disposing any that aren't requested anymore.
   */
  start(extraPaths: string[] = []): void {
    const dir = path.join(this.kbRoot, "knowledge", "sync");
    if (fs.existsSync(dir) && !this.fsWatcher) {
      try {
        this.fsWatcher = this.safeWatch(dir, { recursive: true }, () =>
          this.scheduleFire()
        );
      } catch {
        // recursive may not be supported on some platforms — fall back to non-recursive
        try {
          this.fsWatcher = this.safeWatch(dir, {}, () => this.scheduleFire());
        } catch {
          // give up on fs.watch entirely; rely on poll
        }
      }
      this.lastMtimeSum = this.computeMtimeSum(dir);
      this.pollHandle = setInterval(() => {
        const next = this.computeMtimeSum(dir);
        if (next !== this.lastMtimeSum) {
          this.lastMtimeSum = next;
          this.scheduleFire();
        }
      }, POLL_FALLBACK_MS);
    }

    this.reconcileExtraWatchers(extraPaths);
    this.ensureRootFallback();
  }

  /**
   * fs.watch wrapper that attaches an 'error' handler so a runtime watch
   * failure (e.g. ENOSPC when the inotify limit is hit, or a deleted
   * directory) doesn't crash the plugin process. The watcher is closed
   * on error so subsequent refreshes don't keep re-firing.
   */
  private safeWatch(
    target: string,
    opts: fs.WatchOptions,
    listener: fs.WatchListener<string>
  ): fs.FSWatcher {
    const w = fs.watch(target, opts, listener);
    w.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.warn(`[instrumentality] watch error on ${target}:`, err);
      try { w.close(); } catch { /* already closed */ }
    });
    return w;
  }

  /**
   * Install (or re-install) the always-on recursive watcher. Scoped to
   * `<kbRoot>/knowledge/` — NOT the project root — because watching the
   * project root recursively on Linux installs an inotify watch on
   * every subdirectory, including `.git/modules/<sub>/...` for repos
   * with submodules. That trivially exhausts `fs.inotify.max_user_watches`
   * and throws ENOSPC.
   *
   * Source-file edits are covered by `setCodePatterns` (one targeted
   * watcher per code_path_patterns base dir), which is bounded and
   * predictable.
   *
   * On platforms where `filename` is null (some macOS versions) the
   * filter is skipped and we accept extra refresh ticks — the 500ms
   * debounce makes those harmless.
   */
  private ensureRootFallback(): void {
    if (this.rootFallbackWatcher) return;
    const knowledgeDir = path.join(this.kbRoot, "knowledge");
    if (!fs.existsSync(knowledgeDir)) return;
    const handler = (_event: fs.WatchEventType, filename: string | Buffer | null) => {
      if (filename) {
        const rel = typeof filename === "string" ? filename : filename.toString("utf8");
        const head = rel.split(path.sep)[0];
        if (IGNORED_DIR_SEGMENTS.includes(head)) return;
        for (const seg of IGNORED_DIR_SEGMENTS) {
          if (rel.includes(path.sep + seg + path.sep)) return;
        }
      }
      this.scheduleFire();
    };
    try {
      this.rootFallbackWatcher = this.safeWatch(
        knowledgeDir,
        { recursive: true },
        handler
      );
    } catch (err) {
      // Recursive not supported, or ENOSPC at install time — skip silently.
      // Per-pattern watchers from setCodePatterns still cover source edits;
      // the 5s poll catches missed sync-folder events.
      // eslint-disable-next-line no-console
      console.warn("[instrumentality] root fallback watcher disabled:", err);
    }
  }

  /**
   * Refresh the set of extra (submodule HEAD) watchers. Cheaper than
   * stopping and restarting the whole watcher, which would re-arm the
   * poll loop too.
   */
  setExtraPaths(extraPaths: string[]): void {
    this.reconcileExtraWatchers(extraPaths);
  }

  /**
   * Refresh the set of code-path roots being watched. Each glob from
   * `_rules.md`'s `code_path_patterns[].paths` is collapsed to its base
   * directory and that directory is watched recursively. Passing `null`
   * or an empty array tears down all source-root watchers — the
   * sync-folder watcher and poll fallback still cover queue file changes,
   * just not the rapid-fire preview path.
   */
  setCodePatterns(patterns: string[] | null): void {
    const want = new Set<string>();
    if (Array.isArray(patterns)) {
      for (const p of patterns) {
        if (typeof p !== "string" || !p) continue;
        const baseRel = patternBaseDir(p);
        const abs = path.resolve(this.kbRoot, baseRel);
        if (fs.existsSync(abs)) want.add(abs);
      }
    }

    // Drop watchers we no longer want.
    for (const [abs, w] of this.codeRootWatchers) {
      if (!want.has(abs)) {
        try { w.close(); } catch { /* already closed */ }
        this.codeRootWatchers.delete(abs);
      }
    }
    // Install fresh watchers for new roots. Recursive mode is required for
    // patterns like `src/**/*.ts`; if it isn't supported, fall back to a
    // single-level watch — the 5s poll fallback still catches missed events.
    for (const abs of want) {
      if (this.codeRootWatchers.has(abs)) continue;
      try {
        const w = this.safeWatch(abs, { recursive: true }, () => this.scheduleFire());
        this.codeRootWatchers.set(abs, w);
      } catch {
        try {
          const w = this.safeWatch(abs, {}, () => this.scheduleFire());
          this.codeRootWatchers.set(abs, w);
        } catch { /* skip — poll fallback will catch it */ }
      }
    }
  }

  private reconcileExtraWatchers(extraPaths: string[]): void {
    // Tear down the previous set and rebuild. The path count is tiny
    // (one HEAD per submodule + the parent) so churn is negligible.
    for (const w of this.extraWatchers) {
      try {
        w.close();
      } catch {
        // ignore — already closed
      }
    }
    this.extraWatchers = [];
    for (const p of extraPaths) {
      try {
        if (!fs.existsSync(p)) continue;
        this.extraWatchers.push(this.safeWatch(p, {}, () => this.scheduleFire()));
      } catch {
        // file vanished between existsSync and watch — ignore
      }
    }
  }

  stop(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.rootFallbackWatcher) {
      try { this.rootFallbackWatcher.close(); } catch { /* already closed */ }
      this.rootFallbackWatcher = null;
    }
    for (const w of this.extraWatchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
    this.extraWatchers = [];
    for (const w of this.codeRootWatchers.values()) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.codeRootWatchers.clear();
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Expose the debounced fire path so callers (e.g. main.ts wiring
   * Vault.on('modify')) can hook into the same coalescing loop instead
   * of racing it from a parallel timer.
   */
  fire(): void {
    this.scheduleFire();
  }

  private scheduleFire(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      try {
        this.onChange();
      } catch (err) {
        console.error("[instrumentality] onChange error:", err);
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Sum of mtimes for files in the sync dir. Cheap fingerprint that detects
   * any modification without parsing or hashing.
   */
  private computeMtimeSum(dir: string): number {
    let sum = 0;
    try {
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) {
            try {
              sum += fs.statSync(full).mtimeMs;
            } catch {
              /* file deleted between readdir and stat — ignore */
            }
          }
        }
      };
      walk(dir);
    } catch {
      // dir gone or unreadable — return 0; next poll will pick up changes
    }
    return sum;
  }
}
