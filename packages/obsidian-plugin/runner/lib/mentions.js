const WIKILINK_REGEX = /!?\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|[^\]]+?)?\]\]/g

/**
 * Extract wikilink references from KB content, ignoring code blocks and inline code.
 * Returns deduplicated array of paths, preserving #section where present
 * (e.g. ["features/auth", "data/schema/postgres#users"]).
 */
function extractMentions(content) {
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  const mentions = []
  let match
  while ((match = WIKILINK_REGEX.exec(stripped)) !== null) {
    const p = match[1].trim()
    const section = match[2] ? match[2].trim() : null
    if (p) mentions.push(section ? `${p}#${section}` : p)
  }
  return [...new Set(mentions)]
}

module.exports = { extractMentions }
