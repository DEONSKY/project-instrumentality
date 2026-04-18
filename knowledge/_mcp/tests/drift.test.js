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

test('scenario A: Since tracks the commit that touched the file, not HEAD (Bug 1 — kb→code)', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n')
  writeFile(dir, 'README.md', 'seed\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  // C1: touches the KB file
  writeFile(dir, 'knowledge/features/login.md', '# Login v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "edit login spec"')
  const c1Short = sh(dir, 'git rev-parse --short=7 HEAD')

  // C2: unrelated commit; moves HEAD past the drifting commit
  writeFile(dir, 'README.md', 'seed\nmore\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "unrelated"')
  const c2Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const result = await DRIFT.runTool({})
  assert.ok(!result.error, `unexpected error: ${result.error}`)
  assert.equal(result.kb_entries_new, 1, 'one new kb→code entry')
  assert.equal(result.kb_entries_re_detected, 0, 'no re-detections on first pass')

  const kb = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.match(kb, new RegExp(`\\*\\*Since:\\*\\*\\s*\`${c1Short}\``), `Since should be C1 (${c1Short})`)
  assert.doesNotMatch(kb, new RegExp(`\\*\\*Since:\\*\\*\\s*\`${c2Short}\``), `Since must not be C2 (${c2Short})`)
  assert.doesNotMatch(kb, /\*\*Latest:\*\*/, 'single-commit drift: no Latest line')
}))

test('scenario A-mirror: code-drift.md since stamps the commit that touched the code file (Bug 1 — code→kb)', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'src/features/login.ts', '// seed\n')
  writeFile(dir, 'README.md', 'seed\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  // CC1: touches the code file
  writeFile(dir, 'src/features/login.ts', '// v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "edit login feature"')
  const cc1Short = sh(dir, 'git rev-parse --short=7 HEAD')

  // CC2: unrelated commit
  writeFile(dir, 'README.md', 'seed\nmore\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "unrelated"')
  const cc2Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const result = await DRIFT.runTool({})
  assert.ok(!result.error, `unexpected error: ${result.error}`)
  assert.equal(result.code_entries_new, 1, 'one new code→kb entry')
  assert.equal(result.code_entries_re_detected, 0, 'no re-detections on first pass')

  const code = fs.readFileSync(path.join(dir, 'knowledge/sync/code-drift.md'), 'utf8')
  assert.match(code, new RegExp(`since \`${cc1Short}\``), `since should be CC1 (${cc1Short})`)
  assert.doesNotMatch(code, new RegExp(`since \`${cc2Short}\``), `since must not be CC2 (${cc2Short})`)
  assert.doesNotMatch(code, /, latest `/, 'single-commit drift: no inline latest clause')
}))

test('scenario B: re-edits bump Latest and re-surface (Bug 2 — kb→code)', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  // First edit — entry created with Since=C1, no Latest
  writeFile(dir, 'knowledge/features/login.md', '# Login v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "first edit"')
  const c1Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const first = await DRIFT.runTool({})
  assert.equal(first.kb_entries_new, 1)
  assert.equal(first.kb_entries_re_detected, 0)
  const kbAfterFirst = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.match(kbAfterFirst, new RegExp(`\\*\\*Since:\\*\\*\\s*\`${c1Short}\``), 'Since=C1 after first run')
  assert.doesNotMatch(kbAfterFirst, /\*\*Latest:\*\*/, 'no Latest line when Since==Latest')

  // Second edit — existing entry, Latest should bump to C2
  writeFile(dir, 'knowledge/features/login.md', '# Login v3\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "second edit"')
  const c2Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const second = await DRIFT.runTool({})
  assert.equal(second.kb_entries_new, 0, 're-edit is not a new entry')
  assert.equal(second.kb_entries_re_detected, 1, 're-edit surfaces as re_detected')

  const kbAfterSecond = fs.readFileSync(path.join(dir, 'knowledge/sync/kb-drift.md'), 'utf8')
  assert.match(kbAfterSecond, new RegExp(`\\*\\*Since:\\*\\*\\s*\`${c1Short}\``), 'Since pinned to C1')
  assert.match(kbAfterSecond, new RegExp(`\\*\\*Latest:\\*\\*\\s*\`${c2Short}\``), 'Latest bumped to C2')
  assert.match(second.message, /re-detected/, 'message calls out re-detection')
}))

