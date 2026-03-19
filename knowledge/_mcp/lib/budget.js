function estimateTokens(content) {
  if (!content) return 0
  return Math.ceil(content.length / 4)
}

function withinBudget(files, maxTokens = 8000) {
  const total = files.reduce((sum, f) => sum + estimateTokens(f.content || f), 0)
  return total <= maxTokens
}

function totalTokens(files) {
  return files.reduce((sum, f) => sum + estimateTokens(f.content || f), 0)
}

module.exports = { estimateTokens, withinBudget, totalTokens }
