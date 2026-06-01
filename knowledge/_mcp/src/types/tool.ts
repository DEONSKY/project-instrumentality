// Shared shapes for kb-mcp tool modules. Each tools/*.ts exports a `definition`
// (the MCP tool schema) and an async `runTool`. server.ts validates that every
// registered tool matches this contract.

export interface JsonSchema {
  type?: string
  description?: string
  enum?: unknown[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  oneOf?: JsonSchema[]
  [key: string]: unknown
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JsonSchema
}

// Tool results are plain JSON objects serialized into the MCP text payload.
// `filesChanged` is read by server.ts to merge fs-tracker output; everything
// else is tool-specific.
export type ToolResult = Record<string, unknown>

export type RunTool = (args?: Record<string, unknown>) => Promise<ToolResult>
