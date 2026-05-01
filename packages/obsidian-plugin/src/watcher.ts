import * as fs from "node:fs";
import * as path from "node:path";

const DEBOUNCE_MS = 300;
const POLL_FALLBACK_MS = 5000;

/**
 * Watches `<kbRoot>/knowledge/sync/` for changes. Obsidian's Vault.on('modify')
 * doesn't fire reliably for files written by external processes (kb-mcp's Node
 * process), so we use Node's fs.watch directly. A 5s poll fallback covers
 * platforms where fs.watch is unreliable (network FS, sandboxed installs).
 */
export class SyncWatcher {
  private fsWatcher: fs.FSWatcher | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMtimeSum = 0;

  constructor(private kbRoot: string, private onChange: () => void) {}

  start(): void {
    const dir = path.join(this.kbRoot, "knowledge", "sync");
    if (!fs.existsSync(dir)) return;

    try {
      this.fsWatcher = fs.watch(dir, { recursive: true }, () => this.scheduleFire());
    } catch {
      // recursive may not be supported on some platforms — fall back to non-recursive
      try {
        this.fsWatcher = fs.watch(dir, () => this.scheduleFire());
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

  stop(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
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
