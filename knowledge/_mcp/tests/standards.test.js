const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  loadStandardsIndex,
  findStandardsForPath,
  inferAppScope,
  getRule,
  validateRule,
  validateStandard
} = require('../lib/standards')

// ── validateRule ────────────────────────────────────────────────────────────

test('validateRule rejects missing fields', () => {
  const r = validateRule({}, { kind: 'stack-local' })
  assert.equal(r.valid, false)
  assert.ok(r.errors.some(e => e.includes('rule.id')))
  assert.ok(r.errors.some(e => e.includes('rule.title')))
  assert.ok(r.errors.some(e => e.includes('rule.severity')))
  assert.ok(r.errors.some(e => e.includes('rule.description')))
})

test('validateRule rejects bad slug ids', () => {
  const r = validateRule({
    id: 'BadID',
    title: 't',
    severity: 'warn',
    description: 'd',
    applies_to: { paths: ['src/**'] }
  }, { kind: 'stack-local' })
  assert.ok(r.errors.some(e => e.includes('not a kebab-case slug')))
})

test('validateRule rejects bad severity / detect.kind', () => {
  const r = validateRule({
    id: 'rule-a',
    title: 't',
    severity: 'critical',
    description: 'd',
    detect: { kind: 'magic' },
    applies_to: { paths: ['src/**'] }
  }, { kind: 'stack-local' })
  assert.ok(r.errors.some(e => e.includes('rule.severity')))
  assert.ok(r.errors.some(e => e.includes('rule.detect.kind')))
})

test('validateRule requires applies_to.paths for stack-local', () => {
  const r = validateRule({
    id: 'rule-a', title: 't', severity: 'warn', description: 'd'
  }, { kind: 'stack-local' })
  assert.ok(r.errors.some(e => e.includes('applies_to.paths')))
})

test('validateRule allows missing applies_to for contracts (intersect filter is optional)', () => {
  const r = validateRule({
    id: 'rule-a', title: 't', severity: 'warn', description: 'd'
  }, { kind: 'contract' })
  assert.equal(r.valid, true, JSON.stringify(r.errors))
})

test('validateRule validates exceptions[].paths and reason', () => {
  const r = validateRule({
    id: 'rule-a', title: 't', severity: 'warn', description: 'd',
    applies_to: { paths: ['src/**'] },
    exceptions: [
      { paths: [], reason: 'x' },
      { paths: ['x'] }
    ]
  }, { kind: 'stack-local' })
  assert.ok(r.errors.some(e => e.includes('exceptions[0].paths')))
  assert.ok(r.errors.some(e => e.includes('exceptions[1].reason')))
})

// ── validateStandard ────────────────────────────────────────────────────────

test('validateStandard catches duplicate rule ids', () => {
  const r = validateStandard({
    id: 'foo',
    type: 'standard',
    kind: 'stack-local',
    app_scope: 'app',
    rules: [
      { id: 'a', title: 't1', severity: 'warn', description: 'd', applies_to: { paths: ['src/**'] } },
      { id: 'a', title: 't2', severity: 'warn', description: 'd', applies_to: { paths: ['src/**'] } }
    ]
  })
  assert.ok(r.errors.some(e => e.includes('duplicate rule id "a"')))
})

test('validateStandard requires parties for kind: contract', () => {
  const r = validateStandard({
    id: 'foo',
    type: 'standard',
    kind: 'contract',
    app_scope: ['a', 'b'],
    rules: [{ id: 'r1', title: 't', severity: 'error', description: 'd' }]
  })
  assert.ok(r.errors.some(e => e.includes('parties')))
})

test('validateStandard requires parties[].applies_to.paths', () => {
  const r = validateStandard({
    id: 'foo',
    type: 'standard',
    kind: 'contract',
    app_scope: ['a', 'b'],
    parties: {
      backend: { app_scope: ['a'], detect: { kind: 'llm', hint: '' } },
      frontend: { app_scope: ['b'], applies_to: { paths: ['x/**'] }, detect: { kind: 'llm' } }
    },
    rules: [{ id: 'r1', title: 't', severity: 'error', description: 'd' }]
  })
  assert.ok(r.errors.some(e => e.includes('parties.backend.applies_to.paths')))
})

test('validateStandard rejects overlapping party app_scopes', () => {
  const r = validateStandard({
    id: 'foo',
    type: 'standard',
    kind: 'contract',
    app_scope: ['a', 'b'],
    parties: {
      backend: { app_scope: ['a', 'b'], applies_to: { paths: ['x/**'] }, detect: { kind: 'llm' } },
      frontend: { app_scope: ['b'], applies_to: { paths: ['y/**'] }, detect: { kind: 'llm' } }
    },
    rules: [{ id: 'r1', title: 't', severity: 'error', description: 'd' }]
  })
  assert.ok(r.errors.some(e => e.includes('overlapping app_scope')))
})

test('validateStandard accepts a well-formed stack-local standard', () => {
  const r = validateStandard({
    id: 'foo',
    type: 'standard',
    kind: 'stack-local',
    app_scope: 'app',
    rules: [
      { id: 'r1', title: 't', severity: 'warn', description: 'd', applies_to: { paths: ['src/**'] } }
    ]
  })
  assert.equal(r.valid, true, JSON.stringify(r.errors))
})

