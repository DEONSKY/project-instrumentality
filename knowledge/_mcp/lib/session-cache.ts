// TTL-based session cache. Used by paginated tools (import, export) to keep
// per-source state between successive runTool calls without making the caller
// pass the same big payload back every time.
//
// Each entry stores `{ created, ...userFields }`; entries past `ttlMs` are
// evicted on access. Get/set/clear are O(1); no background timer.
//
// Optional disk persistence (opt-in via `persistDir`): entries are mirrored to
// `<persistDir>/<sha1(key)>.json` so a long-running paginated flow survives an
// MCP-server restart. `created` is re-stamped on every `set`, so callers that
// `set` after each step get an *idle* timeout rather than an absolute one —
// the session can't expire mid-flight as long as it keeps making progress.
// Callers that mutate the returned object in place must `set` it again to
// persist the change (and refresh the idle clock).

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// Stored entries are the caller's value plus the cache's own `created` stamp.
type CacheEntry<T> = T & { created: number }

interface SessionCache<T> {
  get: (key: string) => CacheEntry<T> | null
  set: (key: string, value: T) => void
  clear: (key: string) => void
}

function createSessionCache<T extends object = Record<string, unknown>>(
  ttlMs: number,
  { persistDir = null }: { persistDir?: string | null } = {}
): SessionCache<T> {
  const store = new Map<string, CacheEntry<T>>()

  function diskPath(key: string): string | null {
    if (!persistDir) return null
    const hash = crypto.createHash('sha1').update(String(key)).digest('hex')
    return path.join(persistDir, `${hash}.json`)
  }

  function writeDisk(key: string, entry: CacheEntry<T>): void {
    const p = diskPath(key)
    if (!p) return
    try {
      fs.mkdirSync(persistDir as string, { recursive: true })
      fs.writeFileSync(p, JSON.stringify(entry), 'utf8')
    } catch { /* best-effort; in-memory copy still authoritative */ }
  }

  function removeDisk(key: string): void {
    const p = diskPath(key)
    if (!p) return
    try { fs.rmSync(p, { force: true }) } catch { /* ignore */ }
  }

  function loadDisk(key: string): CacheEntry<T> | null {
    const p = diskPath(key)
    if (!p || !fs.existsSync(p)) return null
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as CacheEntry<T>
    } catch { return null }
  }

  function get(key: string): CacheEntry<T> | null {
    let entry = store.get(key) ?? null
    if (!entry) {
      // Rehydrate from disk (survives an MCP-server restart that wiped memory).
      entry = loadDisk(key)
      if (entry) store.set(key, entry)
    }
    if (!entry) return null
    if (Date.now() - entry.created > ttlMs) {
      store.delete(key)
      removeDisk(key)
      return null
    }
    return entry
  }

  function set(key: string, value: T): void {
    const entry = { ...value, created: Date.now() } as CacheEntry<T>
    store.set(key, entry)
    writeDisk(key, entry)
  }

  function clear(key: string): void {
    store.delete(key)
    removeDisk(key)
  }

  return { get, set, clear }
}

export { createSessionCache }
