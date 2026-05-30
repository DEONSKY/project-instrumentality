// Image handling for kb_import.
//
// Images are never classified or read as binary for *context* — they ride along
// with the text section they belong to. The classifier only ever sees text
// (alt / caption / heading), which is where an image's context comes from.
//
// Flow: at extract time, every image (inline base64 data-URI, DOCX-embedded,
// HTML <img>, local markdown ref, or PDF-embedded) is written to a per-import
// STAGING folder and replaced in the text with a bare Obsidian embed
// `![[name]]`. Obsidian resolves embeds by filename vault-wide, so at approve
// time we just move the staged file into the target document's mirror folder
// (knowledge/assets/<doc-path>/) — no embed rewrite needed. Filenames carry a
// content hash, which makes them globally unique AND dedupes identical images.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PNG } = require('pngjs')

const STAGING_ROOT = path.join('knowledge', 'assets', 'imports', '.staging')
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'])
const EXT_BY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tiff'
}
const MIN_IMAGE_BYTES = 512  // drop decorative slivers / 1px spacers

const obsidianEmbed = (name) => `![[${name}]]`

function slugify(s, fallback) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return out || fallback
}

function hash8(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 8)
}

// Globally-unique, context-bearing name. The content hash dedupes identical
// images (same bytes → same name) and keeps names deterministic across a
// resume re-extraction.
function imageName(baseSlug, context, buffer, ext) {
  return `${baseSlug}-${slugify(context, 'img')}-${hash8(buffer)}.${ext}`
}

function stagingDirFor(source) {
  return path.join(STAGING_ROOT, slugify(path.basename(source, path.extname(source)), 'import'))
}

// Mirror the knowledge tree: a doc at knowledge/specs/features/x.md gets assets
// under knowledge/assets/specs/features/x/. Filesystem path only — never an embed.
function assetFolderFor(targetDocPath) {
  const rel = path.relative('knowledge', targetDocPath).replace(/\.md$/i, '')
  return path.join('knowledge', 'assets', rel)
}

// Nearest preceding heading (markdown `## …` or HTML `<hN>…`) before `offset`,
// so an alt-less image gets a title-bearing name ("…-create-defect-<hash>").
function headingBefore(text, offset) {
  const prefix = text.slice(0, offset)
  let best = { idx: -1, title: '' }
  const md = /(?:^|\n)#{1,6}[ \t]+([^\n]+)/g
  const html = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi
  let m
  while ((m = md.exec(prefix))) if (m.index > best.idx) best = { idx: m.index, title: m[1] }
  while ((m = html.exec(prefix))) if (m.index > best.idx) best = { idx: m.index, title: m[1] }
  return best.title.replace(/<[^>]+>/g, '').trim()
}

function ensureStaged(ctx, name, buffer) {
  if (ctx.seen.has(name)) return false  // dedupe by content-hash name
  ctx.seen.add(name)
  if (buffer.length < MIN_IMAGE_BYTES) return false
  fs.mkdirSync(ctx.stagingDir, { recursive: true })
  const dest = path.join(ctx.stagingDir, name)
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer)
  ctx.images.push({ name, alt: ctx.lastAlt || '', page: ctx.page ?? null })
  return true
}

// ── Inline base64 data-URIs (markdown ![](data:…) + <img src="data:…">) ──────
// Universal pass — kills "giant base64 blob" chunks (HTML exports, DOCX residue).
function extractDataUriImages(text, ctx) {
  const handle = (offset, mime, b64, alt) => {
    const ext = EXT_BY_MIME[mime.toLowerCase()] || 'png'
    const buffer = Buffer.from(b64.replace(/\s+/g, ''), 'base64')
    const context = alt || headingBefore(text, offset)
    const name = imageName(ctx.baseSlug, context, buffer, ext)
    ctx.lastAlt = alt
    ensureStaged(ctx, name, buffer)
    return obsidianEmbed(name)
  }
  let out = text.replace(
    /!\[([^\]]*)\]\(\s*data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)\s*\)/gi,
    (m, alt, mime, b64, offset) => handle(offset, mime, b64, alt)
  )
  out = out.replace(
    /<img\b[^>]*?src=["']\s*data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)\s*["'][^>]*>/gi,
    (m, mime, b64, offset) => {
      const altM = /alt=["']([^"']*)["']/i.exec(m)
      return handle(offset, mime, b64, altM ? altM[1] : '')
    }
  )
  return out
}

