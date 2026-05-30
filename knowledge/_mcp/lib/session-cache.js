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

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function createSessionCache(ttlMs, { persistDir = null } = {}) {
  const store = new Map()

  function diskPath(key) {
    if (!persistDir) return null
    const hash = crypto.createHash('sha1').update(String(key)).digest('hex')
    return path.join(persistDir, `${hash}.json`)
  }

  function writeDisk(key, entry) {
    const p = diskPath(key)
    if (!p) return
    try {
      fs.mkdirSync(persistDir, { recursive: true })
      fs.writeFileSync(p, JSON.stringify(entry), 'utf8')
    } catch { /* best-effort; in-memory copy still authoritative */ }
  }

  function removeDisk(key) {
    const p = diskPath(key)
    if (!p) return
    try { fs.rmSync(p, { force: true }) } catch { /* ignore */ }
  }

  function loadDisk(key) {
    const p = diskPath(key)
    if (!p || !fs.existsSync(p)) return null
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch { return null }
  }

  function get(key) {
    let entry = store.get(key)
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

  function set(key, value) {
    const entry = { ...value, created: Date.now() }
    store.set(key, entry)
    writeDisk(key, entry)
  }

  function clear(key) {
    store.delete(key)
    removeDisk(key)
  }

  return { get, set, clear }
}

module.exports = { createSessionCache }
