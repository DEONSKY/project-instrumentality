// KB-target pattern matching helpers shared by drift's detect phase, the
// queue rename handler, and the kb_confirmed resolver. Pure functions — no
// fs, no git.

interface DriftPattern { kb_target?: string | string[]; paths?: string[]; [key: string]: unknown }

function reverseMapKbTarget(kbRelative: string, patterns: DriftPattern[]): string[] {
  const codePaths: string[] = []
  for (const pattern of patterns) {
    if (matchesKbTargetPattern(pattern.kb_target, kbRelative)) {
      codePaths.push(...(pattern.paths || []))
    }
  }
  return [...new Set(codePaths)]
}

function matchesKbTargetPattern(patternTarget: string | string[] | undefined, actualPath: string): boolean {
  // `patternTarget` is a rule's `kb_target` field — string OR string[]. An
  // array matches if any candidate matches. Globs inside a candidate are also
  // converted to regex so recursive-form rules (e.g. recursive-glob feature
  // paths) can be reverse-mapped too.
  if (patternTarget == null) return false
  const candidates = Array.isArray(patternTarget) ? patternTarget : [patternTarget]
  for (const c of candidates) {
    const regexStr = c
      .replace(/\./g, '\\.')
      .replace(/\{name\}/g, '[^/]+')
      .replace(/\*\*/g, '__DS__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DS__/g, '.*')
    try {
      if (new RegExp(`^${regexStr}$`).test(actualPath)) return true
    } catch {
      if (c === actualPath) return true
    }
  }
  return false
}

function isKbContentFile(file: string): boolean {
  if (!file.startsWith('knowledge/')) return false
  const rel = file.replace(/^knowledge\//, '')
  if (rel.startsWith('_') || rel.startsWith('sync/') || rel.startsWith('exports/') || rel.startsWith('assets/')) return false
  return file.endsWith('.md')
}

export { reverseMapKbTarget, matchesKbTargetPattern, isKbContentFile }
