const esbuild = require("esbuild");
const fs = require("node:fs");

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const BUDGET_BYTES = 150 * 1024; // 150KB Phase B cap

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

async function main() {
  if (watch) {
    const ctx = await esbuild.context(baseOptions);
    await ctx.watch();
    console.log("[kb-sync] esbuild watching...");
  } else {
    await esbuild.build(baseOptions);
    checkBudget();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
