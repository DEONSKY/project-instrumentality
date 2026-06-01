// Ambient declarations for runtime deps that ship no TypeScript types and have
// no @types package. Kept minimal — only the surface kb-mcp actually uses.
// Prefer extending these over reaching for `any` at call sites.

declare module 'pdfkit' {
  import { Writable } from 'node:stream'

  interface PDFTextOptions {
    paragraphGap?: number
    indent?: number
    [key: string]: unknown
  }

  interface PDFDocumentOptions {
    margin?: number
    [key: string]: unknown
  }

  class PDFDocument {
    constructor(options?: PDFDocumentOptions)
    pipe(destination: Writable): this
    addPage(): this
    fontSize(size: number): this
    font(name: string): this
    text(text: string, options?: PDFTextOptions): this
    moveDown(lines?: number): this
    end(): void
  }

  export = PDFDocument
}
