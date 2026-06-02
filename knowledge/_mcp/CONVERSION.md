# kb-mcp JavaScript → TypeScript conversion

Single source of truth for the kb-mcp TS migration. **To resume in any session:**
*"continue the TS conversion per `knowledge/_mcp/CONVERSION.md`"* — read this file,
find the first phase with unchecked boxes, convert that batch with the procedure
below, run the phase gate, tick the boxes + log the `any` count, commit.

Plan of record: `~/.claude/plans/i-want-to-convert-giggly-shore.md`.

## Goals & hard rules
- **Behaviour-preserving only.** No logic change in a conversion commit. Quality
  refactors are Phase 8, clearly separated.
- **Keep all file detail.** Every comment + JSDoc prose stays verbatim. JSDoc
  `@param`/`@returns` get *promoted* into TS types; the explanatory text remains.
- **Match existing style:** no semicolons, single quotes (kb-mcp style, ≠ packages/shared).
- **No unnecessary `any`.** Create real types; use `unknown` + narrowing for truly
  dynamic data; generics where natural. `any` only as a last resort with an inline
  justification — prefer a local ambient `.d.ts`. Log the count per batch (target 0).
- **Existing tests must stay green, unchanged**, at every step (294 tests via the
  tsx runner). Tests are the behaviour-preservation proof.

## The export rule (the #1 correctness trap)
During migration, un-converted `.js` files `require()` converted modules. The
compiled CJS shape must stay byte-compatible. Verified empirically:

| Current JS | Use in TS | Compiles to | `require()` sees |
|---|---|---|---|
| `module.exports = { a, b }` | `export { a, b }` *(or `export function a`)* | `exports.a`, `exports.b` | `.a` ✓ |
| `module.exports = singleValue` | `export = singleValue` | `module.exports = …` | value ✓ |
| — | ❌ `export default { a }` | `exports.default = {a}` | `.a` is **undefined** ✗ |

**Never use `export default`.** (This is exactly why the lebab codemod was rejected —
its `commonjs` transform emits `export default` for `module.exports = {…}`.)

For default imports of CJS deps (`const x = require('dep')`), `esModuleInterop`
(on) lets `import x from 'dep'` work; namespace style `import * as x from 'dep'`
also works (see server.ts → fs-tracker).

Keep **dynamic/conditional/lazy `require()`** (variable paths, in-function lazy
loads, `require.resolve`) as runtime `require` — don't force them to static `import`.

**Gotcha — monkey-patching a module needs `require`, not `import * as`.** Code
that mutates a module's exports in place (e.g. fs-tracker reassigns
`fs.writeFileSync`) must pull the module via `const fs = require('fs') as typeof
import('fs')`. A namespace import (`import * as fs from 'fs'`) compiles to
getter-only bindings, so the assignment throws "Cannot set property … which has
only a getter" at runtime (caught by fs-tracker.test in Phase 1).

## Mechanical engine: none (manual + LLM)
Phase-0 audition rejected both codemods: **lebab** emits the breaking
`export default` form (would need per-file post-fixing, defeating the point);
**ts-migrate** injects `any`/`@ts-nocheck` (against the no-`any` goal). Conversions
are mechanical enough by hand — server.ts proved this. `madge` is kept (re-check
cycles as batches land); `lebab` was removed from devDeps.

## Per-file procedure
1. `git mv x.js x.ts`.
2. Rewrite module syntax per the export rule. Keep comments + no-semicolon/
   single-quote style (verify in the diff — it should be type-only).
3. `npm run typecheck`; fix this file's errors with real types — promote JSDoc,
   import from `@instrumentality/shared`, or add a local `src/types/` interface.
4. Drive the file's `any`/`as any`/`@ts-*` count to 0 (justify any residual inline).
5. Untyped deps: add `@types/*` if it exists, else a minimal ambient decl in
   `src/types/ambient.d.ts`. (MCP SDK 0.5.0 **ships its own .d.ts** — no shim needed.)
6. `npm test` — stays green; behaviour identical.
7. Tick the box + log the `any` count below; commit (one batch per commit).

## Phase gate (run before checking off a phase)
- `npm run typecheck` → clean
- `npm run build` → emits dist/, `node server.js` (shim) boots & lists 22 tools
- `npm test` → 294 green
- Phases 5–6 also: `cd packages/vscode-extension && npm run build` succeeds and
  the bundled `dist/runner/scripts/live-status.js` emits valid JSON; CI drift path
  (`node dist/scripts/drift-ci-check.js`) runs.

