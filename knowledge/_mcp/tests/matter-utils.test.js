const { test } = require('node:test')
const assert = require('node:assert/strict')
const matter = require('gray-matter')
const { matterStringify } = require('../lib/matter-utils')

// Regression: kb_autotag was rewriting `created: 2026-04-05T00:00:00.000Z`
// to `created: {}` because encodePlaceholders treated the parsed Date as a
// plain object and enumerated its (empty) own properties before yaml.dump
// could serialize it as a timestamp. Surfaced by the kb-test-linestop
// maintenance pass on 2026-05-29.

test('matterStringify preserves Date values as YAML timestamps', () => {
  const input = `---
id: example
created: 2026-04-05T00:00:00.000Z
tags: [a, b, c]
---

body content
`
  const parsed = matter(input)
  // Sanity: gray-matter parses the timestamp as a Date.
  assert.ok(parsed.data.created instanceof Date, 'gray-matter should yield a Date for ISO timestamps')

  const out = matterStringify(parsed.content, parsed.data)

  assert.ok(!out.includes('created: {}'), `created field collapsed to {}\n---\n${out}`)
  // Round-trip: re-parse the output and check the field is still a date with
  // the same epoch.
  const reparsed = matter(out)
  assert.ok(reparsed.data.created instanceof Date, 'round-tripped created should be a Date')
  assert.equal(
    reparsed.data.created.toISOString(),
    parsed.data.created.toISOString(),
    'round-tripped Date should preserve the original ISO timestamp'
  )
})

test('matterStringify preserves date-only timestamps (no time component)', () => {
  const input = `---
id: example
created: 2026-04-05
tags: [a]
---

body
`
  const parsed = matter(input)
  assert.ok(parsed.data.created instanceof Date)

  const out = matterStringify(parsed.content, parsed.data)
  assert.ok(!out.includes('created: {}'), `created field collapsed to {}\n---\n${out}`)

  const reparsed = matter(out)
  assert.ok(reparsed.data.created instanceof Date)
})

test('matterStringify still emits scalar arrays in flow style', () => {
  // Pre-existing contract from the encodePlaceholders design — verify the
  // Date pass-through didn't break the placeholder substitution.
  const input = `---
id: example
tags: [alpha, beta, gamma]
---

body
`
  const parsed = matter(input)
  const out = matterStringify(parsed.content, parsed.data)
  assert.match(out, /tags:\s*\[alpha,\s*beta,\s*gamma\]/, `expected flow-style tags, got\n${out}`)
})

test('matterStringify preserves nested objects without Date corruption', () => {
  const input = `---
id: example
created: 2026-04-05T00:00:00.000Z
nested:
  child:
    grand: value
    when: 2026-05-01T12:00:00.000Z
---

body
`
  const parsed = matter(input)
  const out = matterStringify(parsed.content, parsed.data)
  assert.ok(!out.includes('created: {}'), 'top-level Date collapsed')
  assert.ok(!out.includes('when: {}'), `nested Date collapsed\n---\n${out}`)
  const reparsed = matter(out)
  assert.equal(reparsed.data.nested.child.grand, 'value')
  assert.ok(reparsed.data.nested.child.when instanceof Date)
})
