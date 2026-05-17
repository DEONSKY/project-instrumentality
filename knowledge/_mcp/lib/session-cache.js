// TTL-based session cache. Used by paginated tools (import, export) to keep
// per-source state between successive runTool calls without making the caller
// pass the same big payload back every time.
//
// Each entry stores `{ created, ...userFields }`; entries past `ttlMs` are
// evicted on access. Get/set/clear are O(1); no background timer.

function createSessionCache(ttlMs) {
  const store = new Map()

  function get(key) {
    const session = store.get(key)
    if (!session) return null
    if (Date.now() - session.created > ttlMs) {
      store.delete(key)
      return null
    }
    return session
  }

  function set(key, value) {
    store.set(key, { ...value, created: Date.now() })
  }

  function clear(key) {
    store.delete(key)
  }

  return { get, set, clear }
}

module.exports = { createSessionCache }
