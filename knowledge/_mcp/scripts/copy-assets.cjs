#!/usr/bin/env node
'use strict'

// Post-build asset copy. tsc only emits .js/.json, but a few non-JS assets
// must sit beside the compiled output so __dirname-relative resolution finds
// them at runtime (e.g. git-hooks.ts installs scripts/kb-feature.sh via
// path.join(__dirname, '../scripts/kb-feature.sh') → dist/scripts/ when run
// from the compiled tree). Add any future non-JS runtime asset here.
//
// Data directories that are resolved from the SOURCE tree via lib/pkg-paths
// (presets/, schemas/, ../_templates/) are intentionally NOT copied — pkg-paths
// strips the dist segment so they resolve to the real source assets.

const fs = require('node:fs')
const path = require('node:path')

const MCP_DIR = path.resolve(__dirname, '..')
const DIST = path.join(MCP_DIR, 'dist')

const ASSETS = [
  'scripts/kb-feature.sh',
]

let copied = 0
for (const rel of ASSETS) {
  const src = path.join(MCP_DIR, rel)
  if (!fs.existsSync(src)) {
    console.error(`[copy-assets] source missing, skipped: ${rel}`)
    continue
  }
  const dst = path.join(DIST, rel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  // Preserve the executable bit (kb-feature.sh is chmod 755'd by git-hooks).
  fs.chmodSync(dst, fs.statSync(src).mode)
  copied++
}

console.log(`[copy-assets] copied ${copied} asset(s) into dist/`)
