/**
 * Lightweight HTML → Markdown converter for mammoth's clean HTML output.
 * Converts heading tags to markdown # syntax, paragraphs to double newlines,
 * and strips remaining HTML. No external dependencies.
 */
function htmlHeadingsToMarkdown(html) {
  let md = html

  // Convert heading tags to markdown (h1-h6)
  for (let i = 1; i <= 6; i++) {
    const hashes = '#'.repeat(i)
    // Handle both <hN>text</hN> and <hN attr="...">text</hN>
    md = md.replace(
      new RegExp(`<h${i}[^>]*>(.*?)</h${i}>`, 'gi'),
      `\n${hashes} $1\n`
    )
  }

  // Convert list items before stripping tags
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')

  // Convert paragraphs to double newlines
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n')

  // Convert bold/strong
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')

  // Convert italic/em
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')

  // Convert tables (basic: preserve as text)
  md = md.replace(/<table[^>]*>/gi, '\n')
  md = md.replace(/<\/table>/gi, '\n')
  md = md.replace(/<tr[^>]*>/gi, '')
  md = md.replace(/<\/tr>/gi, '\n')
  md = md.replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi, '$1\t')

  // Strip all remaining HTML tags
  md = md.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&')
  md = md.replace(/&lt;/g, '<')
  md = md.replace(/&gt;/g, '>')
  md = md.replace(/&quot;/g, '"')
  md = md.replace(/&#39;/g, "'")
  md = md.replace(/&nbsp;/g, ' ')

  // Collapse 3+ consecutive newlines to 2
  md = md.replace(/\n{3,}/g, '\n\n')

  return md.trim()
}

module.exports = { htmlHeadingsToMarkdown }
