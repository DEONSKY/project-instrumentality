// Document text extraction + chunking for kb_import.
//
// extractText reads PDF / DOCX / MD / TXT / HTML files into plain markdown
// (DOCX images are saved to knowledge/assets/imports/ and replaced with
// markdown image syntax). chunkDocument splits the text on markdown headings,
// falling back to paragraphs when no headings are found; oversize chunks are
// further sub-split by chunkDocument's helper.

import * as fs from 'fs'
import * as path from 'path'
import { htmlHeadingsToMarkdown } from '../../lib/html-to-md-headings'
import * as images from './images'
import type { ImageContext } from './images'

const SUPPORTED_FORMATS = ['.pdf', '.docx', '.md', '.txt', '.html']
const MAX_CHUNK_CHARS = 16000
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tiff'
}

interface Chunk {
  id: string
  heading: string
  heading_level: number
  parent_heading: string
  text: string
  page_hint: string
}

interface ExtractResult { text: string; images: ImageContext['images'] }

interface MammothImage {
  contentType?: string
  altText?: string
  readAsBuffer(): Promise<Buffer>
}

// Build the per-import image context shared across the extraction passes.
function newImageContext(filePath: string): ImageContext {
  return {
    baseSlug: images.slugify(path.basename(filePath, path.extname(filePath)), 'import'),
    stagingDir: images.stagingDirFor(filePath),
    sourceDir: path.dirname(filePath),
    images: [],
    seen: new Set(),
    lastAlt: '',
    page: null
  }
}

// `extractText` returns { text, images } — text is markdown with bare
// `![[name]]` embeds; images is [{ name, alt, page }] staged on disk.
async function extractText(filePath: string): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(`Unsupported format: ${ext}. Supported: ${SUPPORTED_FORMATS.join(', ')}`)
  }
  const ctx = newImageContext(filePath)

  if (ext === '.pdf') {
    const text = await extractPdf(filePath, ctx)
    return { text, images: ctx.images }
  }
  if (ext === '.docx') {
    const text = await extractDocx(filePath, ctx)
    return { text, images: ctx.images }
  }
  if (ext === '.html') {
    let html = fs.readFileSync(filePath, 'utf8')
    html = images.extractDataUriImages(html, ctx)
    html = images.extractLocalFileImages(html, ctx)
    // Preserve remote images as markdown links — htmlHeadingsToMarkdown strips tags.
    html = html.replace(/<img\b[^>]*?src=["']\s*(https?:\/\/[^"']+?)\s*["'][^>]*>/gi, (m: string, url: string) => {
      const altM = /alt=["']([^"']*)["']/i.exec(m)
      return `![${altM ? altM[1] : ''}](${url})`
    })
    return { text: htmlHeadingsToMarkdown(html), images: ctx.images }
  }
  // .md / .txt
  let text = fs.readFileSync(filePath, 'utf8')
  text = images.extractDataUriImages(text, ctx)
  text = images.extractLocalFileImages(text, ctx)
  return { text, images: ctx.images }
}

async function extractDocx(filePath: string, ctx: ImageContext): Promise<string> {
  // mammoth ships no usable types here; treat as a loose record.
  const mammoth = require('mammoth') as {
    convertToHtml: (opts: unknown) => Promise<{ value: string }>
    images: { imgElement: (fn: (image: MammothImage) => Promise<{ src: string }>) => unknown }
  }
  const result = await mammoth.convertToHtml({
    path: filePath,
    // Stage each embedded image with a content-hashed name; emit a sentinel
    // src we convert to a bare embed below (before tags are stripped).
    convertImage: mammoth.images.imgElement((image: MammothImage) =>
      image.readAsBuffer().then((buffer: Buffer) => {
        const ext = EXT_BY_MIME[(image.contentType || '').toLowerCase()] || 'png'
        const name = images.imageName(ctx.baseSlug, image.altText || '', buffer, ext)
        if (!ctx.seen.has(name) && buffer.length >= images.MIN_IMAGE_BYTES) {
          ctx.seen.add(name)
          fs.mkdirSync(ctx.stagingDir, { recursive: true })
          const dest = path.join(ctx.stagingDir, name)
          if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer)
          ctx.images.push({ name, alt: image.altText || '', page: null })
        }
        return { src: `staged:${name}` }
      })
    )
  })
  let html = result.value
  html = images.extractDataUriImages(html, ctx)          // any base64 <img> residue
  html = html.replace(/<img\b[^>]*?src=["']staged:([^"']+?)["'][^>]*>/gi, (_m: string, name: string) => images.obsidianEmbed(name))
  return htmlHeadingsToMarkdown(html)
}

