const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { resolveKbTarget } = require('../lib/patterns')

const ORIGINAL_CWD = process.cwd()

function mkTempKb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-patterns-test-'))
  fs.mkdirSync(path.join(dir, 'knowledge', 'specs', 'features'), { recursive: true })
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

// ── resolveKbTarget: single-string (back-compat) ────────────────────────────

test('resolveKbTarget: single template string substitutes {name}', withKb(async () => {
  const r = resolveKbTarget(
    { kb_target: 'specs/features/{name}.md', name_extraction: { strip_suffix: ['Controller'], case: 'kebab' } },
    'UserDefinitionController.java'
  )
  assert.equal(r, 'specs/features/user-definition.md')
}))

test('resolveKbTarget: single literal target returned as-is', withKb(async () => {
  const r = resolveKbTarget({ kb_target: 'specs/features/auth.md' }, 'ignored.java')
  assert.equal(r, 'specs/features/auth.md')
}))

// ── resolveKbTarget: array form (alternative-targets) ───────────────────────

test('resolveKbTarget: array prefers first candidate when it exists', withKb(async (dir) => {
  fs.writeFileSync(path.join(dir, 'knowledge', 'specs', 'features', 'mail-settings.md'), '')
  const r = resolveKbTarget(
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], name_extraction: { strip_suffix: ['Controller'], case: 'kebab' } },
    'MailSettingsController.java'
  )
  assert.equal(r, 'specs/features/mail-settings.md')
}))

test('resolveKbTarget: array falls through to plural alias when singular is missing', withKb(async (dir) => {
  fs.writeFileSync(path.join(dir, 'knowledge', 'specs', 'features', 'buffer-definitions.md'), '')
  const r = resolveKbTarget(
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], name_extraction: { strip_suffix: ['Controller'], case: 'kebab' } },
    'BufferDefinitionController.java'
  )
  assert.equal(r, 'specs/features/buffer-definitions.md')
}))

test('resolveKbTarget: array returns first candidate (scaffold target) when none exist', withKb(async () => {
  const r = resolveKbTarget(
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], name_extraction: { strip_suffix: ['Controller'], case: 'kebab' } },
    'ParameterAuditController.java'
  )
  assert.equal(r, 'specs/features/parameter-audit.md')
}))

test('resolveKbTarget: array with recursive glob finds nested files', withKb(async (dir) => {
  fs.mkdirSync(path.join(dir, 'knowledge', 'specs', 'features', 'auth'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'knowledge', 'specs', 'features', 'auth', 'login.md'), '')
  const r = resolveKbTarget(
    { kb_target: ['specs/features/{name}.md', 'specs/features/**/{name}.md'] },
    'login.ts'
  )
  assert.equal(r, 'specs/features/auth/login.md')
}))
