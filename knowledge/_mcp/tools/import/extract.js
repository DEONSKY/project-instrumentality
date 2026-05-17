// Document text extraction + chunking for kb_import.
//
// extractText reads PDF / DOCX / MD / TXT / HTML files into plain markdown
// (DOCX images are saved to knowledge/assets/imports/ and replaced with
// markdown image syntax). chunkDocument splits the text on markdown headings,
// falling back to paragraphs when no headings are found; oversize chunks are
// further sub-split by chunkDocument's helper.

const fs = require('fs')
const path = require('path')
const { htmlHeadingsToMarkdown } = require('../../lib/html-to-md-headings')

const SUPPORTED_FORMATS = ['.pdf', '.docx', '.md', '.txt', '.html']
const MAX_CHUNK_CHARS = 16000

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(`Unsupported format: ${ext}. Supported: ${SUPPORTED_FORMATS.join(', ')}`)
  }
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth')
    const assetsDir = path.join('knowledge', 'assets', 'imports')
    fs.mkdirSync(assetsDir, { recursive: true })

    let imageCounter = 0
    const baseName = path.basename(filePath, ext)

    const result = await mammoth.convertToHtml({
      path: filePath,
      convertImage: mammoth.images.imgElement(function (image) {
        imageCounter++
        const imgExt = image.contentType.split('/')[1] || 'png'
        const imgName = `${baseName}-img-${imageCounter}.${imgExt}`
        const imgPath = path.join(assetsDir, imgName)

        return image.readAsBuffer().then(function (buffer) {
          fs.writeFileSync(imgPath, buffer)
          return { src: `../../assets/imports/${imgName}` }
        })
      })
    })

    // Convert HTML img tags to markdown image syntax before stripping tags
    let html = result.value.replace(
      /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
      '![$2]($1)'
    )
    html = html.replace(
      /<img[^>]*src="([^"]*)"[^>]*\/?>/gi,
      '![]($1)'
    )

    return htmlHeadingsToMarkdown(html)
  }
  return fs.readFileSync(filePath, 'utf8')
}

function chunkDocument(text) {
  // Preserve fenced code blocks
  const codeBlocks = []
  const safeText = text.replace(/```[^\n]*\n[\s\S]*?\n```/g, (match) => {
    codeBlocks.push(match)
    const newlineCount = (match.match(/\n/g) || []).length
    return `__CODE_BLOCK_${codeBlocks.length - 1}__` + '\n'.repeat(Math.max(0, newlineCount - 1))
  })

  function restoreCodeBlocks(text) {
    let restored = text
    codeBlocks.forEach((block, idx) => {
      restored = restored.replace(`__CODE_BLOCK_${idx}__`, block)
    })
    return restored
  }

  // Split on markdown headings (H1-H6)
  const chunks = []
  const headingRegex = /\n(#{1,6}) /
  const sections = safeText.split(headingRegex)

  // sections alternates: [preamble, '#', 'heading + body', '##', 'heading + body', ...]
  // First element is text before any heading
  let idx = 0
  const headingStack = [] // tracks parent headings

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
      const subChunks = subSplitChunk(chunk, codeBlocks)
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

function subSplitChunk(chunk) {
  const { text, heading, heading_level, parent_heading } = chunk
  const subChunks = []
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

module.exports = {
  extractText,
  chunkDocument,
  SUPPORTED_FORMATS,
  MAX_CHUNK_CHARS
}
