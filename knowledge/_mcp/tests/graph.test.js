const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveDep,
  findCycles,
  validateEdges,
  EDGE_RULES,
  MAX_CYCLES_REPORTED,
  MAX_CYCLE_PATH_LENGTH,
  MAX_EDGE_VIOLATIONS_REPORTED,
} = require('../lib/graph')

// ── resolveDep ──────────────────────────────────────────────────────────────

const sampleGraph = () => ({
  version: '1.0',
  files: {
    'features/auth.md': { id: 'auth', type: 'feature', depends_on: [] },
    'features/session.md': { id: 'session', type: 'feature', depends_on: [] },
    'flows/login.md': { id: 'login', type: 'flow', depends_on: [] },
  },
})

test('resolveDep: exact path match', () => {
  assert.equal(resolveDep(sampleGraph(), 'features/auth'), 'features/auth.md')
})

test('resolveDep: id match', () => {
  assert.equal(resolveDep(sampleGraph(), 'auth'), 'features/auth.md')
})

test('resolveDep: dep with .md suffix is unresolved (matches existing orphan detector)', () => {
  assert.equal(resolveDep(sampleGraph(), 'features/auth.md'), null)
})

test('resolveDep: dep with #anchor is unresolved (matches existing orphan detector)', () => {
  assert.equal(resolveDep(sampleGraph(), 'features/auth#section'), null)
})

test('resolveDep: unresolvable returns null', () => {
  assert.equal(resolveDep(sampleGraph(), 'nonexistent'), null)
})

test('resolveDep: empty graph returns null', () => {
  assert.equal(resolveDep({ files: {} }, 'anything'), null)
})

// Oracle test: resolveDep returns null iff the existing inline orphan detector
// at tools/reindex.js:130-131 would have pushed to orphan_dependencies for the
// same input. Reimplements the exact two predicates here to assert equivalence.
test('resolveDep: oracle equivalence with existing orphan detector predicates', () => {
  const g = sampleGraph()
  const files = g.files
  const oracle = (dep) => {
    const matchesById = Object.values(files).some(f => f.id === dep)
    const matchesByPath = Object.keys(files).some(k => k.replace(/\.md$/, '') === dep)
    return matchesById || matchesByPath
  }
  const cases = [
    'auth', 'session', 'login',
    'features/auth', 'features/session', 'flows/login',
    'features/auth.md', 'features/auth#section',
    'nonexistent', 'features/nonexistent',
    '',
  ]
  for (const dep of cases) {
    const resolved = resolveDep(g, dep) !== null
    const oracleHit = oracle(dep)
    assert.equal(resolved, oracleHit, `mismatch for dep="${dep}": resolveDep=${resolved}, oracle=${oracleHit}`)
  }
})

// ── findCycles ──────────────────────────────────────────────────────────────

test('findCycles: empty graph → no cycles', () => {
  const r = findCycles({ files: {} })
  assert.deepEqual(r.cycles, [])
  assert.equal(r.truncated, false)
})

test('findCycles: no cycles → empty result', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: ['b'] },
      'b.md': { id: 'b', depends_on: ['c'] },
      'c.md': { id: 'c', depends_on: [] },
    },
  })
  assert.deepEqual(r.cycles, [])
})

test('findCycles: 2-node cycle', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: ['b'] },
      'b.md': { id: 'b', depends_on: ['a'] },
    },
  })
  assert.equal(r.cycles.length, 1)
  const p = r.cycles[0].path
  assert.equal(p[0], p[p.length - 1])
  assert.ok(p.includes('a.md') && p.includes('b.md'))
})

test('findCycles: 3-node cycle', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: ['b'] },
      'b.md': { id: 'b', depends_on: ['c'] },
      'c.md': { id: 'c', depends_on: ['a'] },
    },
  })
  assert.equal(r.cycles.length, 1)
  const p = r.cycles[0].path
  assert.equal(p[0], p[p.length - 1])
})

test('findCycles: two disjoint cycles', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: ['b'] },
      'b.md': { id: 'b', depends_on: ['a'] },
      'x.md': { id: 'x', depends_on: ['y'] },
      'y.md': { id: 'y', depends_on: ['x'] },
    },
  })
  assert.equal(r.cycles.length, 2)
})

