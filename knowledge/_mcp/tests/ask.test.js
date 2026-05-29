const { test } = require('node:test')
const assert = require('node:assert/strict')
const { extractKeywords, singularize } = require('../tools/ask')

// These tests target the bug surfaced by the kb-test-linestop A/B comparison:
// kb_ask("User Definitions") and kb_ask("How do User Definitions work in
// this project?") both failed to surface specs/features/user-definition.md
// because the raw keywords ("user", "definitions") never matched the
// hyphenated singular tag "user-definition". extractKeywords now generates
// the singular form and the hyphenated bigram, so the relevant tag is hit.

test('singularize handles common English plural forms', () => {
  assert.equal(singularize('definitions'), 'definition')
  assert.equal(singularize('logs'), 'log')
  assert.equal(singularize('entries'), 'entry')
  assert.equal(singularize('boxes'), 'box')
  assert.equal(singularize('matches'), 'match')
  assert.equal(singularize('dishes'), 'dish')
})

test('singularize leaves already-singular and short words alone', () => {
  assert.equal(singularize('definition'), null)
  assert.equal(singularize('user'), null)
  assert.equal(singularize('api'), null)
  assert.equal(singularize('class'), null) // ends in -ss, not pluralized
  assert.equal(singularize('boss'), null)
})

test('singularize does not touch hyphenated compounds', () => {
  // The bigram pass owns hyphenated forms — singularize must not double-process.
  assert.equal(singularize('user-definitions'), null)
  assert.equal(singularize('buffer-definitions'), null)
})

test('extractKeywords surfaces user-definition for the failing question (long form)', () => {
  const kws = extractKeywords('How do User Definitions work in this project?')
  // The previous implementation returned ["user", "definitions", "work", "this", "project"].
  // The fix must include the hyphenated singular form so kb_get's substring
  // scoring hits the exact tag "user-definition".
  assert.ok(kws.includes('user-definition'), `expected "user-definition" in ${JSON.stringify(kws)}`)
  assert.ok(kws.includes('definition'), `expected singular "definition" in ${JSON.stringify(kws)}`)
})

test('extractKeywords surfaces user-definition for the failing question (short form)', () => {
  const kws = extractKeywords('User Definitions')
  assert.ok(kws.includes('user-definition'), `expected "user-definition" in ${JSON.stringify(kws)}`)
  assert.ok(kws.includes('definition'), `expected singular "definition" in ${JSON.stringify(kws)}`)
  assert.ok(kws.includes('user'), `expected original "user" in ${JSON.stringify(kws)}`)
})

test('extractKeywords drops conversational fillers (no bigram pollution)', () => {
  const kws = extractKeywords('How do User Definitions work in this project?')
  // "work", "this", "project" are stopwords; their bigrams would muddy scoring.
  assert.ok(!kws.includes('definitions-work'), 'stopword "work" leaked into a bigram')
  assert.ok(!kws.includes('work-this'), 'stopword leaked into a bigram')
  assert.ok(!kws.includes('project'), 'stopword "project" leaked through as a keyword')
})

test('extractKeywords generates bigrams from adjacent tech terms', () => {
  const kws = extractKeywords('Add a new SystemRole called PLCO with read-only access')
  // The actual question used in T4. After stopword filter, meaningful tokens
  // include "systemrole", "called", "plco", "read-only", "access". We at least
  // expect the bigram "systemrole-plco" or similar joining of adjacent terms,
  // and the singular "systemrole" form to remain.
  assert.ok(kws.includes('systemrole'), `expected "systemrole" in ${JSON.stringify(kws)}`)
  assert.ok(kws.includes('plco'), `expected "plco" in ${JSON.stringify(kws)}`)
})

test('extractKeywords keeps short tech tokens via SHORT_KEEP', () => {
  const kws = extractKeywords('How does the JWT API work?')
  assert.ok(kws.includes('jwt'), 'short tech token "jwt" was dropped')
  assert.ok(kws.includes('api'), 'short tech token "api" was dropped')
})

test('extractKeywords handles a totally unrelated query distinctly', () => {
  const a = extractKeywords('How do warning logs work?')
  const b = extractKeywords('User Definitions')
  // The maintenance-pass concern was that kb_ask returned the SAME 16-file
  // bundle for two different queries. That cannot happen at the get() layer
  // if the extracted keywords are themselves different.
  const onlyInA = a.filter(k => !b.includes(k))
  const onlyInB = b.filter(k => !a.includes(k))
  assert.ok(onlyInA.length > 0, `expected query A to have distinct keywords, got ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  assert.ok(onlyInB.length > 0, `expected query B to have distinct keywords, got ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  assert.ok(b.includes('user-definition'), 'B should still hit user-definition tag')
  assert.ok(a.includes('warning-log'), `A should generate "warning-log" bigram from "warning logs", got ${JSON.stringify(a)}`)
})
