const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: kbGet } = require('./get')
const { extractKeywords } = require('../lib/issue-keywords')

const KB_ROOT = 'knowledge'

async function runTool(args = {}) {
  const { command } = args
  if (!command) return { error: 'command is required (triage | plan | consult)' }

  if (command === 'triage') return triage(args)
  if (command === 'plan') return plan(args)
  if (command === 'consult') return consult(args)

  return { error: `Unknown command: ${command}. Valid: triage, plan, consult` }
}

async function triage({ title, body, issue_id, source, labels, priority, app_scope, content } = {}) {
  if (!title) return { error: 'title is required' }
  if (!body) return { error: 'body is required' }

  if (content) {
    const slug = issue_id || slugify(title)
    const filePath = path.join(KB_ROOT, 'sync', 'inbound', `${slug}.md`)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    return { file_path: filePath, written: true }
  }

  const keywords = extractKeywords(title, body)
  if (keywords.length === 0) {
    return { related_docs: [], prompt: null, _instruction: 'Could not extract meaningful keywords from the issue. Ask for more detail.' }
  }

  const getResult = await kbGet({ keywords, app_scope, max_tokens: 16000 })
  const files = getResult.files || []
  const relatedDocs = files.map(f => ({ path: f.path, id: f.id, type: f.type }))
  const docsContent = files.map(f => `### ${f.path}\n\n${f.content || '(no content)'}`).join('\n\n---\n\n')

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
    _instruction: `Review the related KB documents. Fill the triage report template following the prompt, then call kb_issue with command: "triage", the same title, body${issue_id ? ', issue_id' : ''} and content set to your filled report to save it.`
  }
}

async function plan({ scope, type, keywords, app_scope, target, project_key, content } = {}) {
  if (content) {
    const today = new Date().toISOString().split('T')[0]
    const scopeSlug = scope || type || 'plan'
    const fileName = `${today}-${scopeSlug}.yaml`
    const filePath = path.join(KB_ROOT, 'sync', 'outbound', fileName)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    return { file_path: filePath, written: true }
  }

  if (!scope && !type && !keywords) {
    return { error: 'At least one of scope, type, or keywords is required to find source KB documents' }
  }

  const getArgs = { max_tokens: 20000 }
  if (scope) getArgs.scope = scope
  if (type) getArgs.type = type
  if (keywords) getArgs.keywords = Array.isArray(keywords) ? keywords : [keywords]
  if (app_scope) getArgs.app_scope = app_scope
  if (scope) getArgs.task_type = 'export'

  const getResult = await kbGet(getArgs)
  const files = getResult.files || []
  if (files.length === 0) {
    return { source_docs: [], prompt: null, _instruction: 'No KB documents matched the given filters. Broaden scope, type, or keywords.' }
  }

  const sourceDocs = files.map(f => ({ path: f.path, id: f.id, type: f.type }))
  const docsContent = files.map(f => `### ${f.path}\n\n${f.content || '(no content)'}`).join('\n\n---\n\n')

  const prompt = resolvePrompt('issue-plan', {
    source_docs: docsContent,
    target: target || 'generic',
    project_key: project_key || '(not specified)'
  })

  return {
    source_docs: sourceDocs,
    prompt,
    _instruction: `Review the source KB documents. Generate a YAML task breakdown following the prompt, then call kb_issue with command: "plan" and content set to your generated YAML to save it.`
  }
}

async function consult({ title, body, app_scope } = {}) {
  if (!title) return { error: 'title is required' }
  if (!body) return { error: 'body is required' }

  const keywords = extractKeywords(title, body)
  if (keywords.length === 0) {
    return { related_docs: [], prompt: null, _instruction: 'Could not extract meaningful keywords from the issue. Ask the reporter for more detail.' }
  }

  const getResult = await kbGet({ keywords, app_scope, max_tokens: 12000 })
  const files = getResult.files || []
  const relatedDocs = files.map(f => ({ path: f.path, id: f.id, type: f.type }))
  const docsContent = files.map(f => `### ${f.path}\n\n${f.content || '(no content)'}`).join('\n\n---\n\n')

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

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_issue',
    description: 'Issue ↔ KB bridge. command: "triage" (two-phase; writes to sync/inbound/), "plan" (two-phase; writes to sync/outbound/), "consult" (single-phase; no write).',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', enum: ['triage', 'plan', 'consult'], description: 'triage: analyze an existing issue against the KB. plan: generate work items from KB docs. consult: advise before filing an issue.' },
        title: { type: 'string', description: 'Issue title (triage, consult)' },
        body: { type: 'string', description: 'Issue description/body (triage, consult)' },
        issue_id: { type: 'string', description: 'External issue ID, e.g. PROJ-123 (triage)' },
        source: { type: 'string', description: 'PM tool name: jira, github, linear (triage)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels/tags (triage)' },
        priority: { type: 'string', description: 'Issue priority (triage)' },
        scope: { type: 'string', description: 'Scope filter — folder name or "all" (plan)' },
        type: { type: 'string', description: 'KB doc type filter: feature, flow, decision (plan)' },
        keywords: { description: 'Keyword filter (plan)', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        target: { type: 'string', description: 'Target PM tool: jira, github, linear (plan)' },
        project_key: { type: 'string', description: 'PM tool project key, e.g. PROJ (plan)' },
        app_scope: { type: 'string', description: 'Filter KB search to specific app scope' },
        content: { type: 'string', description: 'Phase 2: filled triage report (triage) or task breakdown YAML (plan) to write' }
      }
    }
  }
}