test('scenario B-mirror: re-edits bump Latest and re-surface (Bug 2 — code→kb)', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'src/features/login.ts', '// seed\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  writeFile(dir, 'src/features/login.ts', '// v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "first edit"')
  const cc1Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const first = await DRIFT.runTool({})
  assert.equal(first.code_entries_new, 1)
  assert.equal(first.code_entries_re_detected, 0)
  const codeAfterFirst = fs.readFileSync(path.join(dir, 'knowledge/sync/code-drift.md'), 'utf8')
  assert.doesNotMatch(codeAfterFirst, /, latest `/, 'no inline latest on single-commit drift')

  writeFile(dir, 'src/features/login.ts', '// v3\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "second edit"')
  const cc2Short = sh(dir, 'git rev-parse --short=7 HEAD')

  const second = await DRIFT.runTool({})
  assert.equal(second.code_entries_new, 0, 'same file, same target → no new entry')
  assert.equal(second.code_entries_re_detected, 1, 're-edit surfaces as re_detected')

  const codeAfterSecond = fs.readFileSync(path.join(dir, 'knowledge/sync/code-drift.md'), 'utf8')
  assert.match(codeAfterSecond, new RegExp(`since \`${cc1Short}\``), 'since pinned to CC1')
  assert.match(codeAfterSecond, new RegExp(`latest \`${cc2Short}\``), 'latest bumped to CC2')
}))

