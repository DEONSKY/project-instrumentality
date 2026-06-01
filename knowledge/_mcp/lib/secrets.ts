const DEFAULT_PATTERNS = [
  'sk_live_',
  'Bearer ',
  'private_key',
  'password:',
  'api_key:',
  'secret:'
]

interface SecretViolation {
  pattern: string
  line: number
  column: number
  snippet: string
}

function scan(content: string, patterns: string[] = DEFAULT_PATTERNS): SecretViolation[] {
  const violations: SecretViolation[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const lineLower = line.toLowerCase()
    patterns.forEach(pattern => {
      const patLower = pattern.toLowerCase()
      const col = lineLower.indexOf(patLower)
      if (col !== -1) {
        violations.push({
          pattern,
          line: index + 1,
          column: col + 1,
          snippet: line.trim().slice(0, 60)
        })
      }
    })
  })

  return violations
}

export { scan, DEFAULT_PATTERNS }
