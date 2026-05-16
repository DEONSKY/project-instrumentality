#!/usr/bin/env node
'use strict'

// Bundles the kb-mcp live-status runner into dist/runner/ so the extension
// can drive the readonly drift/conform overlay in consumer projects that
// don't vendor knowledge/_mcp/ in tree. The runner is plain CJS — we copy
// source + run a one-shot npm install for its three runtime deps
// (simple-git, gray-matter, js-yaml). Templates live at dist/_templates/
// because lib/prompts.js resolves them via `__dirname/../../_templates`.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const EXT_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(EXT_ROOT, '..', '..')
const MCP_DIR = path.join(REPO_ROOT, 'knowledge', '_mcp')
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

// File-level copy: scripts/, tools/, lib/ as-is. Nothing else from _mcp/
// is reachable from the live-status entrypoint, so the tree stays small.
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
  rmrf(RUNNER_OUT)
  rmrf(TEMPLATES_OUT)
  fs.mkdirSync(RUNNER_OUT, { recursive: true })

  for (const dir of COPY_DIRS) {
    const src = path.join(MCP_DIR, dir)
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
