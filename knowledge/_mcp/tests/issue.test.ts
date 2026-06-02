const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ORIGINAL_CWD = process.cwd()

function mkTempKb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-issue-test-'))
  fs.mkdirSync(path.join(dir, 'knowledge', 'sync'), { recursive: true })
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

// ── F49: scope path separator sanitization ────────────────────────────────────

test('plan({scope: "specs/features", content}) writes flattened filename without nested dir', withKb(async () => {
  // Re-require inside the test so the chdir takes effect for the require cache.
  // Actually, since issue.js uses KB_ROOT = 'knowledge' (relative), it'll read
  // from the chdir'd cwd. Safe to require at top of file.
  const { runTool } = require('../tools/issue')
  const result = await runTool({
    command: 'plan',
    scope: 'specs/features',
    content: '# fake yaml content\nitems: []\n',
  })
  assert.ok(result.written, 'plan returned written:true')
  // F49 fix: scope's "/" must be replaced with "-" so the path is
  // outbound/YYYY-MM-DD-specs-features.yaml, NOT
  // outbound/YYYY-MM-DD-specs/features.yaml
  assert.ok(
    result.file_path && !result.file_path.includes('specs/features.yaml'),
    `file_path should not nest specs/features.yaml — got ${result.file_path}`
  )
  assert.ok(
    result.file_path && result.file_path.endsWith('-specs-features.yaml'),
    `file_path should end with -specs-features.yaml — got ${result.file_path}`
  )
  // No nested dir was created
  const outboundDir = path.join('knowledge', 'sync', 'outbound')
  if (fs.existsSync(outboundDir)) {
    const entries = fs.readdirSync(outboundDir, { withFileTypes: true })
    const subdirs = entries.filter(e => e.isDirectory())
    assert.equal(subdirs.length, 0, 'no subdirectories created under outbound/')
  }
}))

test('plan({scope: "simple"}) writes file without modification', withKb(async () => {
  const { runTool } = require('../tools/issue')
  const result = await runTool({
    command: 'plan',
    scope: 'simple',
    content: '# content',
  })
  assert.ok(result.written)
  assert.match(result.file_path, /-simple\.yaml$/, 'simple scope passes through')
}))

test('plan({scope: "a\\b\\c"}) sanitizes backslashes too', withKb(async () => {
  const { runTool } = require('../tools/issue')
  const result = await runTool({
    command: 'plan',
    scope: 'a\\b\\c',
    content: '# content',
  })
  assert.ok(result.written)
  // Backslash sanitized to -
  assert.match(result.file_path, /-a-b-c\.yaml$/, 'backslashes converted to hyphens')
}))
