const { test } = require('node:test')
const assert = require('node:assert/strict')

const { preFilter, runLlmPreFilter } = require('../lib/rule-detect')

// ── pre_filter gate for kind: llm ───────────────────────────────────────────

test('llm rule with pre_filter falls through to llm decision when regex matches', () => {
  const rule = {
    id: 'list-response-shape',
    applies_to: { paths: ['**/*.java'] },
    detect: { kind: 'llm', pre_filter: '\\buserName\\b' }
  }
  const r = preFilter(rule, 'src/UserDefinitionRecord.java', 'public String userName;')
  assert.equal(r.decision, 'llm')
  assert.equal(r.verdict.verdict, 'match')
})

test('llm rule with pre_filter short-circuits to na when regex does not match', () => {
  const rule = {
    id: 'list-response-shape',
    applies_to: { paths: ['**/*.java'] },
    detect: { kind: 'llm', pre_filter: '\\buserName\\b' }
  }
  const r = preFilter(rule, 'src/UserDefinitionRecord.java', 'public String username;')
  assert.equal(r.decision, 'na')
  assert.match(r.reason, /pre_filter regex did not match/)
})

test('llm rule without pre_filter still falls through to llm (backwards-compat)', () => {
  const rule = {
    id: 'old-rule',
    applies_to: { paths: ['**/*.java'] },
    detect: { kind: 'llm' }
  }
  const r = preFilter(rule, 'src/Foo.java', 'arbitrary content')
  assert.equal(r.decision, 'llm')
  assert.equal(r.verdict, undefined)
})

test('runLlmPreFilter signals absent when pre_filter is missing', () => {
  const v = runLlmPreFilter({ detect: { kind: 'llm' } }, 'anything')
  assert.equal(v.verdict, 'absent')
})

test('invalid pre_filter regex falls through to llm without crashing preFilter', () => {
  const rule = {
    id: 'broken',
    applies_to: { paths: ['**/*.java'] },
    detect: { kind: 'llm', pre_filter: '[unclosed' }
  }
  const r = preFilter(rule, 'src/Foo.java', 'whatever')
  assert.equal(r.decision, 'llm')
  assert.equal(r.verdict.verdict, 'error')
})

test('pre_filter is ignored for kind: regex (regex pattern remains authoritative)', () => {
  const rule = {
    id: 'no-console',
    applies_to: { paths: ['**/*.js'] },
    detect: { kind: 'regex', pattern: 'console\\.log', pre_filter: 'never-match' }
  }
  const r = preFilter(rule, 'src/foo.js', 'console.log("x")')
  assert.equal(r.decision, 'fail')
})
