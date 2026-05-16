'use strict'

const path = require('path')

// Resolve to the built shared package. The MCP runs with cwd = repo root,
// and packages/shared is a sibling of knowledge/.
function loadShared() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const sharedDist = path.join(repoRoot, 'packages', 'shared', 'dist', 'status.js')
  try {
    return require(sharedDist)
  } catch (err) {
    throw new Error(
      `kb_status requires the @instrumentality/shared package to be built. Run \`cd packages/shared && npm install && npm run build\` from the repo root. (${err.message})`
    )
  }
}

async function runTool(args) {
  const { getStatus } = loadShared()
  const kbRoot = path.resolve(process.cwd())
  const skipLint = args && args.skip_lint === true
  return await getStatus(kbRoot, { skipLint })
}

module.exports = {
  runTool,
  definition: {
    name: 'kb_status',
    description:
      'Read-only sync-state aggregate. Returns counts and entries for code-drift, kb-drift, standards-drift, conform-pending (current + aspirational), pending promotions, and lint issues, plus the current git HEAD short SHA. Same data the KB Sync VSCode extension renders. Never writes. Use at session start, before opening a PR, or whenever the user asks "what is drifting?".',
    inputSchema: {
      type: 'object',
      properties: {
        skip_lint: {
          type: 'boolean',
          description: 'Skip the lint subprocess (faster; default false).'
        }
      }
    }
  }
}