// ── Local file references (markdown / HTML) ──────────────────────────────────
// `![](relative.png)` / `<img src="relative.png">` to a real local image →
// copy into staging, embed by filename. Remote URLs and non-image refs untouched.
function extractLocalFileImages(text, ctx) {
  const copy = (ref, alt, offset) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || ref.startsWith('data:')) return null // url / data-uri
    const cleanRef = decodeURIComponent(ref.split('#')[0])
    const ext = (path.extname(cleanRef).slice(1) || '').toLowerCase()
    if (!IMAGE_EXTS.has(ext)) return null
    const abs = path.resolve(ctx.sourceDir || '.', cleanRef)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null
    const buffer = fs.readFileSync(abs)
    const context = alt || headingBefore(text, offset) || path.basename(abs, path.extname(abs))
    const name = imageName(ctx.baseSlug, context, buffer, ext)
    ctx.lastAlt = alt
    return ensureStaged(ctx, name, buffer) ? obsidianEmbed(name) : null
  }
  let out = text.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g, (m, alt, ref, offset) => copy(ref, alt, offset) || m)
  out = out.replace(/<img\b[^>]*?src=["']\s*([^"']+?)\s*["'][^>]*>/gi, (m, ref, offset) => {
    const altM = /alt=["']([^"']*)["']/i.exec(m)
    return copy(ref, altM ? altM[1] : '', offset) || m
  })
  return out
}

// ── PDF embedded images (pure JS via pdfjs-dist) ─────────────────────────────
// pdfjs decodes each image XObject to a bitmap (kind 1=gray / 2=RGB / 3=RGBA);
// we normalise to RGBA and encode PNG via pngjs. Each image carries its exact
// page index, used by extract.js to attach it to the right chunk.
function bitmapToPng(img) {
  const { width, height, kind, data } = img
  if (!data || !width || !height) return null
  const png = new PNG({ width, height })
  const out = png.data
  const px = width * height
  if (kind === 3) {                 // RGBA_32BPP
    out.set(data.subarray ? data.subarray(0, out.length) : data.slice(0, out.length))
  } else if (kind === 2) {          // RGB_24BPP
    for (let i = 0, j = 0; i < px; i++) { out[j++] = data[i * 3]; out[j++] = data[i * 3 + 1]; out[j++] = data[i * 3 + 2]; out[j++] = 255 }
  } else if (kind === 1) {          // GRAYSCALE_8BPP
    for (let i = 0; i < px; i++) { const g = data[i]; out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = 255 }
  } else {
    return null                     // exotic/undecoded — caller skips
  }
  return PNG.sync.write(png)
}

async function extractPdfImages(source, ctx) {
  let pdfjs
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch {
    return { ok: false, reason: 'pdfjs-dist not available' }
  }
  const data = new Uint8Array(fs.readFileSync(source))
  const pdf = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise
  const skipped = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const ops = await page.getOperatorList()
    const names = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
        names.push(ops.argsArray[i][0])
      }
    }
    for (const name of names) {
      let img
      try {
        img = await new Promise((res, rej) => { try { page.objs.get(name, res) } catch (e) { rej(e) } })
      } catch { skipped.push({ page: p, name, reason: 'unresolved' }); continue }
      const png = bitmapToPng(img)
      if (!png) { skipped.push({ page: p, name, reason: `kind ${img && img.kind}` }); continue }
      const nm = imageName(ctx.baseSlug, '', png, 'png')
      ctx.page = p
      ctx.lastAlt = ''
      ensureStaged(ctx, nm, png)
    }
    page.cleanup()
  }
  ctx.page = null
  await pdf.cleanup()
  return { ok: true, skipped }
}

// ── Write-time relocation + cleanup ──────────────────────────────────────────
function embedsIn(text) {
  const names = []
  const re = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g
  let m
  while ((m = re.exec(text || ''))) names.push(m[1].trim())
  return names
}

// Strip embeds so downstream text scans (pre-filter, cross-refs) don't trip on
// image filenames.
function stripEmbeds(text) {
  return String(text || '').replace(/!\[\[[^\]]*\]\]/g, ' ')
}

// Move named staged images into a document's mirror folder. Bare-filename embeds
// resolve post-move, so no content change. Copy-fallback handles a shared image
// (already moved by another doc) and cross-drive EXDEV.
function relocateImages(names, stagingDir, targetDocPath) {
  const destDir = assetFolderFor(targetDocPath)
  const moved = []
  for (const name of names) {
    const from = path.join(stagingDir, name)
    const to = path.join(destDir, name)
    if (fs.existsSync(to)) { moved.push(name); continue }
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(destDir, { recursive: true })
    try { fs.renameSync(from, to) }
    catch { fs.copyFileSync(from, to); try { fs.rmSync(from, { force: true }) } catch { /* ignore */ } }
    moved.push(name)
  }
  return moved
}

function removeStagingDir(source) {
  try { fs.rmSync(stagingDirFor(source), { recursive: true, force: true }) } catch { /* ignore */ }
}

module.exports = {
  STAGING_ROOT,
  IMAGE_EXTS,
  MIN_IMAGE_BYTES,
  obsidianEmbed,
  slugify,
  hash8,
  imageName,
  stagingDirFor,
  assetFolderFor,
  headingBefore,
  extractDataUriImages,
  extractLocalFileImages,
  extractPdfImages,
  bitmapToPng,
  embedsIn,
  stripEmbeds,
  relocateImages,
  removeStagingDir
}
