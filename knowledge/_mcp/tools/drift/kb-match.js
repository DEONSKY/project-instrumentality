// KB-target pattern matching helpers shared by drift's detect phase, the
// queue rename handler, and the kb_confirmed resolver. Pure functions — no
// fs, no git.

function reverseMapKbTarget(kbRelative, patterns) {
  const codePaths = []
  for (const pattern of patterns) {
    if (matchesKbTargetPattern(pattern.kb_target, kbRelative)) {
      codePaths.push(...(pattern.paths || []))
    }
  }
  return [...new Set(codePaths)]
}

function matchesKbTargetPattern(patternTarget, actualPath) {
  const regexStr = patternTarget
    .replace(/\./g, '\\.')
    .replace(/\{name\}/g, '[^/]+')
  try {
    return new RegExp(`^${regexStr}$`).test(actualPath)
  } catch {
    return patternTarget === actualPath
  }
}

function isKbContentFile(file) {
  if (!file.startsWith('knowledge/')) return false
  const rel = file.replace(/^knowledge\//, '')
  if (rel.startsWith('_') || rel.startsWith('sync/') || rel.startsWith('exports/') || rel.startsWith('assets/')) return false
  return file.endsWith('.md')
}

module.exports = { reverseMapKbTarget, matchesKbTargetPattern, isKbContentFile }
