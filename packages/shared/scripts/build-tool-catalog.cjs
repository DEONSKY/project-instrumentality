#!/usr/bin/env node
/*
 * Reads every tool registered by knowledge/_mcp/server.js and merges its MCP
 * `definition` (name, description, inputSchema) with hand-authored prose from
 * src/tool-catalog-prose.json, then emits src/tool-catalog.generated.ts.
 *
 * Run via `npm run build:catalog` (also invoked by `build`). Re-run whenever
 * a tool's MCP definition changes; the prose file is the only thing humans
 * edit by hand.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const mcpDir = path.join(repoRoot, 'knowledge', '_mcp');
const srcToolsDir = path.join(mcpDir, 'tools');

// kb-mcp tools are TypeScript now. Rather than depend on kb-mcp's compiled
// dist/ (which would create a build cycle: shared build → kb-mcp build →
// shared .d.ts → shared build), register tsx so we can require the .ts tool
// SOURCE directly — mirroring the pre-migration behaviour of requiring source.
// Loading a tool module is side-effect-free (no IO/listeners at import), and
// its `import type` from @instrumentality/shared is erased, so this needs no
// prior build of either package. tsx is a devDependency of this package.
try {
  require('tsx/cjs');
} catch (e) {
  throw new Error(
    `build-tool-catalog needs tsx to load kb-mcp's TypeScript tool sources. ` +
    `Run \`npm install\` in packages/shared. (${e.message})`
  );
}
// kb-mcp's entry is server.ts (the root server.js is just a runtime shim that
// requires the compiled dist). The tool-registration map we parse below lives
// in server.ts. The regex/format is identical to the old JS source.
const serverPath = path.join(repoRoot, 'knowledge', '_mcp', 'server.ts');
const proseJsonPath = path.resolve(__dirname, '..', 'src', 'tool-catalog-prose.json');
const outPath = path.resolve(__dirname, '..', 'src', 'tool-catalog.generated.ts');

function loadRegisteredToolNames() {
  // server.js contains a `kb_xxx: require('./tools/yyy')` map. We parse it
  // textually rather than executing server.js, which would call main() and
  // open a stdio MCP server we don't want.
  const src = fs.readFileSync(serverPath, 'utf8');
  const tools = [];
  const re = /(kb_[a-z_]+)\s*:\s*require\('\.\/tools\/([a-z_]+)'\)/g;
  let m;
  while ((m = re.exec(src))) {
    tools.push({ name: m[1], require: m[2] });
  }
  if (tools.length === 0) {
    throw new Error('No tools matched in server.js — regex out of sync with source?');
  }
  return tools;
}

function loadDefinition(toolFile) {
  // Each tool module exports { runTool, definition }. Requiring is safe — they
  // do not have side effects at load time (no listeners, no IO). tsx (registered
  // above) lets us require the .ts source; fall back to .js for any tool still
  // authored as plain JavaScript.
  const tsFull = path.join(srcToolsDir, `${toolFile}.ts`);
  const jsFull = path.join(srcToolsDir, `${toolFile}.js`);
  const full = fs.existsSync(tsFull) ? tsFull : jsFull;
  const mod = require(full);
  if (!mod.definition) {
    throw new Error(`Tool module ${full} missing 'definition' export`);
  }
  return mod.definition;
}

function deriveKeyParams(inputSchema) {
  if (!inputSchema || inputSchema.type !== 'object' || !inputSchema.properties) return [];
  const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
  const out = [];
  for (const [name, schema] of Object.entries(inputSchema.properties)) {
    let type = schema.type;
    if (!type) {
      if (schema.enum) type = 'enum';
      else if (schema.oneOf) type = 'union';
      else type = 'any';
    }
    if (Array.isArray(type)) {
      type = type.join('|');
    }
    if (schema.enum) {
      type = `enum(${schema.enum.join('|')})`;
    } else if (type === 'array' && schema.items && schema.items.type) {
      const inner = Array.isArray(schema.items.type) ? schema.items.type.join('|') : schema.items.type;
      type = `${inner}[]`;
    }
    out.push({
      name,
      type,
      required: required.has(name),
      hint: typeof schema.description === 'string' ? schema.description : '',
    });
  }
  return out;
}

function main() {
  const registered = loadRegisteredToolNames();
  const prose = JSON.parse(fs.readFileSync(proseJsonPath, 'utf8'));
  const proseTools = prose.tools || {};

  const entries = [];
  const missingProse = [];

  for (const { name, require: file } of registered) {
    const def = loadDefinition(file);
    if (def.name !== name) {
      throw new Error(`Tool ${name} definition.name mismatch: ${def.name}`);
    }
    const p = proseTools[name];
    if (!p) {
      missingProse.push(name);
      continue;
    }
    entries.push({
      name,
      category: p.category,
      shortDescription: def.description || '',
      whenToUse: p.whenToUse,
      examplePrompts: p.examplePrompts || [],
      keyParams: deriveKeyParams(def.inputSchema),
      surfaces: ['mcp'],
    });
  }

  if (missingProse.length > 0) {
    throw new Error(
      `Missing prose entries for: ${missingProse.join(', ')}\n` +
        `Add them to ${path.relative(repoRoot, proseJsonPath)} before rebuilding.`
    );
  }

  const header =
    '// AUTO-GENERATED by packages/shared/scripts/build-tool-catalog.cjs\n' +
    '// Sources: knowledge/_mcp/tools/*.js (definitions) + tool-catalog-prose.json (prose)\n' +
    '// Edit those files, then run `npm run build:catalog` in packages/shared.\n' +
    '\n' +
    'import type { ToolCatalogEntry } from "./tool-catalog.js";\n' +
    '\n' +
    'export const GENERATED_TOOL_CATALOG: ToolCatalogEntry[] = ';

  const body = JSON.stringify(entries, null, 2);
  fs.writeFileSync(outPath, header + body + ';\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(`[tool-catalog] wrote ${entries.length} tools to ${path.relative(repoRoot, outPath)}`);
}

main();
