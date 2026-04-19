const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ORIGINAL_CWD = process.cwd()
const HISTORY = require('../tools/history')

function sh(cwd, cmd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-history-test-'))
  sh(dir, 'git init -q -b main')
  sh(dir, 'git config user.email "test@test"')
  sh(dir, 'git config user.name "test"')
  sh(dir, 'git config commit.gpgsign false')
  return dir
}

function rmTempRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function withRepo(fn) {
  return async (t) => {
    const dir = mkTempRepo()
    process.chdir(dir)
    try {
      await fn(dir, t)
    } finally {
      process.chdir(ORIGINAL_CWD)
      rmTempRepo(dir)
    }
  }
}

test('returns commit history with file-scoped numstat', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nv1\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "add login feature"')

  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nv1\n\n## New section\n\nmore\n')
  writeFile(dir, 'unrelated.md', 'noise\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "mixed commit touching multiple files"')

  const result = await HISTORY.runTool({ file: 'knowledge/features/login.md' })

  assert.equal(result.file, 'knowledge/features/login.md')
  assert.equal(result.commits.length, 2)
  // Most recent commit first
  assert.equal(result.commits[0].subject, 'mixed commit touching multiple files')
  assert.equal(result.commits[1].subject, 'add login feature')
  // file_changes reflects only the target file, not the unrelated one
  assert.match(result.commits[0].file_changes, /^\+\d+ -\d+$/)
  // No patch by default
  assert.equal(result.commits[0].patch, undefined)
  assert.deepEqual(result.drift_log_mentions, [])
}))

test('include_diff: true returns patch bodies', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/features/login.md', 'line1\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "init"')

  writeFile(dir, 'knowledge/features/login.md', 'line1\nline2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "add line"')

  const result = await HISTORY.runTool({ file: 'knowledge/features/login.md', include_diff: true })

  assert.ok(result.commits[0].patch, 'patch should be present when include_diff is true')
  assert.match(result.commits[0].patch, /\+line2/)
}))

test('collects drift-log mentions that reference the file', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/features/login.md', '# Login\n')
  writeFile(dir, 'knowledge/sync/drift-log/2026-04.md', [
    '# April drift log',
    '',
    '## auth rename',
    '',
    'Renamed AuthGuard → SessionGuard in features/login.md because of legal review.',
    '',
    '## unrelated entry',
    '',
    'This one mentions only the billing feature.',
    ''
  ].join('\n'))
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "seed"')

  const result = await HISTORY.runTool({ file: 'knowledge/features/login.md' })

  assert.equal(result.drift_log_mentions.length, 1)
  assert.equal(result.drift_log_mentions[0].section, 'auth rename')
  assert.match(result.drift_log_mentions[0].excerpt, /SessionGuard/)
}))

test('follows renames via git --follow', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/features/old-name.md', '# Old\n\ncontent\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "add old-name"')

  sh(dir, 'git mv knowledge/features/old-name.md knowledge/features/new-name.md')
  sh(dir, 'git commit -q -m "rename to new-name"')

  const result = await HISTORY.runTool({ file: 'knowledge/features/new-name.md' })
  // --follow should surface both the rename commit and the original creation
  assert.equal(result.commits.length, 2)
}))

test('returns error when file param is missing', async () => {
  const result = await HISTORY.runTool({})
  assert.ok(result.error)
  assert.match(result.error, /file is required/)
})

test('accepts bare path without knowledge/ prefix', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/decisions/auth.md', '# Auth\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "add auth decision"')

  const result = await HISTORY.runTool({ file: 'decisions/auth.md' })
  assert.equal(result.file, 'knowledge/decisions/auth.md')
  assert.equal(result.commits.length, 1)
}))

test('limit caps number of commits returned', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/features/login.md', '0\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "c0"')
  for (let i = 1; i <= 5; i++) {
    writeFile(dir, 'knowledge/features/login.md', `${i}\n`)
    sh(dir, 'git add .')
    sh(dir, `git commit -q -m "c${i}"`)
  }

  const result = await HISTORY.runTool({ file: 'knowledge/features/login.md', limit: 3 })
  assert.equal(result.commits.length, 3)
}))
