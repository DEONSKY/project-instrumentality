const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");
const skipRunner = process.argv.includes("--skip-runner");

const BUDGET_BYTES = 200 * 1024; // 200KB cap (raised from 150KB after pass 2 added grouping, section guidance, pipeline strip, diff support, and js-yaml).

const baseOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

function checkBudget() {
  try {
    const { size } = fs.statSync(baseOptions.outfile);
    const kb = (size / 1024).toFixed(1);
    if (size > BUDGET_BYTES) {
      console.error(
        `\n[bundle-budget] FAIL: ${kb}kb > ${(BUDGET_BYTES / 1024).toFixed(0)}kb cap. ` +
          `Either trim imports or raise the cap in esbuild.config.js after a deliberate review.`
      );
      process.exit(1);
    }
    console.log(`[bundle-budget] OK: ${kb}kb / ${(BUDGET_BYTES / 1024).toFixed(0)}kb`);
  } catch (err) {
    console.error("[bundle-budget] could not stat output:", err.message);
    process.exit(1);
  }
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function buildKbMcp() {
  // kb-mcp is TypeScript now; bundle-runner copies its compiled dist/, so it
  // must be built first. The shared package is a file: dep of kb-mcp and must
  // be built before it.
  execFileSync("npm", ["--prefix", path.join(REPO_ROOT, "packages", "shared"), "run", "build"], {
    stdio: "inherit",
  });
  execFileSync("npm", ["--prefix", path.join(REPO_ROOT, "knowledge", "_mcp"), "run", "build"], {
    stdio: "inherit",
  });
}

function bundleRunner() {
  // Ships the kb-mcp readonly runner inside the VSIX so consumer projects
  // that don't vendor knowledge/_mcp/ still get the live overlay. The bundle
  // script copies kb-mcp's COMPILED dist/ + installs the three runtime npm
  // deps — see scripts/bundle-runner.js for the rationale. Opt out with
  // `--skip-runner` during fast iteration when only extension TS changes.
  if (skipRunner) {
    console.log("[bundle-runner] skipped (--skip-runner)");
    return;
  }
  buildKbMcp();
  const script = path.join(__dirname, "scripts", "bundle-runner.js");
  execFileSync(process.execPath, [script], { stdio: "inherit" });
}

async function main() {
  if (watch) {
    // Run the runner bundle once up front so first activation has a path
    // to spawn. We don't re-bundle on every TS change — runner sources
    // live outside packages/vscode-extension and rarely move during a
    // single watch session. Re-run `npm run build` if they do.
    bundleRunner();
    const ctx = await esbuild.context(baseOptions);
    await ctx.watch();
    console.log("[kb-sync] esbuild watching...");
  } else {
    bundleRunner();
    await esbuild.build(baseOptions);
    // Budget tracks the shipped (minified) artifact. Dev builds are larger by
    // design (no minification, sourcemaps inlined for some deps) and shouldn't
    // gate iteration.
    if (production) checkBudget();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
