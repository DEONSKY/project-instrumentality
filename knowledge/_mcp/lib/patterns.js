const path = require('path')

/**
 * Glob-style pattern matching for file paths.
 * Supports ** (any depth), * (single segment), ? (single char).
 */
function globMatch(filePath, pattern) {
  const regexStr = pattern
    .replace(/\*\*/g, '__DS__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DS__/g, '.*')
    .replace(/\?/g, '[^/]')
  try {
    return new RegExp(`^${regexStr}$`).test(filePath)
  } catch {
    return filePath.includes(pattern.replace(/\*/g, ''))
  }
}

/** Returns ALL matching patterns for a file (many-to-many support) */
function matchAllPatterns(codeFile, patterns) {
  const matches = []
  for (const pattern of patterns) {
    for (const p of (pattern.paths || [])) {
      if (globMatch(codeFile, p)) {
        matches.push(pattern)
        break // don't add same pattern twice if multiple paths within it match
      }
    }
  }
  return matches
}

/** Resolve a KB target path, replacing {name} with extracted name from code file */
function resolveKbTarget(pattern, codeFile) {
  let target = pattern.kb_target
  if (target.includes('{name}')) {
    target = target.replace('{name}', extractName(codeFile, pattern.name_extraction || {}))
  }
  return target
}

/** Extract a clean name from a file path using name_extraction rules */
function extractName(filePath, nameExtraction) {
  let name = path.basename(filePath, path.extname(filePath))
  for (const suffix of (nameExtraction.strip_suffix || [])) {
    if (name.endsWith(suffix)) { name = name.slice(0, -suffix.length); break }
  }
  if (nameExtraction.case === 'kebab') {
    name = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/-+/g, '-')
  }
  return name
}

module.exports = { globMatch, matchAllPatterns, resolveKbTarget, extractName }