## Environment facts (verified Phase 0)
- Node v24, TypeScript 5.9, tsc target ES2022 / module commonjs / strict.
- `tsconfig.json`: rootDir `.` → outDir `dist`, `allowJs: true`, `checkJs: false`,
  `declaration: false`. **No `isolatedModules`** (lets `export =` work cleanly).
- `knowledge/_mcp/dist/` and `node_modules/` are gitignored. `npm run build` does
  `rm -rf dist` first.
- **Zero circular dependencies** (madge, 68 files) — leaf-first order is safe.
- tsc emits only `.js`/`.json`; **data assets** (`presets/*.yaml`, `schemas/*.json`,
  `_templates/*.md`, `*.sh`) are NOT emitted. `lib/pkg-paths.js` resolves them from
  the source tree (strips a trailing `dist` segment) so source & dist resolve alike.

---

## Phase 0 — Tooling & scaffolding ✅ DONE
- [x] devDeps (typescript, tsx, @types/{node,js-yaml,uuid}, madge) + `@instrumentality/shared` file: dep
- [x] tsconfig.json; scripts build/typecheck; test runner → `node --test --import tsx`
- [x] `server.js` → `server.ts` (typed SDK + fs-tracker; tools via runtime require until Phase 6); root `server.js` shim → `dist/server.js`; `main` → dist
- [x] Untrack `knowledge/_mcp/node_modules`
- [x] `lib/pkg-paths.js` helper; routed asset sites: status.js (repo-root, **was broken in dist**), kb-paths, prompts, upgrade, init
- [x] CI (`kb-drift-check.yml`): build shared+kb-mcp, typecheck gate, run `dist/scripts/drift-ci-check.js`
- [x] bundle-runner copies kb-mcp `dist/`; esbuild builds shared+kb-mcp first; fixed `build-tool-catalog.cjs` (server.js→server.ts)
- [x] madge (0 cycles); engine audition (manual/LLM chosen)
- [x] CONVERSION.md (this file)

`any` count: server.ts uses `unknown`/typed shapes (0 bare any). pkg-paths: 0.

## Phase 1 — lib/ leaf utilities (no intra-lib deps) ✅ DONE
Added src/types/rules.ts (DepthPolicy/Rules) and src/types/graph.ts (Graph/
GraphEntry/EdgeRule) — reusable shapes for later phases.
- [x] budget
- [x] depth
- [x] fs-tracker  *(monkey-patches fs → uses `require('fs')`, not `import * as`; see Gotcha)*
- [x] fs-walk
- [x] git-ops
- [x] graph
- [x] html-to-md-headings
- [x] issue-keywords
- [x] kb-constants
- [x] manifest
- [x] matter-utils
- [x] md-to-runs  *(lazy `require('docx')` kept, typed via `import('docx')`)*
- [x] mentions
- [ ] pkg-paths  *(intentionally left as clean CJS .js — created in Phase 0; converts in a later sweep, 0 deps so order-independent)*
- [x] promotion-ledger
- [x] secrets
- [x] session-cache
- [x] submodule-sweep
- [x] tag-model
- [x] types  *(named `export { inferType }` — 4 callers destructure)*

`any` count: 0 (justified narrowing casts only: generic spread in session-cache,
guarded Map.get in tag-model/promotion-ledger, dynamic fs indexing in fs-tracker)

## Phase 2 — lib/ with intra-lib deps ✅ DONE
- [x] agent-rules
- [ ] kb-paths  *(still clean CJS .js like pkg-paths — routed, leaf, converts in a later sweep)*
- [x] patterns  *(14 test require sites — heavily tested, good safety net)*
- [x] rule-detect
- [x] rules  *(expanded src/types/rules.ts to the full Rules API)*
- [x] standards
- [x] tag-extract
- [x] git-hooks  *(F1 RESOLVED — see below)*
- [x] pattern-audit
- [x] prompts
- [x] template-filler

`any` count: 0 (documented casts only at dynamic-YAML / graph-entry boundaries)

**F1 resolved:** git-hooks' script/server refs (`__dirname/../scripts/lint-standalone.js`,
`../server.js`, `../tools/reindex.js`) already resolve correctly under dist/ — tsc
emits those `.js`. The only gap was the non-JS asset `scripts/kb-feature.sh`, which
tsc doesn't emit. Added `scripts/copy-assets.cjs` (run after tsc in the build) to
copy it into `dist/scripts/` preserving the exec bit. tsconfig now excludes
`**/*.cjs` so build scripts don't leak into dist. Data dirs (presets/schemas/
_templates) still resolve from source via pkg-paths — not copied.

