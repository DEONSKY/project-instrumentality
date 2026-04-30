const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

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

async function main() {
  if (watch) {
    const ctx = await esbuild.context(baseOptions);
    await ctx.watch();
    console.log("[kb-sync] esbuild watching...");
  } else {
    await esbuild.build(baseOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
