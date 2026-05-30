const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const yaml = require('js-yaml')

// F14: regression test for camelCase / PascalCase tokenization in
// extractKeywords. The function used to split only on whitespace/punctuation
// so "linestopMail" was treated as one opaque token and never matched files
// referencing "linestop" or "mail" alone.

const { extractKeywords, runTool } = require('../tools/impact')

const ORIGINAL_CWD = process.cwd()
function withKb(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-impact-test-'))
    const file = 'specs/features/billing.md'
    fs.mkdirSync(path.join(dir, 'knowledge/specs/features'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'knowledge', file),
      '---\nid: billing\ntype: feature\ntags: [billing, invoice]\n---\n\n# Billing\n\nThe billing invoice flow handles charges.\n'
    )
    const index = { version: '1.0', groups: {}, files: { [file]: { id: 'billing', type: 'feature', tags: ['billing', 'invoice'] } } }
    fs.writeFileSync(path.join(dir, 'knowledge/_index.yaml'), yaml.dump(index))
    process.chdir(dir)
    try { await fn() } finally { process.chdir(ORIGINAL_CWD) }
  }
}

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

// Payload shape: the per-file proposal prompt (broken — it passed
// file_path/file_content but the template wants affected_file/affected_content,
// so the body was never inserted and the template comment header leaked) is
// removed from the default response in favour of a single proposal_instruction.

test('runTool default omits per-file prompt and emits proposal_instruction', withKb(async () => {
  const res = await runTool({ change_description: 'rename the billing invoice field' })
  assert.ok(res.affected_files.length > 0, 'matched at least one file')
  const f = res.affected_files[0]
  assert.ok(!('prompt' in f), 'per-file prompt omitted by default')
  assert.ok('path' in f && 'score' in f && 'why' in f && 'snippet' in f, 'lean per-file shape')
  assert.ok(res.proposal_instruction, 'proposal_instruction present')
  assert.ok(!res.proposal_instruction.includes('{{'), 'instruction has no unfilled placeholders')
  assert.ok(!/^#\s/.test(res.proposal_instruction.trim()), 'instruction has no leaked comment header')
}))

test('runTool include_prompts:true attaches per-file prompts with real placeholders filled', withKb(async () => {
  const res = await runTool({ change_description: 'rename the billing invoice field', include_prompts: true })
  const f = res.affected_files[0]
  assert.ok(typeof f.prompt === 'string' && f.prompt.length > 0, 'per-file prompt attached')
  assert.ok(!f.prompt.includes('{{'), 'no unfilled placeholders (affected_file/affected_content now passed)')
  assert.ok(f.prompt.includes(f.path), 'affected_file placeholder filled with the path')
}))
