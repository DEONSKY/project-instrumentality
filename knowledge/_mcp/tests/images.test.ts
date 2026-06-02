const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PNG } = require('pngjs')

const images = require('../tools/import/images')
const { extractText } = require('../tools/import/extract')
const { extractMentions } = require('../lib/mentions')

// A PNG with random pixels so it won't compress below the MIN_IMAGE_BYTES floor.
function makePng(w = 48, h = 48) {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < png.data.length; i++) png.data[i] = (Math.random() * 256) | 0
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255 // opaque
  return PNG.sync.write(png)
}

function tmpCwd(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbimg-'))
  const prev = process.cwd()
  process.chdir(dir)
  try { return fn(dir) } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }) }
}
async function tmpCwdAsync(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbimg-'))
  const prev = process.cwd()
  process.chdir(dir)
  try { return await fn(dir) } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }) }
}

// ── pure helpers ─────────────────────────────────────────────────────────────

test('slugify normalises and falls back', () => {
  assert.equal(images.slugify('Create Defect!', 'img'), 'create-defect')
  assert.equal(images.slugify('', 'img'), 'img')
})

test('imageName is deterministic and content-addressed (dedupes identical bytes)', () => {
  const buf = makePng()
  const a = images.imageName('doc', 'Create Defect', buf, 'png')
  const b = images.imageName('doc', 'Create Defect', buf, 'png')
  assert.equal(a, b)                       // deterministic
  assert.match(a, /^doc-create-defect-[0-9a-f]{8}\.png$/)
  const c = images.imageName('doc', 'Other', makePng(64, 64), 'png')
  assert.notEqual(a, c)                    // different bytes → different name
})

test('embedsIn / stripEmbeds', () => {
  const t = 'before ![[a.png]] mid ![[sub/b.png|alt]] end [[not-an-embed]]'
  assert.deepEqual(images.embedsIn(t), ['a.png', 'sub/b.png'])
  assert.equal(images.stripEmbeds('x ![[a.png]] y').replace(/\s+/g, ' ').trim(), 'x y')
})

test('assetFolderFor mirrors the knowledge tree', () => {
  const got = images.assetFolderFor(path.join('knowledge', 'specs', 'features', 'create-defect.md'))
  assert.equal(got, path.join('knowledge', 'assets', 'specs', 'features', 'create-defect'))
})

test('headingBefore finds nearest preceding markdown or html heading', () => {
  const md = '## Create Defect\n\nsome text HERE'
  assert.equal(images.headingBefore(md, md.indexOf('HERE')), 'Create Defect')
  const html = '<h2>Operator Console</h2><p>x HERE</p>'
  assert.equal(images.headingBefore(html, html.indexOf('HERE')), 'Operator Console')
})

// ── mentions must ignore embeds ──────────────────────────────────────────────

test('extractMentions ignores ![[embeds]] but keeps [[links]]', () => {
  const content = 'See [[specs/features/auth]] and screenshot ![[my-img.png]] and ![[assets/x/y.png]].'
  const m = extractMentions(content)
  assert.deepEqual(m, ['specs/features/auth'])
})

// ── base64 data-URI extraction ───────────────────────────────────────────────

