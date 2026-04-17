const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ORIGINAL_CWD = process.cwd()
const DRIFT = require('../tools/drift')

const RULES = `---
version: "1.0"
code_path_patterns:
  - intent: validator
    kb_target: "validation/common.md"
    paths:
      - "src/validators/**"
      - "sub/src/validators/**"
  - intent: feature
    kb_target: "features/{name}.md"
    paths:
      - "src/features/**"
---
`

function sh(cwd, cmd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-drift-test-'))
  sh(dir, 'git init -q -b main')
  sh(dir, 'git config user.email "test@test"')
  sh(dir, 'git config user.name "test"')
  sh(dir, 'git config commit.gpgsign false')
  sh(dir, 'git config protocol.file.allow always')
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

test('scenario 1: fresh queue bootstrap writes baseline lines in both headers', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'README.md', 'seed\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')

  const result = await DRIFT.runTool({})
  assert.ok(!result.error, `unexpected error: ${result.error}`)

  const code = fs.readFileSync(path.join(dir, 'knowledge/sync/code-drift.md'), 'utf8')
  const kb = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.match(code, /<!-- baseline: [a-f0-9]{40} -->/, 'code-drift.md has baseline line')
  assert.match(kb, /<!-- baseline: [a-f0-9]{40} -->/, 'kb-drift.md has baseline line')
}))

test('scenario 2: kb→code detection advances baseline; back-to-back run is a no-op', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nInitial spec.\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')

  await DRIFT.runTool({})
  const kb0 = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  const baseline0 = kb0.match(/<!-- baseline: ([a-f0-9]{40}) -->/)[1]

  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nUpdated spec.\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "edit login spec"')

  const edit = await DRIFT.runTool({})
  assert.ok(!edit.error, `unexpected error: ${edit.error}`)
  assert.equal(edit.kb_entries, 1, 'one kb→code entry should be written')

  const kb1 = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.match(kb1, /## features\/login\.md/, 'kb-drift.md contains entry for edited KB file')
  const baseline1 = kb1.match(/<!-- baseline: ([a-f0-9]{40}) -->/)[1]
  assert.notEqual(baseline1, baseline0, 'baseline advanced past the edit commit')
  assert.equal(baseline1, sh(dir, 'git rev-parse HEAD'), 'baseline equals HEAD after edit')

  const noop = await DRIFT.runTool({})
  assert.equal(noop.kb_entries, 0, 'back-to-back run produces no new entries')
  const kb2 = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.equal(kb2, kb1, 'kb-drift.md byte-identical on back-to-back run')
}))

test('scenario 3: purge clears queue, advances baseline, writes PURGE drift-log entry', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  writeFile(dir, 'knowledge/features/login.md', '# Login v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m edit')
  await DRIFT.runTool({})

  const result = await DRIFT.runTool({ force_baseline: 'HEAD', purge: true })
  assert.ok(!result.error, `unexpected error: ${result.error}`)
  assert.equal(result.purged, true, 'purge flag echoed back')

  const kb = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.doesNotMatch(kb, /## features\/login\.md/, 'kb-drift.md entry cleared')
  assert.match(kb, /<!-- baseline: [a-f0-9]{40} -->/, 'baseline line still present after purge')

  const driftLogDir = path.join(dir, 'knowledge/sync/drift-log')
  assert.ok(fs.existsSync(driftLogDir), 'drift-log directory exists after purge')
  const logs = fs.readdirSync(driftLogDir)
  assert.ok(logs.length >= 1, 'drift-log has at least one month file')
  const logContent = logs.map(f => fs.readFileSync(path.join(driftLogDir, f), 'utf8')).join('\n')
  assert.match(logContent, /· PURGE/, 'drift-log contains PURGE heading')
  assert.match(logContent, /Pre-purge kb-drift\.md body:/, 'drift-log captures pre-purge kb body')
  assert.match(logContent, /Pre-purge code-drift\.md body:/, 'drift-log captures pre-purge code body')
}))

test('scenario 4: submodule code change surfaces in parent code-drift.md', withRepo(async (parent) => {
  const subSource = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-drift-sub-'))
  sh(subSource, 'git init -q -b main')
  sh(subSource, 'git config user.email "test@test"')
  sh(subSource, 'git config user.name "test"')
  sh(subSource, 'git config commit.gpgsign false')
  writeFile(subSource, 'src/validators/email.js', '// initial\n')
  sh(subSource, 'git add .')
  sh(subSource, 'git commit -q -m seed-sub')

  try {
    writeFile(parent, 'knowledge/_rules.md', RULES)
    sh(parent, 'git add .')
    sh(parent, 'git commit -q -m seed-parent')
    sh(parent, `git -c protocol.file.allow=always submodule add -q "${subSource}" sub`)
    sh(parent, 'git commit -q -m "add submodule"')

    await DRIFT.runTool({})

    writeFile(path.join(parent, 'sub'), 'src/validators/email.js', '// updated\n')
    sh(path.join(parent, 'sub'), 'git add .')
    sh(path.join(parent, 'sub'), 'git commit -q -m "edit email validator"')
    sh(parent, 'git add sub')
    sh(parent, 'git commit -q -m "bump submodule pointer"')

    const result = await DRIFT.runTool({})
    assert.ok(!result.error, `unexpected error: ${result.error}`)

    const code = fs.readFileSync(path.join(parent, 'knowledge/sync/code-drift.md'), 'utf8')
    assert.match(code, /sub\/src\/validators\/email\.js/, 'code-drift.md contains submodule-prefixed path')
    assert.match(code, /## validation\/common\.md/, 'code-drift.md entry keyed by KB target')
  } finally {
    rmTempRepo(subSource)
  }
}))

test('scenario 5: dedup_baselines collapses duplicate baseline lines to the descendant SHA', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'README.md', 'seed\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  const ancestor = sh(dir, 'git rev-parse HEAD')

  writeFile(dir, 'README.md', 'seed\nmore\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m more')
  const descendant = sh(dir, 'git rev-parse HEAD')

  await DRIFT.runTool({})

  // Simulate a merge=union collision: two baseline lines, order ancestor-first.
  const queuePath = path.join(dir, 'knowledge/sync/code-drift.md')
  const original = fs.readFileSync(queuePath, 'utf8')
  const collided = original.replace(
    /<!-- baseline: [a-f0-9]{40} -->/,
    `<!-- baseline: ${ancestor} -->\n<!-- baseline: ${descendant} -->`
  )
  fs.writeFileSync(queuePath, collided)

  const result = await DRIFT.runTool({ dedup_baselines: true })
  assert.ok(result.deduped, 'dedup result returned')

  const after = fs.readFileSync(queuePath, 'utf8')
  const matches = [...after.matchAll(/<!-- baseline: ([a-f0-9]{40}) -->/g)]
  assert.equal(matches.length, 1, 'exactly one baseline line remains')
  assert.equal(matches[0][1], descendant, 'descendant SHA wins over ancestor')
}))
