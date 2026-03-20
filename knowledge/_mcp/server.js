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
  kb_export: require('./tools/export')
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
        scope: { type: 'string', description: 'Export scope: domain name, feature id, or "all"' }
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
        type: { type: 'string', description: 'Template type: feature|flow|schema|validation|integration|decision|group|enums|relations|components|permissions|copy|global-rules|tech-stack|conventions' },
        id: { type: 'string', description: 'File identifier (kebab-case)' },
        group: { type: 'string', description: 'Group/subfolder name (optional)' },
        description: { type: 'string', description: 'Description — tool returns a fill prompt for the agent to process' },
        content: { type: 'string', description: 'Agent-filled content to write (use after processing the fill prompt)' }
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
    description: 'Ask a question about the KB. Supports query, brainstorm, challenge, sync, and onboard intents.',
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
      properties: {}
    }
  },
  {
    name: 'kb_import',
    description: 'Phase 1: Extract and chunk a document (PDF, DOCX, MD, TXT, HTML), returns classify prompts for the agent. Phase 2: Call with files_to_write=[{path,content}] to write agent-classified files.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Path to the source document (required for Phase 1)' },
        dry_run: { type: 'boolean', description: 'Preview without writing', default: false },
        files_to_write: { type: 'array', description: 'Phase 2: agent-generated files to write', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }
      }
    }
  },
  {
    name: 'kb_export',
    description: 'Phase 1: Gathers KB content and returns an export prompt for the agent (or writes json directly). Phase 2: Call with rendered_content to write agent-rendered output to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Domain, feature id, or "all"', default: 'all' },
        format: { type: 'string', description: 'Output format: pdf|docx|markdown|confluence|notion|html|json', default: 'markdown' },
        app_scope: { type: 'string', description: 'Filter by app scope' },
        dry_run: { type: 'boolean', description: 'Preview without writing', default: false },
        rendered_content: { type: 'string', description: 'Phase 2: agent-rendered content to write to disk' }
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
