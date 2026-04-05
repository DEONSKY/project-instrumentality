const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MANIFEST_FILENAME = '.mcp-manifest.json'

/**
 * SHA-256 hex digest of a file's content.
 */
function hashFileContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Load the manifest from a project templates directory.
 * Returns the parsed object or null if missing/corrupt.
 */
function loadManifest(projectTemplatesDir) {
  const manifestPath = path.join(projectTemplatesDir, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Write the manifest to a project templates directory.
 * @param {string} projectTemplatesDir
 * @param {string} version - MCP version string
 * @param {Object} templateHashes - { relPath: sha256hex }
 */
function writeManifest(projectTemplatesDir, version, templateHashes) {
  const manifestPath = path.join(projectTemplatesDir, MANIFEST_FILENAME)
  const manifest = {
    mcp_version: version,
    installed_at: new Date().toISOString(),
    templates: templateHashes
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

/**
 * Recursively walk a directory and return all .md files.
 * @returns {Array<{relPath: string, absPath: string}>}
 */
function walkTemplateFiles(dir, base = '') {
  const results = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkTemplateFiles(abs, rel))
    } else if (entry.name.endsWith('.md')) {
      results.push({ relPath: rel, absPath: abs })
    }
  }
  return results
}

/**
 * Build a hash map of all .md template files in a directory.
 * @returns {Object} { relPath: sha256hex }
 */
function buildTemplateHashes(dir) {
  const hashes = {}
  for (const { relPath, absPath } of walkTemplateFiles(dir)) {
    hashes[relPath] = hashFileContent(absPath)
  }
  return hashes
}

module.exports = {
  MANIFEST_FILENAME,
  hashFileContent,
  loadManifest,
  writeManifest,
  walkTemplateFiles,
  buildTemplateHashes
}