interface PdfTextItem { str: string; transform: number[] }
interface PdfPageData { pageNumber?: number; getTextContent(): Promise<{ items: PdfTextItem[] }> }

async function extractPdf(filePath: string, ctx: ImageContext): Promise<string> {
  const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: unknown) => Promise<{ text: string }>
  const buffer = fs.readFileSync(filePath)

  // Text via pdf-parse (proven), with a per-page marker appended so images can
  // be attached to the chunk that owns their page. Mirrors pdf-parse's default
  // render and just adds the marker, so text quality is unchanged.
  let pageNo = 0
  const data = await pdfParse(buffer, {
    pagerender: (pageData: PdfPageData) => {
      const n = pageData.pageNumber || ++pageNo
      return pageData.getTextContent().then((tc) => {
        let lastY: number | undefined, text = ''
        for (const item of tc.items) {
          text += (lastY === item.transform[5] || lastY === undefined ? '' : '\n') + item.str
          lastY = item.transform[5]
        }
        return `${text}\n\n@@PDFPAGE:${n}@@\n\n`
      })
    }
  })

  // Extract embedded images (page-exact), then place each page's embeds at its
  // marker; strip markers afterward.
  await images.extractPdfImages(filePath, ctx).catch(() => null)
  let text = insertPdfEmbeds(data.text, ctx.images)
  text = images.extractDataUriImages(text, ctx) // defensive
  return text
}

function insertPdfEmbeds(text: string, imageList: ImageContext['images']): string {
  const byPage = new Map<number, string[]>()
  for (const img of imageList) {
    if (img.page == null) continue
    if (!byPage.has(img.page)) byPage.set(img.page, [])
    byPage.get(img.page)!.push(img.name)
  }
  const placed = new Set<number>()
  let out = text.replace(/@@PDFPAGE:(\d+)@@/g, (_m: string, n: string) => {
    const page = parseInt(n, 10)
    const names = byPage.get(page)
    if (!names || !names.length) return ''
    placed.add(page)
    return '\n\n' + names.map(images.obsidianEmbed).join('\n\n') + '\n\n'
  })
  // Fallback: any page whose marker was missing → append its embeds at the end.
  const leftover: string[] = []
  for (const [page, names] of byPage) if (!placed.has(page)) leftover.push(...names)
  if (leftover.length) out += '\n\n' + leftover.map(images.obsidianEmbed).join('\n\n') + '\n'
  return out
}

function chunkDocument(text: string): Chunk[] {
  // Preserve fenced code blocks
  const codeBlocks: string[] = []
  const safeText = text.replace(/```[^\n]*\n[\s\S]*?\n```/g, (match: string) => {
    codeBlocks.push(match)
    const newlineCount = (match.match(/\n/g) || []).length
    return `__CODE_BLOCK_${codeBlocks.length - 1}__` + '\n'.repeat(Math.max(0, newlineCount - 1))
  })

  function restoreCodeBlocks(text: string): string {
    let restored = text
    codeBlocks.forEach((block, idx) => {
      restored = restored.replace(`__CODE_BLOCK_${idx}__`, block)
    })
    return restored
  }

  // Split on markdown headings (H1-H6)
  const chunks: Chunk[] = []
  const headingRegex = /\n(#{1,6}) /
  const sections = safeText.split(headingRegex)

  // sections alternates: [preamble, '#', 'heading + body', '##', 'heading + body', ...]
  // First element is text before any heading
  let idx = 0
  const headingStack: Array<{ level: number; heading: string }> = [] // tracks parent headings

  // Handle preamble (text before first heading)
  if (sections[0] && sections[0].trim().length >= 50) {
    const restored = restoreCodeBlocks(sections[0])
    chunks.push({
      id: 'chunk-1',
      heading: '',
      heading_level: 0,
      parent_heading: '',
      text: restored.trim(),
      page_hint: 'preamble'
    })
    idx = 1
  } else {
    idx = 1
  }

  let chunkCounter = chunks.length + 1

  // Process heading-content pairs
  while (idx < sections.length - 1) {
    const hashes = sections[idx]       // e.g., '##'
    const body = sections[idx + 1]     // heading text + content after heading
    idx += 2

    const level = hashes.length
    const restored = restoreCodeBlocks(body)
    if (restored.trim().length < 10) continue

    const lines = restored.trim().split('\n')
    const heading = lines[0].replace(/^#+\s*/, '').trim()
    const text = lines.slice(1).join('\n').trim() || heading

    // Update heading stack for parent tracking
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop()
    }
    const parentHeading = headingStack.length > 0 ? headingStack[headingStack.length - 1].heading : ''
    headingStack.push({ level, heading })

    const chunk = {
      id: `chunk-${chunkCounter}`,
      heading,
      heading_level: level,
      parent_heading: parentHeading,
      text,
      page_hint: `section ${chunkCounter}`
    }

    // Sub-split if chunk is too large
    if (text.length > MAX_CHUNK_CHARS) {
      const subChunks = subSplitChunk(chunk)
      chunks.push(...subChunks)
      chunkCounter += subChunks.length
    } else {
      chunks.push(chunk)
      chunkCounter++
    }
  }

  // Fallback: no headings found — split on paragraphs
  if (chunks.length === 0) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 80)
    paragraphs.forEach((para, i) => {
      const chunk = {
        id: `chunk-${i + 1}`,
        heading: '',
        heading_level: 0,
        parent_heading: '',
        text: para.trim(),
        page_hint: `paragraph ${i + 1}`
      }
      if (para.length > MAX_CHUNK_CHARS) {
        chunks.push(...subSplitChunk(chunk))
      } else {
        chunks.push(chunk)
      }
    })
  }

  return chunks
}

