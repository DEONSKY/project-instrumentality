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

  // Guide the agent when the KB has no matching content
  if (context.length === 0) {
    return {
      intent,
      prompt: null,
      context_files: [],
      _instruction: `No KB documents match this question. Before answering from general knowledge:
1. Run kb_get with broader or different keywords to verify what exists
2. If the KB is empty or sparse for this topic, use kb_scaffold to create relevant documents first
3. Check _rules.md for the KB folder structure and valid document types
4. Do NOT guess answers — tell the user the KB has no documentation for this topic yet`
    }
  }

  const promptVars = buildPromptVars(question, intent, context)
  const promptName = intentToPrompt(intent)

  let prompt
  try {
    prompt = resolvePrompt(promptName, promptVars)
  } catch (e) {
    return { error: e.message, intent, context_files: context.map(f => f.path) }
  }

  if (prompt === null) {
    return { suppressed: true, prompt_name: promptName, intent, message: `Prompt "${promptName}" is suppressed via override.`, context_files: context.map(f => f.path) }
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

// Short terms that are meaningful in tech contexts — don't discard them
const SHORT_KEEP = new Set([
  'api', 'jwt', 'sso', 'sql', 'css', 'otp', 'mfa', 'url', 'uri', 'db',
  'cdn', 'dns', 'ssh', 'tls', 'ssl', 'xml', 'csv', 'pdf', 'ui', 'ux',
  'aws', 'gcp', 'k8s', 'cli', 'sdk', 'orm', 'dto', 'dao', 'rbac', 'acl'
])

async function loadContext(question) {
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 || SHORT_KEEP.has(w))

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
