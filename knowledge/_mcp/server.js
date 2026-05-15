const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const fsTracker = require('./lib/fs-tracker')

fsTracker.install()

const tools = {
  kb_get: require('./tools/get'),
  kb_write: require('./tools/write'),
  kb_drift: require('./tools/drift'),
  kb_conform: require('./tools/conform'),
  kb_inventory: require('./tools/inventory'),
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
  kb_upgrade: require('./tools/upgrade'),
  kb_history: require('./tools/history'),
  kb_status: require('./tools/status')
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

    fsTracker.beginCall()
    try {
      const result = await tool.runTool(args || {})
      const auto = fsTracker.endCall()
      // Tool may set its own filesChanged to override (e.g. to hide temp files
      // or report logical writes that don't map 1:1 to fs writes). Otherwise
      // we use whatever the tracker captured.
      const filesChanged = Object.prototype.hasOwnProperty.call(result, 'filesChanged')
        ? result.filesChanged
        : auto
      const merged = filesChanged ? { ...result, filesChanged } : result
      return {
        content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }]
      }
    } catch (err) {
      const auto = fsTracker.endCall()
      let text = `Error: ${err.message}`
      if (auto) text += `\n\nfilesChanged: ${JSON.stringify(auto)}`
      return {
        content: [{ type: 'text', text }],
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
