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

// Total-context cap for the embedded KB material in an `kb_ask` prompt.
// Empirically the response cap is around ~64KB before MCP truncates — at
// 32KB the agent still has room for its own response payload. The agent can
// always re-read a full KB file via kb_get when it needs more depth.
const ASK_TOTAL_CHAR_CAP = 32_000
const ASK_PER_FILE_CHAR_CAP = 8_000
// F13: `challenge` and `generate` intents add significant generated-prose
// scaffolding on top of the embedded context (lifecycle of issues, plan
// templates, etc.) — empirically they ran 66-70KB and exceeded the response
// cap while other intents fit under 64KB. Use tighter caps for those two so
// the embedded context leaves room for the rest of the prompt.
const ASK_TIGHT_TOTAL_CHAR_CAP = 16_000
const ASK_TIGHT_PER_FILE_CHAR_CAP = 4_000
const TIGHT_INTENTS = new Set(['challenge', 'generate'])

async function loadContext(question) {
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 || SHORT_KEEP.has(w))

  const result = await get({ keywords })
  return result.files || []
}

function buildKbContext(files, intent) {
  // F13: per-file truncate then accumulate against a total cap so the prompt
  // can't blow past the MCP response budget when kb_get returns many large
  // files. Surface truncation in the inline comment so the agent knows to
  // re-read via kb_get if the omitted content matters.
  const tight = TIGHT_INTENTS.has(intent)
  const totalCap = tight ? ASK_TIGHT_TOTAL_CHAR_CAP : ASK_TOTAL_CHAR_CAP
  const perFileCap = tight ? ASK_TIGHT_PER_FILE_CHAR_CAP : ASK_PER_FILE_CHAR_CAP
  const parts = []
  let total = 0
  for (const f of files) {
    if (total >= totalCap) {
      parts.push(`<!-- ${f.path} -->\n_(content omitted — total context cap reached; run kb_get with this file's keywords for the full text)_`)
      continue
    }
    const remaining = totalCap - total
    const cap = Math.min(perFileCap, remaining)
    const raw = f.content || ''
    const truncated = raw.length > cap
    const body = truncated
      ? raw.slice(0, cap) + `\n\n<!-- … (${raw.length - cap} more chars truncated; run kb_get to fetch full file) -->`
      : raw
    parts.push(`<!-- ${f.path} -->\n${body}`)
    total += body.length
  }
  return parts.join('\n\n---\n\n')
}

function buildPromptVars(question, intent, context) {
  const base = { question, kb_context: buildKbContext(context, intent) }

  if (intent === 'sync' || intent === 'generate') {
    // Extract the first path/identifier after the intent keyword
    const parts = question.trim().split(/\s+/)
    base.feature_id = parts.slice(1).join(' ') || ''
  }

  return base
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_ask',
    description: 'Ask a question about the KB. Supports query, brainstorm, challenge, sync, onboard, and generate intents.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', description: 'Your question. Prefix with "sync [feature] [note-id]" to resolve a sync note.' }
      }
    }
  }
}
