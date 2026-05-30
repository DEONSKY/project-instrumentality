const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runTool } = require('../tools/analyze')

// kb_analyze previously emitted up to 10 sample_files per group by default,
// which on large monorepos dominated the response. The default is now a
// per-group summary (counts only); sample_files are opt-in via include_samples.

const ORIGINAL_CWD = process.cwd()
function withProject(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-analyze-test-'))
    // Matches the default code_path_patterns (src/validators/**).
    fs.mkdirSync(path.join(dir, 'src/validators'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src/validators/email.ts'), 'export const v = 1\n')
    fs.writeFileSync(path.join(dir, 'src/validators/phone.ts'), 'export const v = 2\n')
    process.chdir(dir)
    try { await fn() } finally { process.chdir(ORIGINAL_CWD) }
  }
}

test('runTool default returns per-group summaries with no sample_files', withProject(async () => {
  const res = await runTool({})
  assert.ok(Array.isArray(res.inventory) && res.inventory.length > 0, 'inventory populated')
  for (const item of res.inventory) {
    assert.ok(!('sample_files' in item), `group ${item.kb_target} should omit sample_files by default`)
    assert.ok('file_count' in item, 'summary keeps file_count')
  }
}))

test('runTool include_samples:true restores capped sample_files', withProject(async () => {
  const res = await runTool({ include_samples: true })
  const withSamples = res.inventory.find(i => Array.isArray(i.sample_files) && i.sample_files.length > 0)
  assert.ok(withSamples, 'at least one group carries sample_files when opted in')
}))
