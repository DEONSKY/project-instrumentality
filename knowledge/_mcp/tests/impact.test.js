const { test } = require('node:test')
const assert = require('node:assert/strict')

// F14: regression test for camelCase / PascalCase tokenization in
// extractKeywords. The function used to split only on whitespace/punctuation
// so "linestopMail" was treated as one opaque token and never matched files
// referencing "linestop" or "mail" alone.

const { extractKeywords } = require('../tools/impact')

test('extractKeywords keeps the lowercased original for purely-lowercase tokens', () => {
  const out = extractKeywords('renaming linestop and mail')
  assert.ok(out.includes('renaming'))
  assert.ok(out.includes('linestop'))
  assert.ok(out.includes('mail'))
})

test('extractKeywords splits camelCase into both the full token and its parts', () => {
  const out = extractKeywords('Renaming linestopMail to lineStopMail')
  // Original lowercased forms (both spellings of the field) are present.
  assert.ok(out.includes('linestopmail'), `expected "linestopmail" in ${JSON.stringify(out)}`)
  // Camel split for lineStopMail → "line stop mail".
  assert.ok(out.includes('line'), `expected "line" in ${JSON.stringify(out)}`)
  assert.ok(out.includes('stop'), `expected "stop" in ${JSON.stringify(out)}`)
  assert.ok(out.includes('mail'), `expected "mail" in ${JSON.stringify(out)}`)
})

test('extractKeywords splits PascalCase tokens too', () => {
  const out = extractKeywords('UserDefinitionRecord rename')
  assert.ok(out.includes('userdefinitionrecord'), 'original lowercased token present')
  assert.ok(out.includes('user'))
  assert.ok(out.includes('definition'))
  assert.ok(out.includes('record'))
})

test('extractKeywords handles adjacent caps followed by lowercase (HTMLParser → HTML + Parser)', () => {
  const out = extractKeywords('HTMLParser change')
  assert.ok(out.includes('htmlparser'))
  // The two-pass split should separate HTML from Parser.
  assert.ok(out.includes('html'))
  assert.ok(out.includes('parser'))
})

test('extractKeywords filters STOP_WORDS but keeps SHORT_KEEP entries', () => {
  const out = extractKeywords('the api jwt and ssl')
  assert.ok(!out.includes('the'), 'stop word "the" filtered')
  assert.ok(!out.includes('and'), 'stop word "and" filtered')
  assert.ok(out.includes('api'), 'short keep "api" preserved')
  assert.ok(out.includes('jwt'), 'short keep "jwt" preserved')
  assert.ok(out.includes('ssl'), 'short keep "ssl" preserved')
})
