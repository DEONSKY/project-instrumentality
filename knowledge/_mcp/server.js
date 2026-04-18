const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')

const tools = {
  kb_get: require('./tools/get'),
  kb_write: require('./tools/write'),
  kb_drift: require('./tools/drift'),
  kb_scaffold: require('./tools/scaffold'),
  kb_impact: require('./tools/impact'),
  kb_ask: require('./tools/ask'),
  kb_init: require('./tools/init'),
  kb_migrate: require('./tools/migrate'),
  kb_import: require('./tools/import'),
  kb_export: require('./tools/export'),
  kb_analyze: require('./tools/analyze'),
  kb_extract: require('./tools/extract'),
  kb_issue: require('./tools/issue'),
  kb_sub: require('./tools/sub'),
  kb_autotag: require('./tools/autotag'),
  kb_autorelate: require('./tools/autorelate'),
  kb_schema: require('./tools/schema'),
  kb_upgrade: require('./tools/upgrade')
}

for (const [name, tool] of Object.entries(tools)) {
  if (!tool.definition) throw new Error(`Tool ${name} missing definition export`)
  if (tool.definition.name !== name) throw new Error(`Tool ${name} definition.name mismatch: ${tool.definition.name}`)
}

const TOOL_DEFINITIONS = Object.values(tools).map(t => t.definition)


async function main() {
  const server = new Server(
    { name: 'kb-mcp', version: '1.1.1' },
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
