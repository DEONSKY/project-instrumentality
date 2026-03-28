const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: kbGet } = require('./get')

const KB_ROOT = 'knowledge'

/**
 * kb_issue_triage — Triage an issue against the KB and produce a report with
 * suggested KB updates.
 *
 * Phase 1 (no content): search KB, return prompt + related docs
 * Phase 2 (content provided): write triage report to sync/inbound/
 */
async function runTool({ title, body, issue_id, source, labels, priority, app_scope, content } = {}) {
  if (!title) return { error: 'title is required' }
  if (!body) return { error: 'body is required' }

  // Phase 2: write triage report
  if (content) {
    const slug = issue_id || slugify(title)
    const filePath = path.join(KB_ROOT, 'sync', 'inbound', `${slug}.md`)

    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filePath, content, 'utf8')
    return { file_path: filePath, written: true }
  }

  // Phase 1: search KB and build prompt
  const keywords = extractKeywords(title, body)
  if (keywords.length === 0) {
    return { related_docs: [], prompt: null, _instruction: 'Could not extract meaningful keywords from the issue. Ask for more detail.' }
  }

  const getResult = await kbGet({ keywords, app_scope, max_tokens: 16000 })
  const files = getResult.files || []

  const relatedDocs = files.map(f => ({ path: f.path, id: f.id, type: f.type }))

  const docsContent = files.map(f => {
    return `### ${f.path}\n\n${f.content || '(no content)'}`
  }).join('\n\n---\n\n')

  const labelsStr = Array.isArray(labels) ? labels.join(', ') : (labels || '')
  const today = new Date().toISOString().split('T')[0]

  const prompt = resolvePrompt('issue-triage', {
    title,
    body,
    issue_id: issue_id || '(none)',
    source: source || '(unknown)',
    labels: labelsStr,
    priority: priority || '(unset)',
    related_docs: docsContent || '(no related documents found in knowledge base)',
    date: today
  })

  return {
    related_docs: relatedDocs,
    prompt,
    _instruction: `Review the related KB documents. Fill the triage report template following the prompt, then call kb_issue_triage with the same title, body${issue_id ? ', issue_id' : ''} and content set to your filled report to save it.`
  }
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function extractKeywords(title, body) {
  const STOP = new Set(['the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may','might',
    'shall','can','need','to','of','in','for','on','with','at','by','from','as','into',
    'through','during','before','after','above','below','between','out','off','over',
    'under','again','further','then','once','when','where','why','how','all','each',
    'every','both','few','more','most','other','some','such','no','nor','not','only',
    'own','same','so','than','too','very','just','because','but','and','or','if','that',
    'this','it','its','i','we','you','they','he','she','what','which','who','whom'])
  const text = `${title} ${body || ''}`.toLowerCase()
  const words = text.match(/[a-z0-9_-]{3,}/g) || []
  const freq = {}
  for (const w of words) {
    if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
}

module.exports = { runTool }