test('scenario C: Bug 1 + 2 inside a submodule — commit attribution uses submodule git history', withRepo(async (parent) => {
  const subSource = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-drift-sub-'))
  sh(subSource, 'git init -q -b main')
  sh(subSource, 'git config user.email "test@test"')
  sh(subSource, 'git config user.name "test"')
  sh(subSource, 'git config commit.gpgsign false')
  writeFile(subSource, 'src/validators/email.js', '// initial\n')
  writeFile(subSource, 'README.md', 'seed\n')
  sh(subSource, 'git add .')
  sh(subSource, 'git commit -q -m seed-sub')

  try {
    writeFile(parent, 'knowledge/_rules.md', RULES)
    sh(parent, 'git add .')
    sh(parent, 'git commit -q -m seed-parent')
    sh(parent, `git -c protocol.file.allow=always submodule add -q "${subSource}" sub`)
    sh(parent, 'git commit -q -m "add submodule"')
    await DRIFT.runTool({})

    const subPath = path.join(parent, 'sub')

    // C1_sub: touches the validator. C2_sub: unrelated inside submodule.
    writeFile(subPath, 'src/validators/email.js', '// v2\n')
    sh(subPath, 'git add .')
    sh(subPath, 'git commit -q -m "edit validator"')
    const c1Sub = sh(subPath, 'git rev-parse --short=7 HEAD')

    writeFile(subPath, 'README.md', 'seed\nmore\n')
    sh(subPath, 'git add .')
    sh(subPath, 'git commit -q -m "unrelated in sub"')
    const c2Sub = sh(subPath, 'git rev-parse --short=7 HEAD')

    sh(parent, 'git add sub')
    sh(parent, 'git commit -q -m "bump submodule pointer (c2)"')

    const first = await DRIFT.runTool({})
    assert.ok(!first.error, `unexpected error: ${first.error}`)
    assert.equal(first.code_entries_new, 1, 'one new code→kb entry for the submodule change')
    assert.equal(first.code_entries_re_detected, 0, 'no re-detections yet')

    const codeAfterFirst = fs.readFileSync(path.join(parent, 'knowledge/sync/code-drift.md'), 'utf8')
    assert.match(codeAfterFirst, new RegExp(`sub/src/validators/email\\.js\`.*since \`${c1Sub}\``),
      `since should be C1_sub (${c1Sub})`)
    assert.doesNotMatch(codeAfterFirst, new RegExp(`since \`${c2Sub}\``),
      `since must not be C2_sub (${c2Sub}) — that's the submodule HEAD, not the drifting commit`)

    // Second edit to the same submodule file — Latest should bump
    writeFile(subPath, 'src/validators/email.js', '// v3\n')
    sh(subPath, 'git add .')
    sh(subPath, 'git commit -q -m "re-edit validator"')
    const c3Sub = sh(subPath, 'git rev-parse --short=7 HEAD')
    sh(parent, 'git add sub')
    sh(parent, 'git commit -q -m "bump submodule pointer (c3)"')

    const second = await DRIFT.runTool({})
    assert.equal(second.code_entries_new, 0)
    assert.equal(second.code_entries_re_detected, 1, 'submodule re-edit surfaces as re_detected')

    const codeAfterSecond = fs.readFileSync(path.join(parent, 'knowledge/sync/code-drift.md'), 'utf8')
    assert.match(codeAfterSecond, new RegExp(`since \`${c1Sub}\`.*latest \`${c3Sub}\``),
      `line should read "since \`${c1Sub}\`, latest \`${c3Sub}\`"`)
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

// ── _diffs payload tests ─────────────────────────────────────────────────────

test('_diffs: kb-drift entry carries stat, commits, diff, and reproducible cmd', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nInitial spec.\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  writeFile(dir, 'knowledge/features/login.md', '# Login\n\nUpdated spec.\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "edit login spec"')

  const result = await DRIFT.runTool({})
  assert.ok(result._diffs, '_diffs present')
  assert.equal(result._diffs.kb.length, 1, 'one kb entry in _diffs')

  const entry = result._diffs.kb[0]
  assert.equal(entry.kb_file, 'features/login.md')
  assert.ok(entry.diff && entry.diff.includes('Updated spec'), 'diff contains the change')
  assert.ok(entry.diff && entry.diff.includes('-Initial spec'), 'diff shows removal of old spec')
  assert.equal(entry.binary, false)
  assert.equal(entry.truncated, false)
  assert.ok(entry.stat && /\+\d+ -\d+/.test(entry.stat), `stat looks right: ${entry.stat}`)
  assert.equal(entry.total_commits, 1, 'one commit in range')
  assert.equal(entry.commits.length, 1)
  assert.ok(/edit login spec/.test(entry.commits[0].subject), 'commit subject preserved')
  assert.ok(entry.cmd && entry.cmd.startsWith('git diff'), `cmd looks right: ${entry.cmd}`)
  assert.ok(entry.cmd.includes('knowledge/features/login.md'), 'cmd references kb file path')
}))

test('_diffs: code-drift entry carries per-file diffs with correct cmd', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'src/validators/email.js', '// initial\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  writeFile(dir, 'src/validators/email.js', '// initial\nconst rule = true\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "add rule"')

  const result = await DRIFT.runTool({})
  assert.ok(result._diffs, '_diffs present')
  assert.equal(result._diffs.code.length, 1)
  const entry = result._diffs.code[0]
  assert.equal(entry.files.length, 1)
  const f = entry.files[0]
  assert.equal(f.path, 'src/validators/email.js')
  assert.equal(f.submodule, null)
  assert.equal(f.isShared, false)
  assert.ok(f.diff && f.diff.includes('+const rule = true'), `diff contains change: ${f.diff}`)
  assert.ok(f.cmd && f.cmd.startsWith('git diff') && !f.cmd.includes('git -C'), `parent-repo cmd: ${f.cmd}`)
  assert.ok(f.cmd.includes('src/validators/email.js'))
  assert.equal(entry.total_commits, 1)
}))