test('findCycles: cycle via affects_flows', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: [], affects_flows: ['b'] },
      'b.md': { id: 'b', depends_on: ['a'], affects_flows: [] },
    },
  })
  assert.equal(r.cycles.length, 1)
})

test('findCycles: dangling edges are silently skipped', () => {
  const r = findCycles({
    files: {
      'a.md': { id: 'a', depends_on: ['nonexistent', 'b'] },
      'b.md': { id: 'b', depends_on: ['a'] },
    },
  })
  assert.equal(r.cycles.length, 1)
})

test('findCycles: cap at maxCycles', () => {
  const files = {}
  // 60 independent 2-cycles
  for (let i = 0; i < 60; i++) {
    files[`a${i}.md`] = { id: `a${i}`, depends_on: [`b${i}`] }
    files[`b${i}.md`] = { id: `b${i}`, depends_on: [`a${i}`] }
  }
  const r = findCycles({ files })
  assert.equal(r.cycles.length, MAX_CYCLES_REPORTED)
  assert.equal(r.truncated, true)
})

test('findCycles: cap path length at maxPathLength', () => {
  // 30-node ring
  const files = {}
  const n = 30
  for (let i = 0; i < n; i++) {
    files[`n${i}.md`] = { id: `n${i}`, depends_on: [`n${(i + 1) % n}`] }
  }
  const r = findCycles({ files })
  assert.equal(r.cycles.length, 1)
  assert.ok(r.cycles[0].path.length <= MAX_CYCLE_PATH_LENGTH)
})

// ── validateEdges ───────────────────────────────────────────────────────────

test('validateEdges: empty rules → no violations', () => {
  const r = validateEdges(sampleGraph(), [])
  assert.deepEqual(r.violations, [])
  assert.equal(r.truncated, false)
})

test('validateEdges: EDGE_RULES ships empty', () => {
  assert.deepEqual(EDGE_RULES, [])
})

test('validateEdges: targetType rule fires when target type mismatches', () => {
  const rules = [{ edge: 'affects_flows', targetType: 'flow', message: 'affects_flows must target a flow' }]
  const r = validateEdges({
    files: {
      'a.md': { id: 'a', type: 'feature', affects_flows: ['b'] },
      'b.md': { id: 'b', type: 'feature' }, // wrong type
    },
  }, rules)
  assert.equal(r.violations.length, 1)
  assert.equal(r.violations[0].edge, 'affects_flows')
  assert.equal(r.violations[0].target_type, 'feature')
})

test('validateEdges: targetType rule passes when target type matches', () => {
  const rules = [{ edge: 'affects_flows', targetType: 'flow', message: 'affects_flows must target a flow' }]
  const r = validateEdges({
    files: {
      'a.md': { id: 'a', type: 'feature', affects_flows: ['b'] },
      'b.md': { id: 'b', type: 'flow' },
    },
  }, rules)
  assert.equal(r.violations.length, 0)
})

test('validateEdges: targetTypeNot rule fires when target type matches forbidden', () => {
  const rules = [{ edge: 'depends_on', targetTypeNot: 'flow', message: 'depends_on must not target a flow' }]
  const r = validateEdges({
    files: {
      'a.md': { id: 'a', type: 'feature', depends_on: ['b'] },
      'b.md': { id: 'b', type: 'flow' },
    },
  }, rules)
  assert.equal(r.violations.length, 1)
})

test('validateEdges: dangling edges silently skipped', () => {
  const rules = [{ edge: 'affects_flows', targetType: 'flow', message: 'x' }]
  const r = validateEdges({
    files: {
      'a.md': { id: 'a', type: 'feature', affects_flows: ['nonexistent'] },
    },
  }, rules)
  assert.equal(r.violations.length, 0)
})

test('validateEdges: cap at maxViolations', () => {
  const rules = [{ edge: 'depends_on', targetType: 'flow', message: 'wrong' }]
  const files = {}
  // 120 sources, each pointing at a non-flow target → 120 violations possible
  files['target.md'] = { id: 'target', type: 'feature' }
  for (let i = 0; i < 120; i++) {
    files[`s${i}.md`] = { id: `s${i}`, type: 'feature', depends_on: ['target'] }
  }
  const r = validateEdges({ files }, rules)
  assert.equal(r.violations.length, MAX_EDGE_VIOLATIONS_REPORTED)
  assert.equal(r.truncated, true)
})