test('extractDataUriImages decodes markdown + html base64 to staged files + embeds', () => {
  tmpCwd(() => {
    const b64 = makePng().toString('base64')
    const ctx = { baseSlug: 'doc', stagingDir: path.join('knowledge', 'assets', 'imports', '.staging', 'doc'), images: [], seen: new Set(), lastAlt: '', page: null }
    // Same bytes + same context (alt) in both markdown and html forms ⇒ deduped.
    const md = `## Login\n\n![shot](data:image/png;base64,${b64})\n\n<img src="data:image/png;base64,${b64}" alt="shot">`
    const out = images.extractDataUriImages(md, ctx)
    assert.equal(ctx.images.length, 1)             // deduped to one
    assert.match(out, /!\[\[doc-shot-/)
    assert.equal((out.match(/!\[\[/g) || []).length, 2) // both positions embed the same file
    assert.doesNotMatch(out, /base64,/)            // no blob left in text
    const staged = fs.readdirSync(ctx.stagingDir)
    assert.equal(staged.length, 1)
    assert.ok(fs.statSync(path.join(ctx.stagingDir, staged[0])).size >= images.MIN_IMAGE_BYTES)
  })
})

// ── local-file extraction ────────────────────────────────────────────────────

test('extractLocalFileImages copies local images, leaves URLs and non-images', () => {
  tmpCwd((dir) => {
    fs.writeFileSync(path.join(dir, 'shot.png'), makePng())
    const ctx = { baseSlug: 'doc', sourceDir: dir, stagingDir: path.join('knowledge', 'assets', 'imports', '.staging', 'doc'), images: [], seen: new Set(), lastAlt: '', page: null }
    const md = '![local](shot.png)\n![remote](https://example.com/x.png)\n![doc](notes.pdf)'
    const out = images.extractLocalFileImages(md, ctx)
    assert.equal(ctx.images.length, 1)                       // only the local png
    assert.match(out, /!\[\[doc-local-[0-9a-f]{8}\.png\]\]/) // local → embed
    assert.match(out, /\(https:\/\/example\.com\/x\.png\)/)  // remote untouched
    assert.match(out, /\(notes\.pdf\)/)                      // non-image untouched
  })
})

// ── relocateImages ───────────────────────────────────────────────────────────

test('relocateImages moves staged files into the doc mirror folder', () => {
  tmpCwd(() => {
    const stagingDir = path.join('knowledge', 'assets', 'imports', '.staging', 'doc')
    fs.mkdirSync(stagingDir, { recursive: true })
    fs.writeFileSync(path.join(stagingDir, 'img-1.png'), makePng())
    const docPath = path.join('knowledge', 'specs', 'features', 'x.md')
    const moved = images.relocateImages(['img-1.png'], stagingDir, docPath)
    assert.deepEqual(moved, ['img-1.png'])
    assert.ok(fs.existsSync(path.join('knowledge', 'assets', 'specs', 'features', 'x', 'img-1.png')))
    assert.ok(!fs.existsSync(path.join(stagingDir, 'img-1.png')))  // moved, not copied
  })
})

// ── end-to-end extractText ───────────────────────────────────────────────────

test('extractText(.md) returns {text, images} with base64 turned into an embed', async () => {
  await tmpCwdAsync(async (dir) => {
    const b64 = makePng().toString('base64')
    const src = path.join(dir, 'doc.md')
    fs.writeFileSync(src, `## Overview\n\nIntro text.\n\n![screen](data:image/png;base64,${b64})\n`)
    const { text, images: imgs } = await extractText(src)
    assert.equal(imgs.length, 1)
    assert.match(text, /!\[\[doc-/)
    assert.doesNotMatch(text, /base64,/)
  })
})

test('extractText(.docx) extracts embedded image as an embed', async () => {
  await tmpCwdAsync(async (dir) => {
    const { Document, Packer, Paragraph, ImageRun, HeadingLevel, TextRun } = require('docx')
    const png = makePng(64, 64)
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Create Defect')] }),
          new Paragraph({ children: [new ImageRun({ data: png, transformation: { width: 64, height: 64 } })] })
        ]
      }]
    })
    const src = path.join(dir, 'spec.docx')
    fs.writeFileSync(src, await Packer.toBuffer(doc))
    const { text, images: imgs } = await extractText(src)
    assert.ok(imgs.length >= 1, 'expected at least one extracted image')
    assert.match(text, /!\[\[spec-/)
    assert.doesNotMatch(text, /<img/)   // no raw img tag survived
  })
})

test('extractText(.pdf) extracts embedded image and attaches it by page', async () => {
  await tmpCwdAsync(async (dir) => {
    const PDFDocument = require('pdfkit')
    const png = makePng(64, 64)
    const src = path.join(dir, 'doc.pdf')
    await new Promise((res, rej) => {
      const out = fs.createWriteStream(src)
      const d = new PDFDocument()
      d.pipe(out)
      d.fontSize(18).text('Page one', 100, 100)
      d.addPage()
      d.fontSize(18).text('Page two screenshot', 100, 100)
      d.image(png, 100, 150, { width: 64 })
      d.end()
      out.on('finish', res); out.on('error', rej)
    })
    const { text, images: imgs } = await extractText(src)
    assert.ok(imgs.length >= 1, 'expected an embedded PDF image')
    assert.ok(imgs.every(i => typeof i.page === 'number'))
    assert.match(text, /!\[\[doc-/)
    assert.doesNotMatch(text, /@@PDFPAGE/)  // markers stripped
  })
})