## Phase 3 — tools/ simpler half ✅ DONE (15/15)
- [x] status  *(imports getStatus type from @instrumentality/shared)*
- [x] schema
- [x] history
- [x] ask  *(get still CJS → runtime require with typed result slice)*
- [x] inventory
- [x] sub
- [x] issue  *(get still CJS → runtime require with typed result slice)*
- [x] autotag
- [x] autorelate
- [x] upgrade
- [x] migrate
- [x] init  *(large file; lazy requires typed via `as typeof import(...)`)*
- [x] scaffold
- [x] reindex  *(internal; consumes typed LintResult)*
- [x] lint  *(internal; exports LintResult)*

Added `src/types/tool.ts` (ToolDefinition/JsonSchema/RunTool/ToolResult).
Also converted the two deferred CJS leaves **kb-paths + pkg-paths** during this
phase (scaffold's named imports forced it) — **all of lib/ is now TS too.**

Pattern for tools that call the not-yet-converted Phase-4 tools (get/write):
runtime `require('./x')` cast to a typed result slice — no `any`. Lazy intra-
tool requires that are already `.ts` use `as typeof import('./x')`.

`any` count: 0 (documented casts only at MCP-arg / dynamic-YAML boundaries)

## Phase 4 — tools/ complex half (+ subdirs)
- [ ] get
- [ ] drift  + drift/kb-match, drift/baseline, drift/queue
- [ ] conform + conform/queue
- [ ] impact
- [ ] import + import/images, import/extract
- [ ] export
- [ ] analyze
- [ ] extract
- [ ] write
- [ ] **F2:** update `packages/shared/scripts/build-tool-catalog.cjs` to require
      compiled `dist/tools/<file>.js` (it currently requires `tools/<file>.js`,
      which won't be requirable once tools are `.ts`). Implies kb-mcp builds
      before shared's catalog step.

`any` count: ___

## Phase 5 — drivers/ + scripts/ (extension + CI critical)
- [ ] scripts/live-status   *(extension spawns this; gate: bundled runner JSON)*
- [ ] scripts/lint-standalone
- [ ] scripts/drift-ci-check *(CI runs the compiled copy)*
- [ ] scripts/screenshot
- [ ] drivers/kb-conflict
- [ ] drivers/kb-reindex
Gate also: extension `npm run build` + live-status overlay JSON; CI drift path.

`any` count: ___

## Phase 6 — server.ts finalisation
- [ ] Replace the 22 runtime `require('./tools/*')` with typed imports once tools
      are `.ts`; drop the interim `ToolModule` shim if a shared type fits.
Gate: full MCP smoke (ListTools + a read-only tool call).

`any` count: ___

## Phase 7 — tests/
- [ ] Rename `tests/*.test.js` → `*.test.ts` (runner already tsx) **and** update the
      `test` script glob `tests/*.test.js` → `tests/*.test.ts` in the same commit.
- [ ] Optional: `tsconfig.test.json` to type-check tests.

## Phase 8 — tighten & optional quality
- [ ] `allowJs: false`; final strict sweep; drive any residual `any`/escape hatches to 0.
- [ ] Optional, separated LLM quality refactors on suitable parts.

---

## Deferred follow-ups (do NOT lose these)
- **F1 (Phase 2, git-hooks.js):** installed hook scripts bake absolute paths via
  `__dirname` and reference `scripts/kb-feature.sh` + `tools/reindex.js`. tsc won't
  emit the `.sh`. Route through pkg-paths AND add a build step to copy non-JS hook
  assets into dist (or resolve them from the source tree like pkg-paths does).
- **F2 (Phase 4, build-tool-catalog.cjs): ✅ RESOLVED.** Triggered when get.ts
  landed (node can't require `.ts`). Fixed by registering `tsx/cjs` in the script
  and requiring the tool **source** (`.ts`, `.js` fallback) — NOT compiled
  dist/tools, which would create a build cycle (shared build → kb-mcp build →
  shared .d.ts). Loading a tool module is side-effect-free and its `import type`
  is erased, so no prior build of either package is needed. Generated catalog is
  byte-identical; extension build verified green.
- **F3 (cosmetic):** pre-existing lint ERROR in
  `knowledge/standards/contracts/mcp-tool-response.md` (bad YAML front-matter).
  Unrelated to this migration; the pre-commit hook only warns. Fix opportunistically.
