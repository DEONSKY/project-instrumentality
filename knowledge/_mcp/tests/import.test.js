const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const imp = require('../tools/import')

// Drive kb_import auto_classify in an isolated temp cwd so writes land in a
// throwaway knowledge/ dir (templates resolve to the bundled _templates).
let sandbox
let prevCwd

before(() => {
  prevCwd = process.cwd()
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kbimp-'))
  process.chdir(sandbox)
})

after(() => {
  process.chdir(prevCwd)
  fs.rmSync(sandbox, { recursive: true, force: true })
})

const longText = (label) =>
  `${label}: this section describes the behaviour in enough detail to clear the ` +
  `low-signal threshold so the importer will actually classify it rather than ` +
  `routing it straight to the review queue for being too short to reason about.`

test('A10: N chunks targeting one file are aggregated, not dropped', async () => {
  fs.rmSync('knowledge', { recursive: true, force: true })
  const source = path.join(sandbox, 'svc.md')
  fs.writeFileSync(source,
    `# PART\n## POST\n${longText('Create a part')}\n## GET\n${longText('Read a part')}\n`)

  let r = await imp.runTool({ source, auto_classify: true })
  assert.ok(r.batch && r.batch.length >= 2, 'two classifiable chunks')

  // Both endpoints classified to the SAME service id -> same target file.
  const classifications = r.batch.map(b => ({
    chunk_id: b.chunk_id,
    types: [{ type: 'integration', confidence: 0.9, suggested_id: 'part' }],
    suggested_group: 'web-services'
  }))
  r = await imp.runTool({ source, auto_classify: true, classifications, cursor: r.cursor })
  assert.equal(r.plan.summary.total_files, 1, 'two chunks aggregate into one file')

  r = await imp.runTool({ source, auto_classify: true, approve: true })
  assert.equal(r.skipped, 0, 'no chunk dropped via skip-if-exists')
  assert.deepEqual(r.files_written, ['knowledge/integrations/web-services/part.md'])

  const written = fs.readFileSync('knowledge/integrations/web-services/part.md', 'utf8')
  assert.match(written, /Create a part/, 'first endpoint content present')
  assert.match(written, /Read a part/, 'second endpoint content present (not lost)')
  assert.match(written, /import_chunk:\s*chunk-1,chunk-2/, 'provenance records both chunks')
  assert.equal(/\{\{/.test(written), false, 'no placeholders in written file')
})

test('new types route to correct folders', async () => {
  fs.rmSync('knowledge', { recursive: true, force: true })
  const source = path.join(sandbox, 'mix.md')
  fs.writeFileSync(source,
    `# A\n${longText('A logging subsystem')}\n# B\n${longText('A barcode numbering rule')}\n`)

  let r = await imp.runTool({ source, auto_classify: true })
  const cl = [
    { chunk_id: r.batch[0].chunk_id, types: [{ type: 'technical', confidence: 0.9, suggested_id: 'logging' }] },
    { chunk_id: r.batch[1].chunk_id, types: [{ type: 'policy', confidence: 0.9, suggested_id: 'barcode-rule' }] }
  ]
  r = await imp.runTool({ source, auto_classify: true, classifications: cl, cursor: r.cursor })
  const paths = r.plan.proposed_files.map(f => f.path).sort()
  assert.deepEqual(paths, ['knowledge/specs/policies/barcode-rule.md', 'knowledge/technical/logging.md'])
})

test('fill: true surfaces an import-map prompt per file', async () => {
  fs.rmSync('knowledge', { recursive: true, force: true })
  const source = path.join(sandbox, 'fill.md')
  fs.writeFileSync(source, `# Svc\n## GET\n${longText('Read something')}\n`)

  let r = await imp.runTool({ source, auto_classify: true, fill: true })
  const cl = r.batch.map(b => ({ chunk_id: b.chunk_id, types: [{ type: 'integration', confidence: 0.9, suggested_id: 'svc' }] }))
  r = await imp.runTool({ source, auto_classify: true, classifications: cl, cursor: r.cursor })
  assert.ok(Array.isArray(r.fill_prompts) && r.fill_prompts.length === 1, 'one fill prompt')
  assert.match(r.fill_prompts[0].prompt, /Read something/, 'prompt carries source text')
})
