/**
 * Infer KB document type from its relative path (relative to knowledge/).
 * Shared by reindex and lint to ensure consistent type derivation.
 */
function inferType(relativePath) {
  if (relativePath.startsWith('features/')) return 'feature'
  if (relativePath.startsWith('flows/')) return 'flow'
  if (relativePath.startsWith('data/schema/')) return 'schema'
  if (relativePath.startsWith('validation/')) return 'validation'
  if (relativePath.startsWith('integrations/')) return 'integration'
  if (relativePath.startsWith('decisions/')) return 'decision'
  if (relativePath.startsWith('standards/')) return 'standard'
  if (relativePath.startsWith('ui/')) return 'ui'
  if (relativePath.startsWith('data/')) return 'data'
  return 'unknown'
}

module.exports = { inferType }
