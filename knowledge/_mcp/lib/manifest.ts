import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const MANIFEST_FILENAME = '.mcp-manifest.json'

// { relPath: sha256hex }
type TemplateHashes = Record<string, string>

interface Manifest {
  mcp_version: string
  installed_at: string
  templates: TemplateHashes
}

interface TemplateFile {
  relPath: string
  absPath: string
}

/**
 * SHA-256 hex digest of a file's content.
 */
function hashFileContent(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8')
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Load the manifest from a project templates directory.
 * Returns the parsed object or null if missing/corrupt.
 */
function loadManifest(projectTemplatesDir: string): Manifest | null {
  const manifestPath = path.join(projectTemplatesDir, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest
  } catch {
    return null
  }
}

/**
 * Write the manifest to a project templates directory.
 * @param projectTemplatesDir
 * @param version - MCP version string
 * @param templateHashes - { relPath: sha256hex }
 */
function writeManifest(projectTemplatesDir: string, version: string, templateHashes: TemplateHashes): void {
  const manifestPath = path.join(projectTemplatesDir, MANIFEST_FILENAME)
  const manifest: Manifest = {
    mcp_version: version,
    installed_at: new Date().toISOString(),
    templates: templateHashes
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

/**
 * Recursively walk a directory and return all .md files.
 */
function walkTemplateFiles(dir: string, base = ''): TemplateFile[] {
  const results: TemplateFile[] = []
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
 * @returns { relPath: sha256hex }
 */
function buildTemplateHashes(dir: string): TemplateHashes {
  const hashes: TemplateHashes = {}
  for (const { relPath, absPath } of walkTemplateFiles(dir)) {
    hashes[relPath] = hashFileContent(absPath)
  }
  return hashes
}

export {
  MANIFEST_FILENAME,
  hashFileContent,
  loadManifest,
  writeManifest,
  walkTemplateFiles,
  buildTemplateHashes
}
