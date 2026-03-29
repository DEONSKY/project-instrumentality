const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')

const tools = {
  kb_get: require('./tools/get'),
  kb_write: require('./tools/write'),
  kb_reindex: require('./tools/reindex'),
  kb_drift: require('./tools/drift'),
  kb_scaffold: require('./tools/scaffold'),
  kb_impact: require('./tools/impact'),
  kb_ask: require('./tools/ask'),
  kb_init: require('./tools/init'),
  kb_migrate: require('./tools/migrate'),
  kb_import: require('./tools/import'),
  kb_export: require('./tools/export'),
  kb_lint: require('./tools/lint'),
  kb_analyze: require('./tools/analyze'),
  kb_extract: require('./tools/extract'),
  kb_issue_triage: require('./tools/issue-triage'),
  kb_issue_plan: require('./tools/issue-plan'),
  kb_issue_consult: require('./tools/issue-consult'),
  kb_sub: require('./tools/sub')
}

const TOOL_DEFINITIONS = [
  {
    name: 'kb_get',
    description: 'Load relevant KB files for a task. Respects token budget and app_scope filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        task_type: { type: 'string', description: 'Type of task (e.g. generate, review, export)' },
        keywords: { description: 'Keywords to match KB files', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        app_scope: { type: 'string', description: 'Filter by app scope (e.g. frontend, backend)' },
        scope: { type: 'string', description: 'Export scope: domain name, feature id, or "all"' },
        max_tokens: { type: 'number', description: 'Override token budget (default: 8000, or token_budget from _rules.md)' },
        task_context: { type: 'string', enum: ['creating', 'fixing', 'reviewing', 'understanding'], description: 'Adjusts relevance scoring: creating boosts same-type files, reviewing includes drift targets' }
      }
    }
  },
  {
    name: 'kb_write',
    description: 'Write a KB file and automatically reindex. Never write _index.yaml directly.',
    inputSchema: {
      type: 'object',
      required: ['file_path', 'content'],
      properties: {
        file_path: { type: 'string', description: 'Path to the KB file (e.g. knowledge/features/my-feature.md)' },
        content: { type: 'string', description: 'Full file content including YAML front-matter' }
      }
    }
  },
  {
    name: 'kb_reindex',
    description: 'Rebuild _index.yaml from all KB files and run lint. Called automatically by kb_write.',
    inputSchema: {
      type: 'object',
      properties: {
        silent: { type: 'boolean', description: 'Suppress console output' }
      }
    }
  },
  {
    name: 'kb_drift',
    description: 'Bidirectional drift detection. Phase 1: writes entries to sync/code-drift.md (keyed by KB target, tracks all code files + since-commit) and sync/kb-drift.md (keyed by KB file). Multiple commits accumulate automatically. Phase 2: summaries=KB updated, reverted=code file reverted, kb_confirmed=kb→code reviewed. To review pending entries: read the queue files then fetch diffs with git show.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Commit SHA or "last-sync"', default: 'last-sync' },
        summaries: { type: 'array', description: 'Phase 2a: code correct — write KB notes and close code-drift.md entries', items: { type: 'object', properties: { kb_target: { type: 'string' }, summary: { type: 'string' } }, required: ['kb_target', 'summary'] } },
        reverted: { type: 'array', description: 'Phase 2b: code reverted — close code-drift.md entries without writing KB notes', items: { type: 'object', properties: { code_file: { type: 'string' } }, required: ['code_file'] } },
        kb_confirmed: { type: 'array', description: 'Phase 2c: kb→code reviewed — close kb-drift.md entries', items: { type: 'object', properties: { kb_file: { type: 'string' } }, required: ['kb_file'] } }
      }
    }
  },
  {
    name: 'kb_scaffold',
    description: 'Create a new KB file from a template. With description: returns a fill prompt for the agent. With content: writes agent-filled content. Without either: writes template with placeholders.',
    inputSchema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', description: 'Template type: feature|flow|schema|validation|integration|decision|standard|group|enums|relations|components|permissions|copy|global-rules|tech-stack|conventions' },
        id: { type: 'string', description: 'File identifier (kebab-case)' },
        group: { type: 'string', description: 'Group/subfolder for standards: code|knowledge|process' },
        description: { type: 'string', description: 'Description — tool returns a fill prompt for the agent to process' },
        content: { type: 'string', description: 'Agent-filled content to write (use after processing the fill prompt)' },
        app_scope: { type: 'string', description: 'App scope for this standard (e.g. frontend, backend). Default: all' }
      }
    }
  },
  {
    name: 'kb_impact',
    description: 'Analyze impact of a change across the KB dependency graph. Returns proposals — does not write.',
    inputSchema: {
      type: 'object',
      required: ['change_description'],
      properties: {
        change_description: { type: 'string', description: 'Description of the change to analyze' }
      }
    }
  },
  {
    name: 'kb_ask',
    description: 'Ask a question about the KB. Supports query, brainstorm, challenge, sync, onboard, and generate intents.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', description: 'Your question. Prefix with "sync [feature] [note-id]" to resolve a sync note.' }
      }
    }
  },
  {
    name: 'kb_init',
    description: 'Bootstrap a new KB structure in the current monorepo.',
    inputSchema: {
      type: 'object',
      properties: {
        interactive: { type: 'boolean', description: 'Run interactive setup prompts', default: true },
        config: { type: 'object', description: 'Config object (skips interactive prompts)' }
      }
    }
  },
  {
    name: 'kb_migrate',
    description: 'Migrate KB files after _rules.md changes. Manual trigger only.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Commit SHA to diff _rules.md from. Auto-detected if omitted.' },
        dry_run: { type: 'boolean', description: 'Preview migration prompts without writing files', default: false }
      }
    }
  },
  {
    name: 'kb_import',
    description: 'Import a document into the KB. Auto-classify mode (recommended): Phase 1 extracts and classifies in batches (multi-label). Phase 2 returns an import plan with proposed files and cross-references. Phase 3 (approve: true) writes files. Classic mode: Phase 1 returns chunks, Phase 2 writes agent-generated files.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Path to the source document (PDF, DOCX, MD, TXT, HTML)' },
        dry_run: { type: 'boolean', description: 'Preview without writing', default: false },
        auto_classify: { type: 'boolean', description: 'Paginated classification mode — returns chunks in batches for agent to classify, then returns import plan for approval', default: false },
        approve: { type: 'boolean', description: 'Execute a previously generated import plan (requires auto_classify)', default: false },
        classifications: { type: 'array', description: 'Agent multi-label classification results from previous batch', items: { type: 'object', properties: { chunk_id: { type: 'string' }, types: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, confidence: { type: 'number' }, suggested_id: { type: 'string' }, reason: { type: 'string' } }, required: ['type', 'confidence', 'suggested_id'] } }, suggested_group: { type: 'string' }, duplicate_of: { type: 'string' } }, required: ['chunk_id', 'types'] } },
        cursor: { type: 'number', description: 'Current position in chunk list (returned by previous auto_classify call)' },
        files_to_write: { type: 'array', description: 'Classic Phase 2: agent-generated files to write', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }
      }
    }
  },
  {
    name: 'kb_export',
    description: 'Export KB content. Supports optional purpose to guide tone/structure, type filter (e.g. "flow"), and multi-scope (array of ids/domains). Phase 1: Gathers KB content and returns an export prompt for the agent (or writes json directly). Large KBs are paginated automatically. Phase 2: Call with rendered_content to write agent-rendered output to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { description: 'Domain name, feature/flow id, or "all". Accepts an array for multi-scope export.', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], default: 'all' },
        format: { type: 'string', description: 'Output format: pdf|docx|markdown|confluence|notion|html|json', default: 'markdown' },
        type: { type: 'string', description: 'Filter by KB type: feature, flow, schema, validation, integration, decision, foundation, enums, ui-permissions, ui-copy' },
        purpose: { type: 'string', description: 'Optional: describe the purpose and desired style of the export (e.g. "client-facing API overview", "onboarding guide for new backend engineers")' },
        app_scope: { type: 'string', description: 'Filter by app scope' },
        page: { type: 'number', description: 'Page number for paginated exports of large KBs (returned by previous call)' },
        dry_run: { type: 'boolean', description: 'Preview without writing', default: false },
        rendered_content: { type: 'string', description: 'Phase 2: agent-rendered content to write to disk' }
      }
    }
  },
  {
    name: 'kb_analyze',
    description: 'Analyze project source files and generate a KB coverage inventory. Groups source files by their KB target (using code_path_patterns from _rules.md) and optionally writes draft KB files for uncovered groups. Useful for bootstrapping KB on legacy projects.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Max directory depth to scan (default: 4)', default: 4 },
        write_drafts: { type: 'boolean', description: 'Write draft KB files for uncovered groups', default: false }
      }
    }
  },
  {
    name: 'kb_extract',
    description: 'Sample existing code or KB files and return a prompt to derive a standards document from observed patterns. Phase 1 (no content): returns prompt + sampled file contents. Phase 2 (content provided): writes the filled standard to disk.',
    inputSchema: {
      type: 'object',
      required: ['source', 'target_id', 'target_group'],
      properties: {
        source: { type: 'string', enum: ['code', 'knowledge'], description: 'What to sample: "code" for source files, "knowledge" for KB docs' },
        target_id: { type: 'string', description: 'ID for the output standards file (kebab-case)' },
        target_group: { type: 'string', enum: ['code', 'knowledge', 'process'], description: 'Standards subfolder to write into' },
        paths: { description: 'Glob patterns to filter source files (source=code), or KB subfolder name (source=knowledge, e.g. "features")', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        app_scope: { type: 'string', description: 'App scope for the generated standard (default: all)' },
        content: { type: 'string', description: '(Phase 2) Filled content to write to disk' }
      }
    }
  },
  {
    name: 'kb_issue_triage',
    description: 'Triage an issue against the KB. Phase 1: searches KB for related docs and returns a prompt to draft a triage report with root-cause hypothesis and suggested KB updates. Phase 2 (content provided): writes the triage report to sync/inbound/.',
    inputSchema: {
      type: 'object',
      required: ['title', 'body'],
      properties: {
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue description/body' },
        issue_id: { type: 'string', description: 'External issue ID (e.g. PROJ-123)' },
        source: { type: 'string', description: 'PM tool name: jira, github, linear' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels/tags' },
        priority: { type: 'string', description: 'Issue priority' },
        app_scope: { type: 'string', description: 'Filter KB search to specific app scope' },
        content: { type: 'string', description: '(Phase 2) Filled triage report to write to sync/inbound/' }
      }
    }
  },
  {
    name: 'kb_issue_plan',
    description: 'Generate actionable work items from KB documents for a PM tool. Phase 1: gathers source KB docs and returns a prompt to break them into stories/tasks with acceptance criteria. Phase 2 (content provided): writes the task breakdown YAML to sync/outbound/.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Scope filter (folder name or "all")' },
        type: { type: 'string', description: 'KB doc type filter: feature, flow, decision' },
        keywords: { description: 'Keyword filter', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        app_scope: { type: 'string', description: 'Filter by app scope' },
        target: { type: 'string', description: 'Target PM tool: jira, github, linear (affects output format)' },
        project_key: { type: 'string', description: 'PM tool project key (e.g. PROJ)' },
        content: { type: 'string', description: '(Phase 2) Generated task breakdown YAML to write to sync/outbound/' }
      }
    }
  },
  {
    name: 'kb_issue_consult',
    description: 'Consult the KB before filing an issue. Searches for related docs and returns a prompt for the agent to advise the reporter with enriched context, suggested labels, and relevant standards. Single-phase — no write step.',
    inputSchema: {
      type: 'object',
      required: ['title', 'body'],
      properties: {
        title: { type: 'string', description: 'Proposed issue title' },
        body: { type: 'string', description: 'Proposed issue description' },
        app_scope: { type: 'string', description: 'Filter KB search to specific app scope' }
      }
    }
  },
  {
    name: 'kb_sub',
    description: 'Submodule coordination. status: shows parent + submodule branches, pointer changes, owned/shared types. push: pushes submodules first (correct order), then parent. merge_plan: returns correct merge sequence for feature-to-main.',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', enum: ['status', 'push', 'merge_plan'], description: 'Command to run' },
        dry_run: { type: 'boolean', description: 'For push: show plan without executing', default: false },
        target_branch: { type: 'string', description: 'For merge_plan: target branch name', default: 'main' }
      }
    }
  }
]

async function main() {
  const server = new Server(
    { name: 'kb-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const tool = tools[name]
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      }
    }

    try {
      const result = await tool.runTool(args || {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[kb-mcp] Server started')
}

main().catch(err => {
  console.error('[kb-mcp] Fatal error:', err)
  process.exit(1)
})
