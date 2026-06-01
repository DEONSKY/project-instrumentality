// Runtime shim: the real entry is server.ts, compiled to dist/server.js.
// This keeps the external `node knowledge/_mcp/server.js` invocation working
// unchanged for MCP clients. Run `npm run build` to (re)generate dist/.
require('./dist/server.js')
