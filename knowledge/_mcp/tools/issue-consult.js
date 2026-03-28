const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: kbGet } = require('./get')

/**
 * kb_issue_consult — Pre-filing consultation: search KB for context related to a
 * proposed issue and return a prompt for the LLM to advise the reporter.
 *
 * Single-phase tool — no write step. The agent's response IS the output.
 */
async function runTool({ title, body, app_scope } = {}) {
  if (!title) return { error: 'title is required' }
  if (!body) return { error: 'body is required' }

  const keywords = extractKeywords(title, body)
  if (keywords.length === 0) {
    return { related_docs: [], prompt: null, _instruction: 'Could not extract meaningful keywords from the issue. Ask the reporter for more detail.' }
  }

  // Search KB for related docs
  const getResult = await kbGet({ keywords, app_scope, max_tokens: 12000 })
  const files = getResult.files || []

  const relatedDocs = files.map(f => ({ path: f.path, id: f.id, type: f.type }))

  // Build docs content for prompt
  const docsContent = files.map(f => {
    return `### ${f.path}\n\n${f.content || '(no content)'}`
  }).join('\n\n---\n\n')

  const prompt = resolvePrompt('issue-consult', {
    title,
    body,
    related_docs: docsContent || '(no related documents found in knowledge base)'
  })

  return {
    related_docs: relatedDocs,
    prompt,
    _instruction: 'Review the related KB documents and the prompt above. Respond directly to the issue reporter with your analysis — no further tool call is needed.'
  }
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
