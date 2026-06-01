type BudgetFile = string | { content?: string }

function estimateTokens(content: string): number {
  if (!content) return 0
  return Math.ceil(content.length / 4)
}

function contentOf(f: BudgetFile): string {
  return typeof f === 'string' ? f : (f.content || '')
}

function withinBudget(files: BudgetFile[], maxTokens = 8000): boolean {
  const total = files.reduce((sum, f) => sum + estimateTokens(contentOf(f)), 0)
  return total <= maxTokens
}

function totalTokens(files: BudgetFile[]): number {
  return files.reduce((sum, f) => sum + estimateTokens(contentOf(f)), 0)
}

export { estimateTokens, withinBudget, totalTokens }
