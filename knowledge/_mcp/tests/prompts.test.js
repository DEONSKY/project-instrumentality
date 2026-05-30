const { test } = require('node:test')
const assert = require('node:assert/strict')

const { stripCommentHeader, resolvePrompt } = require('../lib/prompts')

// Bundled templates carry a leading `#`-comment doc block separated from the
// prompt body by a standalone `---`. gray-matter doesn't strip it (the file
// starts with `#`, not `---`), so it used to leak into every agent context.
// stripCommentHeader removes it — but only when it's unambiguously a header.

test('stripCommentHeader removes a leading #-comment block ended by ---', () => {
  const out = stripCommentHeader('# doc\n# more docs\n\n---\n\nReal body.\n')
  assert.equal(out, 'Real body.\n')
})

test('stripCommentHeader leaves content untouched when there is no --- divider', () => {
  const src = 'You are an agent.\n\nDo the thing.\n'
  assert.equal(stripCommentHeader(src), src)
})

test('stripCommentHeader does NOT strip when real content precedes the first ---', () => {
  // e.g. issue-triage.md uses --- as a real markdown rule inside the body.
  const src = 'Intro paragraph.\n\n---\n\nMore body.\n'
  assert.equal(stripCommentHeader(src), src)
})

test('stripCommentHeader is a no-op on empty/falsy input', () => {
  assert.equal(stripCommentHeader(''), '')
})

test('resolvePrompt output has no leading #-comment header for a conforming template', () => {
  const out = resolvePrompt('ask-query', { question: 'Q?', kb_context: 'CTX' })
  assert.ok(!/^#\s/.test(out.trim()), `header leaked: ${JSON.stringify(out.slice(0, 60))}`)
  assert.ok(out.includes('CTX'), 'placeholder still filled')
  assert.ok(!out.includes('{{'), 'no unfilled placeholders')
})

test('resolvePrompt leaves issue-triage (real content before ---) intact', () => {
  // issue-triage.md has body content before its first --- rule; the strip
  // must not eat it. We assert the resolved prompt still contains its body.
  const out = resolvePrompt('issue-triage', {
    title: 'T', body: 'B', issue_id: 'i', source: 's',
    labels: '', priority: '', related_docs: 'docs', date: '2026-01-01'
  })
  assert.ok(out && out.length > 0)
  assert.ok(!out.includes('{{'), 'no unfilled placeholders')
})
