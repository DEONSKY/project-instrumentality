function getMaxDepth(filePath, rules) {
  const policy = rules.getDepthPolicy()
  const parts = filePath.replace(/^knowledge\//, '').split('/')
  const topFolder = parts[0]
  if (policy.overrides && policy.overrides[topFolder] !== undefined) {
    return policy.overrides[topFolder]
  }
  return policy.default_max || 3
}

function measureDepth(filePath) {
  const normalized = filePath.replace(/^knowledge\//, '')
  const parts = normalized.split('/')
  return parts.length - 1
}

function isNeverGroup(folder, rules) {
  const policy = rules.getDepthPolicy()
  return (policy.never_group || []).includes(folder)
}

function suggestFlatter(filePath) {
  const normalized = filePath.replace(/^knowledge\//, '')
  const parts = normalized.split('/')
  if (parts.length < 3) return filePath
  const last = parts.pop()
  const secondLast = parts.pop()
  parts.push(`${secondLast}-${last}`)
  return 'knowledge/' + parts.join('/')
}

function validateDepth(filePath, rules) {
  const max = getMaxDepth(filePath, rules)
  const actual = measureDepth(filePath)
  if (actual > max) {
    return {
      valid: false,
      actual,
      max,
      suggestion: suggestFlatter(filePath)
    }
  }
  return { valid: true, actual, max }
}

module.exports = { getMaxDepth, measureDepth, isNeverGroup, suggestFlatter, validateDepth }
