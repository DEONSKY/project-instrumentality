const DEFAULT_PATTERNS = [
  'sk_live_',
  'Bearer ',
  'private_key',
  'password:',
  'api_key:',
  'secret:'
]

function scan(content, patterns = DEFAULT_PATTERNS) {
  const violations = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    patterns.forEach(pattern => {
      if (line.includes(pattern)) {
        const column = line.indexOf(pattern)
        violations.push({
          pattern,
          line: index + 1,
          column: column + 1,
          snippet: line.trim().slice(0, 60)
        })
      }
    })
  })

  return violations
}

module.exports = { scan, DEFAULT_PATTERNS }
