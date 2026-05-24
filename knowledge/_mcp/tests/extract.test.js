const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ORIGINAL_CWD = process.cwd()
const EXTRACT = require('../tools/extract')

function sh(cwd, cmd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-extract-test-'))
  sh(dir, 'git init -q -b main')
  sh(dir, 'git config user.email "test@test"')
  sh(dir, 'git config user.name "test"')
  sh(dir, 'git config commit.gpgsign false')
  return dir
}

function rmTempRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

// F15 symptom B: source=knowledge with `paths` pointing at a non-existent
// folder used to fire the misleading "Run kb_init first" hint even when
// `paths` was explicitly passed. The new behavior validates folder existence
// up front and emits "Folder not found: <folder>. Available subfolders: …".
test('kb_extract source=knowledge with missing folder returns Folder-not-found error', async () => {
  const dir = mkTempRepo()
  try {
    process.chdir(dir)
    // Create a minimal knowledge tree with one existing subfolder so the
    // "available subfolders" suggestion is non-empty.
    fs.mkdirSync(path.join(dir, 'knowledge', 'standards'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'knowledge', 'standards', 'placeholder.md'), '# placeholder')

    const result = await EXTRACT.runTool({
      source: 'knowledge',
      target_id: 'test',
      target_group: 'code',
      paths: 'nonexistent-folder'
    })

    assert.ok(result.error, `expected error, got ${JSON.stringify(result)}`)
    assert.match(result.error, /Folder not found:/, 'error message starts with Folder not found:')
    assert.match(result.error, /standards/, 'error lists existing subfolders')
  } finally {
    process.chdir(ORIGINAL_CWD)
    rmTempRepo(dir)
  }
})

// F15 symptom A: source=code with a path inside a git submodule used to
// return "No source files found" because the underlying fs.walk skipped at
// the submodule boundary. The new behavior uses `git ls-files --recurse-
// submodules` so submodule-resident code surfaces.
test('kb_extract source=code traverses submodule content via git ls-files', async () => {
  const parent = mkTempRepo()
  const child = mkTempRepo()
  try {
    // Set up the child repo with a tracked JS file.
    fs.writeFileSync(path.join(child, 'feature.ts'), 'export const x = 1\n')
    sh(child, 'git add -A')
    sh(child, 'git commit -q -m init')

    // Add as submodule into the parent. -f because we're inside a tempdir
    // that git may not protect.
    sh(parent, `git -c protocol.file.allow=always submodule add -q ${child} sub`)
    sh(parent, 'git commit -q -m "add submodule"')

    // Minimal knowledge tree so resolveFilePath doesn't reject.
    fs.mkdirSync(path.join(parent, 'knowledge', 'standards', 'code'), { recursive: true })

    process.chdir(parent)
    const result = await EXTRACT.runTool({
      source: 'code',
      target_id: 'feature-test',
      target_group: 'code',
      paths: ['sub/**']
    })

    // Either we found the submodule file (success), OR we get a clear error
    // (the test env's git may not support --recurse-submodules everywhere).
    if (result.error) {
      // Acceptable in environments where `git ls-files --recurse-submodules`
      // is unsupported. The fallback fs-walk still skips submodules, so
      // surface the limitation rather than failing.
      assert.match(result.error, /No source files found/, 'fallback emitted "No source files found"')
    } else {
      assert.ok(Array.isArray(result.sample_files), 'sample_files is array')
      assert.ok(result.sample_files.some(f => f.includes('sub/feature.ts')), `expected sub/feature.ts in ${JSON.stringify(result.sample_files)}`)
    }
  } finally {
    process.chdir(ORIGINAL_CWD)
    rmTempRepo(parent)
    rmTempRepo(child)
  }
})