test('validateStandard accepts a well-formed contract', () => {
  const r = validateStandard({
    id: 'i18n',
    type: 'standard',
    kind: 'contract',
    app_scope: ['be', 'fe'],
    parties: {
      backend: { app_scope: ['be'], applies_to: { paths: ['be/**'] }, detect: { kind: 'ast-grep', hint: '' } },
      frontend: { app_scope: ['fe'], applies_to: { paths: ['fe/**'] }, detect: { kind: 'llm', hint: '' } }
    },
    rules: [{ id: 'keys-only', title: 't', severity: 'error', description: 'd' }]
  })
  assert.equal(r.valid, true, JSON.stringify(r.errors))
})

// ── findStandardsForPath / loadStandardsIndex ───────────────────────────────

function makeGraph() {
  return {
    files: {
      'standards/code/screen-routing.md': {
        id: 'screen-routing',
        type: 'standard',
        kind: 'stack-local',
        app_scope: 'fe',
        topic: 'screens',
        rules: [{
          id: 'decompose',
          title: 'decompose',
          severity: 'warn',
          description: 'd',
          applies_to: { paths: ['src/screens/**/*.tsx'] },
          detect: { kind: 'llm', hint: '' }
        }]
      },
      'standards/contracts/i18n.md': {
        id: 'i18n',
        type: 'standard',
        kind: 'contract',
        app_scope: ['be', 'fe'],
        parties: {
          backend: { app_scope: ['be'], applies_to: { paths: ['be/handlers/**.go'] }, detect: { kind: 'ast-grep' } },
          frontend: { app_scope: ['fe'], applies_to: { paths: ['fe/src/**.tsx'] }, detect: { kind: 'llm' } }
        },
        rules: [{ id: 'keys-only', title: 't', severity: 'error', description: 'd' }]
      },
      'features/x.md': {
        id: 'x', type: 'feature', app_scope: 'fe', rules: [], tags: []
      }
    }
  }
}

test('loadStandardsIndex filters out non-standards', () => {
  const idx = loadStandardsIndex(makeGraph())
  assert.equal(idx.length, 2)
  assert.deepEqual(idx.map(s => s.id).sort(), ['i18n', 'screen-routing'])
})

test('findStandardsForPath ranks exact matches above globs and applies app_scope filter', () => {
  const idx = loadStandardsIndex(makeGraph())
  const matches = findStandardsForPath(idx, 'src/screens/orders/list.tsx', 'fe')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].standard.id, 'screen-routing')
  assert.equal(matches[0].rule.id, 'decompose')
})

test('findStandardsForPath surfaces contract rules via party paths', () => {
  const idx = loadStandardsIndex(makeGraph())
  const matches = findStandardsForPath(idx, 'fe/src/screens/orders.tsx', 'fe')
  const contracts = matches.filter(m => m.standard.kind === 'contract')
  assert.equal(contracts.length, 1)
  assert.equal(contracts[0].standard.id, 'i18n')
  assert.equal(contracts[0].party, 'frontend')
})

test('findStandardsForPath excludes standards whose app_scope does not match', () => {
  const idx = loadStandardsIndex(makeGraph())
  // editing FE-scoped file with a backend-only app inferred → only matches things scoped 'be' or 'all'
  const matches = findStandardsForPath(idx, 'src/screens/orders/list.tsx', 'be')
  assert.equal(matches.length, 0)
})

test('findStandardsForPath caps results at top-N', () => {
  const idx = loadStandardsIndex(makeGraph())
  const matches = findStandardsForPath(idx, 'fe/src/screens/orders.tsx', 'fe', { cap: 0 })
  assert.equal(matches.length, 0)
})

// ── inferAppScope ───────────────────────────────────────────────────────────

test('inferAppScope returns null silently when app_root_patterns is unset', () => {
  const stubRules = { getRaw: () => ({}) }
  assert.equal(inferAppScope('src/x.tsx', stubRules), null)
})

test('inferAppScope resolves via app_root_patterns', () => {
  const stubRules = { getRaw: () => ({ app_root_patterns: { 'fe/**': 'fe', 'be/**': 'be' } }) }
  assert.equal(inferAppScope('fe/src/x.tsx', stubRules), 'fe')
  assert.equal(inferAppScope('be/handler.go', stubRules), 'be')
  assert.equal(inferAppScope('docs/x.md', stubRules), null)
})

// ── getRule ─────────────────────────────────────────────────────────────────

test('getRule resolves by composite key', () => {
  const idx = loadStandardsIndex(makeGraph())
  const r = getRule(idx, 'screen-routing', 'decompose')
  assert.ok(r)
  assert.equal(r.rule.id, 'decompose')
  assert.equal(r.standard.id, 'screen-routing')
})

test('getRule returns null for unknown rule', () => {
  const idx = loadStandardsIndex(makeGraph())
  assert.equal(getRule(idx, 'screen-routing', 'no-such-rule'), null)
  assert.equal(getRule(idx, 'no-such-standard', 'whatever'), null)
})
