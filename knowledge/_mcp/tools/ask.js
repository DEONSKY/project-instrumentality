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

// Conversational filler words that survive the length>3 cutoff but carry no
// retrieval signal. Filtering these prevents bigram pollution like
// "definitions-work" or "project-this".
const STOPWORDS = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'into', 'about',
  'have', 'been', 'they', 'them', 'their', 'there', 'what', 'when',
  'where', 'which', 'would', 'should', 'could', 'will', 'work', 'works',
  'working', 'project', 'using', 'used', 'does', 'doing', 'just', 'like',
  'some', 'more', 'most', 'many', 'much', 'such', 'than', 'then', 'each',
  'show', 'tell', 'make', 'made', 'find', 'know', 'need', 'want',
  'explain', 'walk', 'help', 'tour'
])

// Total-context cap for the embedded KB material in an `kb_ask` prompt. The
// MCP response truncates around ~64KB, but that's a ceiling, not a budget —
// embedding tens of KB per call (and re-billing it every turn it stays in
// history) is the real cost. Capped to 16KB: enough context for synthesis on
// a typical question, and the agent re-reads a full KB file via kb_get (the
// truncation markers point there) when it needs more depth.
const ASK_TOTAL_CHAR_CAP = 16_000
const ASK_PER_FILE_CHAR_CAP = 4_000
// F13: `challenge` and `generate` intents add significant generated-prose
// scaffolding on top of the embedded context (lifecycle of issues, plan
// templates, etc.) — empirically they ran 66-70KB and exceeded the response
// cap while other intents fit under 64KB. Use tighter caps for those two so
// the embedded context leaves room for the rest of the prompt.
const ASK_TIGHT_TOTAL_CHAR_CAP = 8_000
const ASK_TIGHT_PER_FILE_CHAR_CAP = 2_000
const TIGHT_INTENTS = new Set(['challenge', 'generate'])

/**
 * Tokenize a natural-language question into KB-search keywords.
 *
 * Why this is non-trivial: the KB tag vocabulary is hyphenated and singular
 * ("user-definition", "definition"), but natural-language questions phrase
 * the same concepts as space-separated plurals ("User Definitions").
 * `kb_get` scoring uses substring match, so the raw words "definitions" and
 * "user" never match the tag "user-definition" exactly — they only pollute
 * via substring collisions ("definitions" ⊂ "buffer-definitions"). The fix
 * is to expand the keyword set with the forms that actually appear in tags.
 *
 * Expansion rules:
 *   1. Drop conversational fillers (STOPWORDS).
 *   2. For each plural-looking word, add its singular form.
 *   3. For each adjacent word pair, add the hyphenated bigram (both plural
 *      and singular variants).
 *
 * Exported so it can be unit-tested independently of the file-loading layer.
 */
function extractKeywords(question) {
  const rawWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 3 || SHORT_KEEP.has(w)) && !STOPWORDS.has(w))

  const out = new Set(rawWords)

  for (const w of rawWords) {
    const sing = singularize(w)
    if (sing && sing !== w) out.add(sing)
  }

  for (let i = 0; i < rawWords.length - 1; i++) {
    const a = rawWords[i]
    const b = rawWords[i + 1]
    out.add(`${a}-${b}`)
    const bSing = singularize(b)
    if (bSing && bSing !== b) out.add(`${a}-${bSing}`)
  }

  return [...out]
}

/**
 * Naive English singularizer scoped to what KB tags need.
 * Returns the singular form, or null if `w` already looks singular.
 * Conservative — only handles -ies, -es, -s. Won't touch already-hyphenated
 * compounds (the bigram pass handles those).
 */
function singularize(w) {
  if (!w || w.length <= 3 || w.includes('-')) return null
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  // -es family: words ending in -s, -x, -z, -ch, -sh take "es" to pluralize,
  // so strip "es" not just "s" (boxes -> box, matches -> match).
  if (w.endsWith('sses') || w.endsWith('shes') || w.endsWith('ches') ||
      w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return null
}

async function loadContext(question) {
  const keywords = extractKeywords(question)
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
  extractKeywords,
  singularize,
  definition: {
    name: 'kb_ask',
    description: 'Returns a synthesized KB context + structured prompt for a question. Use only when (a) the question requires cross-file synthesis the depends_on graph provides, (b) the intent template (query/brainstorm/challenge/sync/onboard/generate) adds value, or (c) grep keywords aren\'t finding the right files due to vocabulary mismatch with KB tags. For straightforward content lookups, grep / find / Read are faster and more reliable — kb_ask\'s file selection is over KB metadata only, not file body, so it cannot find content that isn\'t reflected in tags or depends_on.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', description: 'Your question. Prefix with "sync [feature] [note-id]" to resolve a sync note.' }
      }
    }
  }
}
