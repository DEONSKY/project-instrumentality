#!/usr/bin/env node

// Bundles the kb-mcp live-status runner alongside the Obsidian plugin so
// vaults that don't vendor knowledge/_mcp/ still get the live overlay.
// Mirrors packages/vscode-extension/scripts/bundle-runner.js — same source
// tree, same three runtime deps. The plugin's main.js loads from
// <vault>/.obsidian/plugins/instrumentality/main.js; `__dirname` at runtime
// resolves to that directory, so the runner ships under runner/ and the
// templates under _templates/ at the package root.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(PKG_ROOT, "..", "..");
const MCP_DIR = path.join(REPO_ROOT, "knowledge", "_mcp");
const TEMPLATES_DIR = path.join(REPO_ROOT, "knowledge", "_templates");

const RUNNER_OUT = path.join(PKG_ROOT, "runner");
const TEMPLATES_OUT = path.join(PKG_ROOT, "_templates");

const RUNTIME_DEPS = {
  "simple-git": "^3.22.0",
  "gray-matter": "^4.0.3",
  "js-yaml": "^4.1.0",
};

const COPY_DIRS = ["scripts", "tools", "lib"];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else if (stat.isFile()) fs.copyFileSync(s, d);
  }
}

function writeRunnerPackageJson() {
  const pkg = {
    name: "instrumentality-runner-bundle",
    version: "0.0.0",
    private: true,
    description: "Bundled kb-mcp runner used by the Instrumentality Obsidian plugin.",
    dependencies: RUNTIME_DEPS,
  };
  fs.writeFileSync(
    path.join(RUNNER_OUT, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n"
  );
}

function installRunnerDeps() {
  execFileSync(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock", "--silent"],
    { cwd: RUNNER_OUT, stdio: "inherit" }
  );
}

if (!fs.existsSync(MCP_DIR)) {
  console.error(`[bundle-runner] missing source tree at ${MCP_DIR}`);
  process.exit(1);
}
rmrf(RUNNER_OUT);
rmrf(TEMPLATES_OUT);
fs.mkdirSync(RUNNER_OUT, { recursive: true });

for (const dir of COPY_DIRS) {
  const src = path.join(MCP_DIR, dir);
  if (!fs.existsSync(src)) continue;
  copyDir(src, path.join(RUNNER_OUT, dir));
}

if (fs.existsSync(TEMPLATES_DIR)) {
  copyDir(TEMPLATES_DIR, TEMPLATES_OUT);
}

writeRunnerPackageJson();
installRunnerDeps();

console.log(`[bundle-runner] OK → ${path.relative(PKG_ROOT, RUNNER_OUT)}`);
