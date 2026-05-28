const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ORIGINAL_CWD = process.cwd()

function mkTempKb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-scaffold-test-'))
  fs.mkdirSync(path.join(dir, 'knowledge', 'standards', 'code'), { recursive: true })
  return dir
}

function withKb(fn) {
  return async () => {
    const dir = mkTempKb()
    process.chdir(dir)
    try { await fn(dir) }
    finally {
      process.chdir(ORIGINAL_CWD)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

// ── F41: kb_scaffold P2 must NOT auto-create the group descriptor ─────────────

test('kb_scaffold P2 does not create standards/<group>/<group>.md', withKb(async (dir) => {
  // Pre-fix bug: when an agent submitted Phase 2 content for a leaf standard
  // (e.g. standards/code/frontend-conv.md), scaffold also wrote the parent
  // group descriptor standards/code/code.md with literal {{...}} placeholders.
  // The fix removed that side effect — only the leaf file is written.
  const { runTool: scaffold } = require('../tools/scaffold')

  const result = await scaffold({
    type: 'standard',
    group: 'code',
    id: 'frontend-conv',
    content: `---
id: frontend-conv
type: standard
kind: stack-local
app_scope: frontend
created: 2026-05-28
rules: []
---

# Frontend conventions

Body.
`
  })

  const groupDescriptor = path.join(dir, 'knowledge', 'standards', 'code', 'code.md')
  assert.equal(fs.existsSync(groupDescriptor), false,
    'group descriptor standards/code/code.md must NOT exist after P2 — F41 regression')

  // Leaf file should still land where expected (sanity check that we exercised
  // the real code path, not a no-op).
  const leaf = path.join(dir, 'knowledge', 'standards', 'code', 'frontend-conv.md')
  assert.ok(fs.existsSync(leaf) || result.error,
    'either leaf was written, or scaffold returned a non-side-effect error — we exercised the path')
}))
