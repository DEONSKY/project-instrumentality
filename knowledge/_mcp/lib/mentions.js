const WIKILINK_REGEX = /\[\[([^\]|#]+?)(?:#[^\]|]+?)?(?:\|[^\]]+?)?\]\]/g

/**
 * Extract wikilink references from KB content, ignoring code blocks and inline code.
 * Returns deduplicated array of bare paths (e.g. ["features/auth", "data/relations"]).
 */
function extractMentions(content) {
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  const mentions = []
  let match
  while ((match = WIKILINK_REGEX.exec(stripped)) !== null) {
    const p = match[1].trim()
    if (p) mentions.push(p)
  }
  return [...new Set(mentions)]
}

module.exports = { extractMentions }
