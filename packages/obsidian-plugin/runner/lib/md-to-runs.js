/**
 * Shared markdown inline formatting helpers for PDF and DOCX writers.
 */

/**
 * Strip inline markdown markers for plain-text output (PDF).
 */
function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}

/**
 * Parse inline markdown into docx TextRun[] objects.
 * Handles **bold**, *italic*, and `code` spans.
 */
function parseInlineFormatting(text) {
  const { TextRun } = require('docx')
  const runs = []
  // Match **bold**, *italic*, `code` — bold must come before italic
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }))
    }
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }))
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }))
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: 'Courier New' }))
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }))
  }

  return runs.length > 0 ? runs : [new TextRun({ text })]
}

module.exports = { stripInlineMarkdown, parseInlineFormatting }
