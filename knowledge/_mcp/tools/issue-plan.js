const fs = require('fs')
const path = require('path')
const { resolvePrompt } = require('../lib/prompts')
const { runTool: kbGet } = require('./get')

const KB_ROOT = 'knowledge'

/**
 * kb_issue_plan — Generate actionable work items from KB documents for a PM tool.
 *
 * Phase 1 (no content): gather source KB docs, return prompt
 * Phase 2 (content provided): write task breakdown YAML to sync/outbound/
 */
async function runTool({ scope, type, keywords, app_scope, target, project_key, content } = {}) {
  // Phase 2: write task breakdown
  if (content) {
    const today = new Date().toISOString().split('T')[0]
    const scopeSlug = scope || type || 'plan'
    const fileName = `${today}-${scopeSlug}.yaml`
    const filePath = path.join(KB_ROOT, 'sync', 'outbound', fileName)

    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filePath, content, 'utf8')
    return { file_path: filePath, written: true }
  }

  // Phase 1: gather source docs and build prompt
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

  const docsContent = files.map(f => {
    return `### ${f.path}\n\n${f.content || '(no content)'}`
  }).join('\n\n---\n\n')

  const prompt = resolvePrompt('issue-plan', {
    source_docs: docsContent,
    target: target || 'generic',
    project_key: project_key || '(not specified)'
  })

  return {
    source_docs: sourceDocs,
    prompt,
    _instruction: `Review the source KB documents. Generate a YAML task breakdown following the prompt, then call kb_issue_plan with content set to your generated YAML to save it.`
  }
}

module.exports = { runTool }
