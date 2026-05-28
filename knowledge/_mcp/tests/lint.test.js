const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ORIGINAL_CWD = process.cwd()
const LINT_STANDALONE = path.join(__dirname, '..', 'scripts', 'lint-standalone.js')

function mkTempKb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-lint-test-'))
  fs.mkdirSync(path.join(dir, 'knowledge', 'standards'), { recursive: true })
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

function runLintStandalone() {
  // lint-standalone writes findings via console.error/warn (stderr). Merge
  // 2>&1 so the test captures both error+warn lines via stdout.
  try {
    const out = execSync(`node ${LINT_STANDALONE} 2>&1`, { encoding: 'utf8' })
    return { stdout: out, exitCode: 0 }
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status }
  }
}

// ── F52: sentinel detection for [object Object] in frontmatter ────────────────

test('lint-standalone flags [object Object] as a frontmatter map key', withKb(async () => {
  fs.writeFileSync(
    path.join('knowledge', 'standards', 'broken.md'),
    `---
id: broken
type: standard
app_scope:
  '[object Object]': null
created: 2026-05-28
---

body
`
  )
  const { stdout } = runLintStandalone()
  assert.match(stdout, /\[object Object\]/, 'sentinel detection in output')
  assert.match(stdout, /sentinel/i, 'message mentions "sentinel"')
  // lint-standalone is non-blocking by design (exits 0 even on errors —
  // pre-commit hook design). The signal is in the printed output, not exit code.
}))

test('lint-standalone flags [object Object] as a frontmatter string value', withKb(async () => {
  fs.writeFileSync(
    path.join('knowledge', 'standards', 'broken2.md'),
    `---
id: broken2
type: standard
app_scope: all
created: 2026-05-28
topic: "[object Object]"
---

body
`
  )
  const { stdout } = runLintStandalone()
  assert.match(stdout, /\[object Object\]/, 'sentinel in string value flagged')
})
)

test('lint-standalone does NOT flag clean frontmatter', withKb(async () => {
  fs.writeFileSync(
    path.join('knowledge', 'standards', 'clean.md'),
    `---
id: clean
type: standard
app_scope: all
created: 2026-05-28
---

body
`
  )
  const { stdout } = runLintStandalone()
  assert.equal(
    stdout.includes('[object Object]'),
    false,
    'no false-positive on clean frontmatter'
  )
}))
