// Universal constants for the kb-mcp tools and lib modules.
//
// STOPWORDS are deliberately NOT centralized: tag-extract.js and autorelate.js
// each define their own intentionally-different lists tuned to their algorithm
// (tag extraction filters domain noise more aggressively than relation extraction).
// Forcing them to share would change behavior. They live next to their consumers.

const KB_ROOT = 'knowledge'

module.exports = { KB_ROOT }
