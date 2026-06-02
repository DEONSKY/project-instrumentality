const { test } = require('node:test')
const assert = require('node:assert/strict')
const { fillTemplate, normalizeKbFile, stripPlaceholders } = require('../lib/template-filler')
const { extractMentions } = require('../lib/mentions')

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

// ── A4: normalize strips placeholders, ghost deps, status; forces identity ─────

test('imported feature carries NO unfilled {{placeholders}} and NO ghost wikilinks', () => {
  const result = fillTemplate(
    { id: 'c1', text: 'Six modules: Admin, Operation, Charts.', heading: 'Modules' },
    { scaffoldType: 'feature', suggested_id: 'modules-overview' },
    'doc.md',
    ['data/validation/role-rules']
  )
  assert.equal(/\{\{/.test(result), false, 'no {{ placeholders survive')
  // The real dep stays; the template example wikilink [[data/validation/{{rule_id}}]] does NOT leak.
  const mentions = extractMentions(result)
  assert.deepEqual(mentions, [], 'body carries no wikilink ghost deps')
  assert.match(result, /^depends_on:\s*\[data\/validation\/role-rules\]/m, 'real dep preserved in frontmatter')
})

test('schema DBML example block is stripped whole (no orphaned id/closing brace)', () => {
  const result = fillTemplate(
    { id: 'c1', text: 'Table TT_PART { id int }', heading: 'Part' },
    { scaffoldType: 'schema', suggested_id: 'part' },
    'doc.md',
    []
  )
  assert.equal(/\{\{/.test(result), false, 'no placeholders')
  // The template's `Table {{table_name}} { ... }` example must be removed as a
  // block — a lone `id integer [pk, increment]` line would be orphaned debris.
  assert.equal(/id integer \[pk/.test(result), false, 'DBML example block removed wholesale')
})

test('fillTemplate forces frontmatter id to equal the resolved suggested_id', () => {
  // schema template declares id: "schema-{{name}}" — must be overridden to the bare id.
  const result = fillTemplate(
    { id: 'c1', text: 'data', heading: 'X' },
    { scaffoldType: 'schema', suggested_id: 'stock' },
    'doc.md',
    []
  )
  assert.match(result, /^id:\s*stock$/m, 'id forced to suggested_id (not schema-stock)')
  assert.equal(/^id:\s*schema-/m.test(result), false, 'prefixed id divergence fixed')
})

test('new types policy/reference/technical fill cleanly', () => {
  for (const t of ['policy', 'reference', 'technical']) {
    const result = fillTemplate(
      { id: 'c1', text: 'Some imported content for ' + t, heading: t },
      { scaffoldType: t, suggested_id: t + '-doc' },
      'doc.md',
      []
    )
    assert.ok(result, `fillTemplate produced output for ${t}`)
    assert.equal(/\{\{/.test(result), false, `${t}: no placeholders`)
    assert.match(result, new RegExp(`^type:\\s*${t}$`, 'm'), `${t}: correct type`)
    assert.equal(/^status:/m.test(result), false, `${t}: no status field`)
  }
})

test('normalizeKbFile drops status and {{-bearing fields, guards required fields', () => {
  const { fm, body } = normalizeKbFile(
    { id: 'x', topic: '{{topic}}', status: 'draft', tags: ['a', '{{b}}'], shared_depends_on: ['data/schema/{{e}}.md'] },
    'body {{ph}} text\nkeep me',
    { id: 'real-id' }
  )
  assert.equal(fm.id, 'real-id', 'id forced')
  assert.deepEqual(fm.aliases, ['real-id'], 'aliases forced')
  assert.equal('status' in fm, false, 'status dropped')
  assert.equal('topic' in fm, false, 'placeholder-bearing scalar dropped')
  assert.deepEqual(fm.tags, ['a'], 'placeholder array element dropped')
  assert.deepEqual(fm.shared_depends_on, [], 'placeholder array element dropped')
  assert.equal(fm.app_scope, 'all', 'required app_scope defaulted')
  assert.ok(fm.created, 'required created defaulted')
  assert.equal(/\{\{/.test(body), false, 'body placeholders stripped')
  assert.match(body, /keep me/, 'non-placeholder body lines preserved')
})
