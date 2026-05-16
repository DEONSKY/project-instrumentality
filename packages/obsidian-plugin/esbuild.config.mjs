import esbuild from "esbuild";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");
const skipRunner = process.argv.includes("--skip-runner");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function bundleRunner() {
  // Ships the kb-mcp readonly runner inside the plugin so vaults that
  // don't vendor knowledge/_mcp/ still get the live overlay. See
  // scripts/bundle-runner.mjs for the rationale. Pass `--skip-runner`
  // during fast iteration when only the plugin TS changes.
  if (skipRunner) {
    console.log("[bundle-runner] skipped (--skip-runner)");
    return;
  }
  const script = path.join(SCRIPT_DIR, "scripts", "bundle-runner.mjs");
  execFileSync(process.execPath, [script], { stdio: "inherit" });
}

const baseOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  platform: "node",
  target: "es2022",
  format: "cjs",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

if (watch) {
  // Bundle the runner once up front so first activation has a path to
  // spawn. Runner sources rarely move during a single watch session;
  // re-run `npm run build` if they do.
  bundleRunner();
  const ctx = await esbuild.context(baseOptions);
  await ctx.watch();
  console.log("[instrumentality-obsidian] esbuild watching...");
} else {
  bundleRunner();
  await esbuild.build(baseOptions);
}
