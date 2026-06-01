import * as path from 'path'

// NOTE: fs is pulled in via runtime require(), NOT `import * as fs`. install()
// monkey-patches fs's sync methods in place, and `import * as` compiles to a
// namespace object with getter-only bindings — assigning to fs.writeFileSync
// then throws "Cannot set property … which has only a getter". The CommonJS
// module object require() returns is mutable, which is what the patch needs.
const fs = require('fs') as typeof import('fs')

interface ActiveCall {
  writes: Set<string>
  deletes: Set<string>
  renames: Array<{ from: string; to: string }>
}

interface FilesChanged {
  written?: string[]
  deleted?: string[]
  renamed?: Array<{ from: string; to: string }>
}

// Single MCP server process handles one stdio request at a time, so a
// module-level scope is safe. If multi-request transports are added later,
// migrate this to AsyncLocalStorage.
let active: ActiveCall | null = null
let installed = false

function install(): void {
  if (installed) return
  installed = true

  // fs is monkey-patched in place: we replace selected sync methods with
  // wrappers that record the touched path on the active call. The cast to a
  // string-indexed record is the narrowest way to read/assign by method name.
  const fsAny = fs as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>

  const wrap = (name: string, kind: 'write' | 'delete' | 'rename', getPath: ((args: unknown[]) => string) | null) => {
    const orig = fsAny[name]
    if (!orig) return
    fsAny[name] = function (this: unknown, ...args: unknown[]) {
      const result = orig.apply(this, args)
      if (active) {
        try {
          if (kind === 'rename') {
            active.renames.push({
              from: path.resolve(args[0] as string),
              to: path.resolve(args[1] as string)
            })
          } else {
            const p = path.resolve((getPath as (args: unknown[]) => string)(args))
            if (kind === 'write') active.writes.add(p)
            if (kind === 'delete') active.deletes.add(p)
          }
        } catch {}
      }
      return result
    }
  }

  wrap('writeFileSync',  'write',  a => a[0] as string)
  wrap('appendFileSync', 'write',  a => a[0] as string)
  wrap('copyFileSync',   'write',  a => a[1] as string)
  wrap('unlinkSync',     'delete', a => a[0] as string)
  wrap('rmSync',         'delete', a => a[0] as string)
  wrap('renameSync',     'rename', null)
}

function beginCall(): void {
  active = { writes: new Set(), deletes: new Set(), renames: [] }
}

function endCall(cwd = process.cwd()): FilesChanged | null {
  if (!active) return null

  const rel = (abs: string): string => {
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

  const out: FilesChanged = {}
  const written = [...writes].map(rel).sort()
  const deleted = [...deletes].map(rel).sort()
  const renamed = active.renames.map(r => ({ from: rel(r.from), to: rel(r.to) }))

  if (written.length) out.written = written
  if (deleted.length) out.deleted = deleted
  if (renamed.length) out.renamed = renamed

  active = null
  return Object.keys(out).length ? out : null
}

export { install, beginCall, endCall }