function subSplitChunk(chunk: Chunk): Chunk[] {
  const { text, heading, heading_level, parent_heading } = chunk
  const subChunks: Chunk[] = []
  const suffix = 'abcdefghijklmnopqrstuvwxyz'

  // Try splitting at sub-headings within the chunk text
  const subHeadingRegex = /\n(#{1,6}) /
  const parts = text.split(subHeadingRegex)

  if (parts.length > 2) {
    // Has sub-headings — use them as split points
    let partIdx = 0
    let subIdx = 0

    // Preamble before first sub-heading
    if (parts[0] && parts[0].trim().length >= 50) {
      subChunks.push({
        id: `${chunk.id}${suffix[subIdx] || subIdx}`,
        heading: heading + ' (cont.)',
        heading_level,
        parent_heading,
        text: parts[0].trim(),
        page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
      })
      subIdx++
    }
    partIdx = 1

    while (partIdx < parts.length - 1) {
      const subBody = parts[partIdx + 1] || ''
      if (subBody.trim().length >= 50) {
        const lines = subBody.trim().split('\n')
        subChunks.push({
          id: `${chunk.id}${suffix[subIdx] || subIdx}`,
          heading: lines[0].replace(/^#+\s*/, '').trim(),
          heading_level: parts[partIdx].length,
          parent_heading: heading,
          text: lines.slice(1).join('\n').trim() || lines[0],
          page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
        })
        subIdx++
      }
      partIdx += 2
    }

    if (subChunks.length > 0) return subChunks
  }

  // Fallback: split at paragraph boundaries
  const paragraphs = text.split(/\n\n+/)
  let buffer = ''
  let subIdx = 0

  for (const para of paragraphs) {
    if (buffer.length + para.length > MAX_CHUNK_CHARS && buffer.length > 0) {
      subChunks.push({
        id: `${chunk.id}${suffix[subIdx] || subIdx}`,
        heading: subIdx === 0 ? heading : heading + ' (cont.)',
        heading_level,
        parent_heading,
        text: buffer.trim(),
        page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
      })
      subIdx++
      buffer = para
    } else {
      buffer += (buffer ? '\n\n' : '') + para
    }
  }

  if (buffer.trim().length > 0) {
    subChunks.push({
      id: `${chunk.id}${suffix[subIdx] || subIdx}`,
      heading: subIdx === 0 ? heading : heading + ' (cont.)',
      heading_level,
      parent_heading,
      text: buffer.trim(),
      page_hint: `${chunk.page_hint}${suffix[subIdx] || subIdx}`
    })
  }

  return subChunks.length > 0 ? subChunks : [chunk]
}

export {
  extractText,
  chunkDocument,
  SUPPORTED_FORMATS,
  MAX_CHUNK_CHARS
}
