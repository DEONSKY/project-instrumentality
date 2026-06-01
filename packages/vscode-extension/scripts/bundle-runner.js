#!/usr/bin/env node
'use strict'

// Bundles the kb-mcp live-status runner into dist/runner/ so the extension
// can drive the readonly drift/conform overlay in consumer projects that
// don't vendor knowledge/_mcp/ in tree. kb-mcp is now TypeScript compiled to
// knowledge/_mcp/dist/, so we copy the COMPILED .js output (run plain under
// node) — never the .ts source. We then run a one-shot npm install for the
// three runtime deps (simple-git, gray-matter, js-yaml). Templates live at
// dist/_templates/: lib/pkg-paths.js resolves them via packageRoot()/../
// _templates, which from dist/runner/lib/ lands at dist/_templates.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const EXT_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(EXT_ROOT, '..', '..')
const MCP_DIR = path.join(REPO_ROOT, 'knowledge', '_mcp')
// Copy from kb-mcp's compiled output, not source (source is .ts).
const MCP_DIST = path.join(MCP_DIR, 'dist')
const TEMPLATES_DIR = path.join(REPO_ROOT, 'knowledge', '_templates')

const RUNNER_OUT = path.join(EXT_ROOT, 'dist', 'runner')
const TEMPLATES_OUT = path.join(EXT_ROOT, 'dist', '_templates')

// Trimmed to what drift.js + conform.js + live-status.js transitively need.
// Keep this list under review when those tools grow new deps — adding the
// missing module is cheaper than guessing.
const RUNTIME_DEPS = {
  'simple-git': '^3.22.0',
  'gray-matter': '^4.0.3',
  'js-yaml': '^4.1.0'
}

// File-level copy of the compiled output: dist/scripts, dist/tools, dist/lib.
// Nothing else from _mcp/dist is reachable from the live-status entrypoint,
// so the tree stays small. (.js.map files are copied too — harmless, and
// keep stack traces readable if the runner throws.)
const COPY_DIRS = ['scripts', 'tools', 'lib']

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dst, name)
    const stat = fs.statSync(s)
    if (stat.isDirectory()) copyDir(s, d)
    else if (stat.isFile()) fs.copyFileSync(s, d)
  }
}

function writeRunnerPackageJson() {
  const pkg = {
    name: 'instrumentality-runner-bundle',
    version: '0.0.0',
    private: true,
    description: 'Bundled kb-mcp runner used by the Instrumentality VS Code extension.',
    dependencies: RUNTIME_DEPS
  }
  fs.writeFileSync(
    path.join(RUNNER_OUT, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  )
}

function installRunnerDeps() {
  // --omit=dev keeps the install lean; --no-package-lock avoids polluting
  // the repo with a lockfile inside dist/. --no-audit/--no-fund silence
  // chatter that would otherwise dominate the build log.
  execFileSync(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--silent'],
    { cwd: RUNNER_OUT, stdio: 'inherit' }
  )
}

function main() {
  if (!fs.existsSync(MCP_DIR)) {
    console.error(`[bundle-runner] missing source tree at ${MCP_DIR}`)
    process.exit(1)
  }
  if (!fs.existsSync(MCP_DIST)) {
    console.error(
      `[bundle-runner] missing compiled output at ${MCP_DIST}.\n` +
      `  kb-mcp is TypeScript — run \`npm --prefix knowledge/_mcp run build\` first ` +
      `(the extension build does this automatically; see esbuild.config.js).`
    )
    process.exit(1)
  }
  rmrf(RUNNER_OUT)
  rmrf(TEMPLATES_OUT)
  fs.mkdirSync(RUNNER_OUT, { recursive: true })

  for (const dir of COPY_DIRS) {
    const src = path.join(MCP_DIST, dir)
    if (!fs.existsSync(src)) continue
    copyDir(src, path.join(RUNNER_OUT, dir))
  }

  if (fs.existsSync(TEMPLATES_DIR)) {
    copyDir(TEMPLATES_DIR, TEMPLATES_OUT)
  }

  writeRunnerPackageJson()
  installRunnerDeps()

  console.log(`[bundle-runner] OK → ${path.relative(EXT_ROOT, RUNNER_OUT)}`)
}

main()
