import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

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
  const ctx = await esbuild.context(baseOptions);
  await ctx.watch();
  console.log("[instrumentality-obsidian] esbuild watching...");
} else {
  await esbuild.build(baseOptions);
}
