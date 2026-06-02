import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as fsTracker from './lib/fs-tracker'
import type { ToolDefinition } from './src/types/tool'

import * as get from './tools/get'
import * as write from './tools/write'
import * as drift from './tools/drift'
import * as conform from './tools/conform'
import * as inventory from './tools/inventory'
import * as scaffold from './tools/scaffold'
import * as impact from './tools/impact'
import * as ask from './tools/ask'
import * as init from './tools/init'
import * as migrate from './tools/migrate'
import * as kbImport from './tools/import'
import * as kbExport from './tools/export'
import * as analyze from './tools/analyze'
import * as extract from './tools/extract'
import * as issue from './tools/issue'
import * as sub from './tools/sub'
import * as autotag from './tools/autotag'
import * as autorelate from './tools/autorelate'
import * as schema from './tools/schema'
import * as upgrade from './tools/upgrade'
import * as history from './tools/history'
import * as status from './tools/status'

// Uniform registry shape. Each tool types its own `runTool` args; erasing the
// parameter to `never` here lets every tool's signature satisfy the registry
// (a `never` parameter is contravariantly assignable from any arg type). The
// dispatch site below re-applies the real call shape with a single cast.
interface ToolModule {
  definition: ToolDefinition
  runTool: (args: never) => Promise<unknown>
}

fsTracker.install()

const tools: Record<string, ToolModule> = {
  kb_get: get,
  kb_write: write,
  kb_drift: drift,
  kb_conform: conform,
  kb_inventory: inventory,
  kb_scaffold: scaffold,
  kb_impact: impact,
  kb_ask: ask,
  kb_init: init,
  kb_migrate: migrate,
  kb_import: kbImport,
  kb_export: kbExport,
  kb_analyze: analyze,
  kb_extract: extract,
  kb_issue: issue,
  kb_sub: sub,
  kb_autotag: autotag,
  kb_autorelate: autorelate,
  kb_schema: schema,
  kb_upgrade: upgrade,
  kb_history: history,
  kb_status: status
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
      // Re-apply the uniform call shape erased by ToolModule.runTool's `never`
      // parameter — every tool accepts an args object and returns a JSON record.
      const runTool = tool.runTool as (args: Record<string, unknown>) => Promise<Record<string, unknown>>
      const result = await runTool(args || {})
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
      let text = `Error: ${(err as Error).message}`
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
