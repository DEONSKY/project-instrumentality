const fs = require('fs')
const path = require('path')

// Single MCP server process handles one stdio request at a time, so a
// module-level scope is safe. If multi-request transports are added later,
// migrate this to AsyncLocalStorage.
let active = null
let installed = false

function install() {
  if (installed) return
  installed = true

  const wrap = (name, kind, getPath) => {
    const orig = fs[name]
    if (!orig) return
    fs[name] = function (...args) {
      const result = orig.apply(this, args)
      if (active) {
        try {
          if (kind === 'rename') {
            active.renames.push({
              from: path.resolve(args[0]),
              to: path.resolve(args[1])
            })
          } else {
            const p = path.resolve(getPath(args))
            if (kind === 'write') active.writes.add(p)
            if (kind === 'delete') active.deletes.add(p)
          }
        } catch {}
      }
      return result
    }
  }

  wrap('writeFileSync',  'write',  a => a[0])
  wrap('appendFileSync', 'write',  a => a[0])
  wrap('copyFileSync',   'write',  a => a[1])
  wrap('unlinkSync',     'delete', a => a[0])
  wrap('rmSync',         'delete', a => a[0])
  wrap('renameSync',     'rename', null)
}

function beginCall() {
  active = { writes: new Set(), deletes: new Set(), renames: [] }
}

function endCall(cwd = process.cwd()) {
  if (!active) return null

  const rel = abs => {
    const r = path.relative(cwd, abs)
    return r === '' ? path.basename(abs) : r
  }

  // A path written then deleted in the same call is reported as deleted only.
  // A path deleted then re-written is reported as written only.
  const writes = new Set(active.writes)
  const deletes = new Set(active.deletes)
  for (const p of writes) if (deletes.has(p)) {
    // Order isn't tracked; favor the final state by leaving both and letting
    // the agent see both signals. Most write-then-delete patterns are temp
    // files we'd want to surface anyway.
  }

  const out = {}
  const written = [...writes].map(rel).sort()
  const deleted = [...deletes].map(rel).sort()
  const renamed = active.renames.map(r => ({ from: rel(r.from), to: rel(r.to) }))

  if (written.length) out.written = written
  if (deleted.length) out.deleted = deleted
  if (renamed.length) out.renamed = renamed

  active = null
  return Object.keys(out).length ? out : null
}

module.exports = { install, beginCall, endCall }
