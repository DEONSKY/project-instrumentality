'use strict'

// Centralised, build-location-aware path resolution for kb-mcp's own bundled
// assets (templates, presets, package.json) and the repo root.
//
// WHY THIS EXISTS: source files live at knowledge/_mcp/{lib,tools,scripts}/…
// but the TypeScript build compiles them to knowledge/_mcp/dist/{lib,tools,…}/.
// Any `__dirname`-relative walk to a bundled asset therefore resolves one
// level too deep when running the compiled output (e.g. `__dirname/../..`
// from dist/lib/ lands in knowledge/_mcp/ instead of knowledge/). Routing
// every such lookup through here means the source tree and the dist tree
// resolve to the SAME real asset, so behaviour is identical whether the code
// runs via tsx (source) or node (compiled).
//
// All exports return absolute paths.

const path = require('path')

// Package root = knowledge/_mcp, regardless of whether this file is loaded
// from lib/ (source, via tsx) or dist/lib/ (compiled). This file sits at
// <pkg>/lib/pkg-paths.js → <pkg>/dist/lib/pkg-paths.js; stepping up once
// gives <pkg> or <pkg>/dist, and we strip a trailing `dist` segment.
function packageRoot() {
  let root = path.resolve(__dirname, '..')
  if (path.basename(root) === 'dist') root = path.resolve(root, '..')
  return root
}

const PKG_ROOT = packageRoot()

// Monorepo root (contains knowledge/ and packages/). Two levels above the
// package root: knowledge/_mcp → knowledge → <repo>.
const REPO_ROOT = path.resolve(PKG_ROOT, '..', '..')

// Bundled templates ship at knowledge/_templates — a sibling of _mcp, one
// level above the package root.
const BUNDLED_TEMPLATES_DIR = path.join(PKG_ROOT, '..', '_templates')

// Stack presets ship inside the package at knowledge/_mcp/presets.
const PRESETS_DIR = path.join(PKG_ROOT, 'presets')

// kb-mcp's own package.json (read for the version string).
const PACKAGE_JSON = path.join(PKG_ROOT, 'package.json')

module.exports = {
  packageRoot: () => PKG_ROOT,
  repoRoot: () => REPO_ROOT,
  bundledTemplatesDir: () => BUNDLED_TEMPLATES_DIR,
  presetsDir: () => PRESETS_DIR,
  packageJsonPath: () => PACKAGE_JSON
}