test('_diffs: submodule file uses git -C in cmd and sets submodule field', withRepo(async (parent) => {
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

    writeFile(path.join(parent, 'sub'), 'src/validators/email.js', '// initial\nconst updated = true\n')
    sh(path.join(parent, 'sub'), 'git add .')
    sh(path.join(parent, 'sub'), 'git commit -q -m "edit email validator"')
    sh(parent, 'git add sub')
    sh(parent, 'git commit -q -m "bump submodule pointer"')

    const result = await DRIFT.runTool({})
    assert.ok(result._diffs, '_diffs present')
    const entry = result._diffs.code.find(e => e.kb_target === 'validation/common.md')
    assert.ok(entry, 'validation/common.md entry present')
    const f = entry.files.find(x => x.path === 'sub/src/validators/email.js')
    assert.ok(f, 'submodule file in entry')
    assert.equal(f.submodule, 'sub')
    assert.ok(f.cmd.startsWith('git -C sub '), `submodule cmd uses -C: ${f.cmd}`)
    assert.ok(!f.cmd.includes('sub/src/validators/email.js'), 'cmd uses submodule-relative path')
    assert.ok(f.cmd.includes('src/validators/email.js'), 'cmd references stripped path')
    assert.ok(f.diff && f.diff.includes('+const updated = true'), `submodule diff fetched: ${f.diff}`)
  } finally {
    rmTempRepo(subSource)
  }
}))

test('_diffs: diffs larger than per-file cap are truncated; cmd preserved', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/big.md', '# Big\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  // Write a 600-line body to a KB file — the resulting diff exceeds the 400-line per-file cap.
  const bigBody = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
  writeFile(dir, 'knowledge/features/big.md', bigBody)
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "balloon"')

  const result = await DRIFT.runTool({})
  const entry = result._diffs.kb.find(e => e.kb_file === 'features/big.md')
  assert.ok(entry, 'big.md entry in _diffs')
  assert.equal(entry.truncated, true, 'diff marked truncated')
  assert.equal(entry.diff_lines, 400, 'truncated to PER_FILE_LINE_CAP')
  assert.ok(entry.cmd && entry.cmd.includes('knowledge/features/big.md'), 'cmd preserved for manual fetch')
}))

test('_diffs: include_diffs=false suppresses _diffs but keeps _instruction', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  writeFile(dir, 'knowledge/features/login.md', '# Login\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  writeFile(dir, 'knowledge/features/login.md', '# Login v2\n')
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m edit')

  const result = await DRIFT.runTool({ include_diffs: false })
  assert.equal(result._diffs, undefined, '_diffs should be absent')
  assert.ok(result._instruction, '_instruction still present')
  assert.equal(result.kb_entries, 1)
}))

test('_diffs: binary file is marked binary and not counted against budget', withRepo(async (dir) => {
  writeFile(dir, 'knowledge/_rules.md', RULES)
  const initialPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00])
  fs.mkdirSync(path.join(dir, 'src/features'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/features/logo.png'), initialPng)
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m seed')
  await DRIFT.runTool({})

  // Append some bytes so git sees a change
  const nextPng = Buffer.concat([initialPng, Buffer.from([0xff, 0xee, 0xdd])])
  fs.writeFileSync(path.join(dir, 'src/features/logo.png'), nextPng)
  sh(dir, 'git add .')
  sh(dir, 'git commit -q -m "binary change"')

  const result = await DRIFT.runTool({})
  const entry = result._diffs.code.find(e => e.kb_target === 'features/logo.md')
  assert.ok(entry, 'features/logo.md entry present')
  const f = entry.files.find(x => x.path === 'src/features/logo.png')
  assert.ok(f, 'png file in entry')
  assert.equal(f.binary, true, 'binary flag set')
  assert.ok(f.diff && /Binary files .* differ/.test(f.diff), `diff carries binary marker: ${f.diff}`)
  assert.equal(f.diff_lines, 0, 'binary files do not count against per-file budget')
}))
