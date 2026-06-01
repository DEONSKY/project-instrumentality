'use strict'

const path = require('path')
const pkgPaths = require('../lib/pkg-paths')

// Resolve to the built shared package. The MCP runs with cwd = repo root,
// and packages/shared is a sibling of knowledge/. repoRoot() is resolved via
// pkg-paths so it stays correct whether this file runs from source (tools/)
// or compiled (dist/tools/) — a raw __dirname walk would land one level deep
// under dist/.
function loadShared() {
  const repoRoot = pkgPaths.repoRoot()
  const sharedDist = path.join(repoRoot, 'packages', 'shared', 'dist', 'status.js')
  try {
    return require(sharedDist)
  } catch (err) {
    throw new Error(
      `kb_status requires the @instrumentality/shared package to be built. Run \`cd packages/shared && npm install && npm run build\` from the repo root. (${err.message})`
    )
  }
}

// Recent drift-log events kept inline in the agent-facing payload. The full
// log (often 100+ events) lives on disk; the agent greps it if it needs more.
const RECENT_EVENTS = 5

async function runTool(args) {
  const { getStatus } = loadShared()
  const kbRoot = path.resolve(process.cwd())
  const skipLint = args && args.skip_lint === true
  const includeEvents = args && args.include_events === true
  // F16: when the consumer project doesn't vendor knowledge/_mcp/ in tree,
  // the runLint default-resolution path is empty and lint.ran stays false.
  // Point at kb-mcp's own bundled lint-standalone.js so a direct kb_status
  // call from the agent populates Lint section in consumer repos.
  // Resolved via pkg-paths so it points at the real scripts/ dir whether
  // running from source or compiled dist/.
  const bundledLintScriptPath = path.join(pkgPaths.packageRoot(), 'scripts', 'lint-standalone.js')
  const summary = await getStatus(kbRoot, { skipLint, bundledLintScriptPath })

  // The full driftLogEvents array (the whole month-over-month event log) was
  // ~56% of this tool's response payload and is rarely needed for a status
  // check. Trim it to a count + the most recent few + a pointer the agent can
  // grep for the rest. This trim is ONLY on the agent-facing MCP path — the
  // extension calls the shared getStatus directly and still gets every event.
  if (includeEvents) return summary
  return trimDriftLog(summary)
}

function trimDriftLog(summary) {
  if (!summary || !Array.isArray(summary.driftLogEvents)) return summary
  const { driftLogEvents, ...rest } = summary
  return {
    ...rest,
    driftLogEventCount: driftLogEvents.length,
    recentDriftLogEvents: driftLogEvents.slice(-RECENT_EVENTS),
    driftLogPath: 'knowledge/sync/drift-log/ — per-month files; grep/Read for the full event history, or call kb_status with include_events:true'
  }
}

module.exports = {
  runTool,
  // Exposed for tests; not part of the MCP surface.
  trimDriftLog,
  definition: {
    name: 'kb_status',
    description:
      'Read-only sync-state aggregate. Returns counts and entries for code-drift, kb-drift, standards-drift, conform-pending (current + aspirational), pending promotions, and lint issues, plus the current git HEAD short SHA. The drift-log event history is summarized (driftLogEventCount + recentDriftLogEvents + driftLogPath); pass include_events:true for the full log. Never writes. Use at session start, before opening a PR, or whenever the user asks "what is drifting?".',
    inputSchema: {
      type: 'object',
      properties: {
        skip_lint: {
          type: 'boolean',
          description: 'Skip the lint subprocess (faster; default false).'
        },
        include_events: {
          type: 'boolean',
          description: 'Default false. When true, return the full driftLogEvents array instead of the summarized count + recent events.'
        }
      }
    }
  }
}
