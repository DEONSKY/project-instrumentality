const { test } = require('node:test')
const assert = require('node:assert/strict')
const { fillTemplate } = require('../lib/template-filler')

// ── F51 (HIGH): no [object Object] sentinels in output ─────────────────────────

test('fillTemplate on standards template produces no [object Object] sentinels', () => {
  const result = fillTemplate(
    { id: 'c1', text: 'Body text', heading: 'Retention' },
    { scaffoldType: 'standard', suggested_id: 'data-retention', suggested_group: 'process' },
    '/tmp/source.md',
    []
  )
  assert.ok(result, 'fillTemplate returned a value')
  assert.equal(
    result.includes('[object Object]'),
    false,
    'output must not contain [object Object] anywhere — frontmatter, body, or nested fields'
  )
})

test('fillTemplate on feature template produces no [object Object] sentinels', () => {
  const result = fillTemplate(
    { id: 'c2', text: 'Body', heading: 'Feature' },
    { scaffoldType: 'feature', suggested_id: 'new-feature' },
    '/tmp/source.md',
    []
  )
  assert.ok(result, 'fillTemplate returned a value')
  assert.equal(result.includes('[object Object]'), false)
})

test('fillTemplate substitutes id at top-level frontmatter keys', () => {
  const result = fillTemplate(
    { id: 'c1', text: 'Body', heading: 'X' },
    { scaffoldType: 'feature', suggested_id: 'login-flow' },
    '/tmp/source.md',
    []
  )
  // id was filled
  assert.match(result, /^id:\s*login-flow$/m, 'top-level id substituted')
  // unfilled placeholders survive as literal strings (matches scaffold behavior)
  // The standard template's {{rule_id}} etc. would survive, but feature
  // template has no nested placeholders other than the ones we substitute.
})

test('fillTemplate substitutes nested string values in standard template rules[]', () => {
  // Templates now quote {{...}} placeholders so YAML parses them as strings
  // (F51 fix Part 2). Substitution recurses into nested objects/arrays
  // (F51 fix Part 1). Unfilled nested placeholders survive as literals.
  const result = fillTemplate(
    { id: 'c1', text: 'Body', heading: 'X' },
    { scaffoldType: 'standard', suggested_id: 'my-std', suggested_group: 'process' },
    '/tmp/source.md',
    []
  )
  // Rules array survived parsing as an array of objects (not '[object Object]').
  // The id key inside rules[0] should be the literal "{{rule_id}}" placeholder
  // for the agent to fill in via a follow-up kb_write — NOT '[object Object]'.
  assert.match(result, /rules:/, 'rules block present')
  assert.equal(result.includes("'[object Object]'"), false)
  assert.equal(result.includes('"[object Object]"'), false)
})

// ── F42 / A3: no hardcoded fm.status = 'draft' ────────────────────────────────

test('fillTemplate output does NOT add a status: draft field', () => {
  // Previously template-filler.js:40 hardcoded `fm.status = 'draft'` which
  // lint flagged as "status belongs in _index.yaml". Removed in A3/F42.
  const result = fillTemplate(
    { id: 'c1', text: 'Body', heading: 'X' },
    { scaffoldType: 'feature', suggested_id: 'foo' },
    '/tmp/source.md',
    []
  )
  // status: draft would appear on its own line at top level.
  assert.equal(/^status:\s*draft$/m.test(result), false, 'must not emit status: draft')
})

// ── F51 parity: filled values match expectation ───────────────────────────────

test('fillTemplate fills date and app_scope with sensible defaults', () => {
  const result = fillTemplate(
    { id: 'c1', text: 'Body', heading: 'X' },
    { scaffoldType: 'feature', suggested_id: 'foo' },
    '/tmp/source.md',
    []
  )
  // app_scope defaults to 'all' (not "[object Object]" or empty)
  assert.match(result, /^app_scope:\s*all$/m, 'app_scope: all default applied')
  // date is YYYY-MM-DD
  assert.match(result, /^created:\s*['"]?\d{4}-\d{2}-\d{2}['"]?$/m, 'created: <date>')
})
