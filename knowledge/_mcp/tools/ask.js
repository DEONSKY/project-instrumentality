const { resolvePrompt } = require('../lib/prompts')
const { runTool: get } = require('./get')

/**
 * kb_ask — Returns a resolved prompt + KB context for the calling agent to answer.
 * The agent (Claude Code, Cursor, etc.) IS the LLM — no separate API call needed.
 */
async function runTool({ question } = {}) {
  if (!question) return { error: 'question is required' }

  const intent = classifyIntent(question)
  const context = await loadContext(question)

  const promptVars = buildPromptVars(question, intent, context)
  const promptName = intentToPrompt(intent)

  const prompt = resolvePrompt(promptName, promptVars)

  if (!prompt) {
    return { error: `Prompt template not found: ${promptName}`, intent, context_files: context.map(f => f.path) }
  }

  return {
    intent,
    prompt,
    context_files: context.map(f => f.path),
    _instruction: 'Answer the prompt above using your knowledge of the KB context provided within it.'
  }
}

function classifyIntent(question) {
  const q = question.toLowerCase()
  if (/sync\s+\S+/.test(q)) return 'sync'
  if (/walk me through|explain|onboard|tour|new to|getting started/.test(q)) return 'onboard'
  if (/what's missing|what is missing|gaps?|wrong|inconsisten|challenge|review/.test(q)) return 'challenge'
  if (/should|could|what if|brainstorm|option|alternative|recommend/.test(q)) return 'brainstorm'
  if (/^generate|^implement|^write code|^create code|^build .*(feature|endpoint|component|service)/.test(q)) return 'generate'
  return 'query'
}

function intentToPrompt(intent) {
  const map = {
    query: 'ask-query',
    brainstorm: 'ask-brainstorm',
    challenge: 'ask-challenge',
    sync: 'ask-sync',
    onboard: 'onboard-dev',
    generate: 'generate-feature'
  }
  return map[intent] || 'ask-query'
}

async function loadContext(question) {
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)

  const result = await get({ keywords })
  return result.files || []
}

function buildKbContext(files) {
  return files.map(f => `<!-- ${f.path} -->\n${f.content}`).join('\n\n---\n\n')
}

function buildPromptVars(question, intent, context) {
  const base = { question, kb_context: buildKbContext(context) }

  if (intent === 'sync' || intent === 'generate') {
    // Extract the first path/identifier after the intent keyword
    const parts = question.trim().split(/\s+/)
    base.feature_id = parts.slice(1).join(' ') || ''
  }

  return base
}

module.exports = { runTool }
