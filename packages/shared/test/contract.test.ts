import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";

import { findKbRoot } from "../src/kb-root.js";
import { readCodeDrift } from "../src/parsers/code-drift.js";
import { readKbDrift } from "../src/parsers/kb-drift.js";
import { readStandardsDrift } from "../src/parsers/standards-drift.js";
import { readConformPending } from "../src/parsers/conform-pending.js";
import { readPromotions } from "../src/parsers/promotions.js";
import { parseLintStderr } from "../src/parsers/lint.js";
import { parseCodeDrift } from "../src/parsers/code-drift.js";
import { parseStandardsDrift } from "../src/parsers/standards-drift.js";
import { getStatus } from "../src/status.js";
import { getActionPrompt } from "../src/prompts/index.js";

const KB_ROOT = findKbRoot([__dirname]);

if (!KB_ROOT) {
  throw new Error("Could not locate kb root from test dir; tests require a real repo.");
}

describe("kb-root", () => {
  it("walks up to find knowledge/_mcp/server.js (source repo)", () => {
    assert.ok(KB_ROOT);
    assert.ok(fs.existsSync(path.join(KB_ROOT!, "knowledge", "_mcp", "server.js")));
  });

  it("returns null when no kb is in the path", () => {
    assert.equal(findKbRoot(["/tmp"]), null);
  });

  it("detects a consumer repo (no _mcp source, only knowledge/sync)", () => {
    const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "kbroot-"));
    try {
      fs.mkdirSync(path.join(tmp, "knowledge", "sync"), { recursive: true });
      const found = findKbRoot([tmp]);
      assert.equal(found, fs.realpathSync(tmp));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detects a consumer repo via knowledge/_rules.md", () => {
    const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "kbroot-"));
    try {
      fs.mkdirSync(path.join(tmp, "knowledge"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "knowledge", "_rules.md"), "---\n---\n", "utf8");
      const found = findKbRoot([tmp]);
      assert.equal(found, fs.realpathSync(tmp));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("baseline parsing", () => {
  it("reads baseline SHA from header comment", () => {
    const result = readCodeDrift(KB_ROOT!);
    assert.ok(result.baseline.sha === null || /^[0-9a-f]{7,40}$/.test(result.baseline.sha));
  });
});

describe("code-drift parser", () => {
  it("returns a shape, not a crash", () => {
    const result = readCodeDrift(KB_ROOT!);
    assert.ok(Array.isArray(result.entries));
    for (const e of result.entries) {
      assert.equal(e.kind, "code-drift");
      assert.equal(typeof e.kbTarget, "string");
      assert.ok(Array.isArray(e.codeFiles));
    }
  });

  it("parses a synthetic block", () => {
    const synthetic = `<!-- baseline: abc1234 -->\n\n# Code Drift Queue\n\n## features/auth.md\n\n- **KB target:** \`features/auth.md\`\n- **Code files:**\n  - \`src/auth/login.ts\` — since \`abc1234\` (2026-04-01)\n  - \`src/auth/session.ts\` ← renamed from \`src/auth/sess.ts\` — since \`abc1234\` (2026-04-01), latest \`def5678\` (2026-04-15)\n- **Shared module:** true\n`;
    const r = parseCodeDrift(synthetic);
    assert.equal(r.baseline.sha, "abc1234");
    assert.equal(r.entries.length, 1);
    const e = r.entries[0]!;
    assert.equal(e.kbTarget, "features/auth.md");
    assert.equal(e.codeFiles.length, 2);
    assert.equal(e.hasShared, true);
    assert.equal(e.codeFiles[1]!.renamedFrom, "src/auth/sess.ts");
    assert.equal(e.codeFiles[1]!.latestCommit, "def5678");
  });
});

describe("kb-drift parser", () => {
  it("returns a shape, not a crash", () => {
    const result = readKbDrift(KB_ROOT!);
    assert.ok(Array.isArray(result.entries));
    for (const e of result.entries) {
      assert.equal(e.kind, "kb-drift");
      assert.equal(typeof e.kbFile, "string");
      assert.ok(Array.isArray(e.codeAreas));
      assert.equal(typeof e.unmapped, "boolean");
    }
  });
});

describe("standards-drift parser", () => {
  it("returns a shape, not a crash", () => {
    const result = readStandardsDrift(KB_ROOT!);
    assert.ok(Array.isArray(result.entries));
    for (const e of result.entries) {
      assert.equal(e.kind, "standards-drift");
      assert.equal(typeof e.queueKey, "string");
      assert.ok(typeof e.filesByParty === "object");
    }
  });

  it("parses a synthetic block with party-specific files", () => {
    const synthetic = `<!-- baseline: abc1234 -->\n\n# Standards Drift Queue\n\n## api-versioning.deprecation-window\n\n- **Standard:** \`api-versioning\` (contract)\n- **Rule:** \`deprecation-window\` — error\n- **Files (party: backend):**\n  - \`src/api/v1/users.ts\` — since \`abc1234\` (2026-04-01)\n- **Files (party: client):**\n  - \`web/api-client.ts\` — since \`abc1234\` (2026-04-01)\n- **Reason:** missing 6-month deprecation banner\n`;
    const r = parseStandardsDrift(synthetic);
    assert.equal(r.entries.length, 1);
    const e = r.entries[0]!;
    assert.equal(e.standardId, "api-versioning");
    assert.equal(e.standardKind, "contract");
    assert.equal(e.ruleId, "deprecation-window");
    assert.equal(e.severity, "error");
    assert.equal(e.reason, "missing 6-month deprecation banner");
    assert.equal(Object.keys(e.filesByParty).sort().join(","), "backend,client");
    assert.equal(e.filesByParty["backend"]![0]!.path, "src/api/v1/users.ts");
  });
});

describe("conform-pending parser", () => {
  it("reads current.json if present", () => {
    const r = readConformPending(KB_ROOT!, "current");
    if (r) {
      assert.equal(r.mode, "current");
      assert.ok(Array.isArray(r.requested));
      assert.equal(typeof r.head_sha_short, "string");
    }
  });

  it("reads aspirational.json if present", () => {
    const r = readConformPending(KB_ROOT!, "aspirational");
    if (r) {
      assert.equal(r.mode, "aspirational");
      assert.ok(Array.isArray(r.requested));
    }
  });
});

describe("promotions parser", () => {
  it("returns an array, not a crash", () => {
    const entries = readPromotions(KB_ROOT!);
    assert.ok(Array.isArray(entries));
    for (const e of entries) {
      assert.equal(typeof e.queueKey, "string");
      assert.ok(Array.isArray(e.files));
    }
  });
});

describe("lint stderr parser", () => {
  it("parses well-formed lines", () => {
    const stderr = [
      "[kb-lint] WARN  knowledge/features/foo.md: Missing front-matter: id",
      "[kb-lint] ERROR knowledge/features/bar.md: Depth 4 exceeds max 3 for this folder",
      "",
      "[kb-lint] 1 error(s), 1 warning(s). Fix errors before committing.",
    ].join("\n");
    const v = parseLintStderr(stderr);
    assert.equal(v.length, 2);
    assert.equal(v[0]!.severity, "warn");
    assert.equal(v[1]!.severity, "error");
    assert.equal(v[1]!.file, "knowledge/features/bar.md");
  });
});

describe("getStatus aggregator", () => {
  it("produces a complete summary", async () => {
    const s = await getStatus(KB_ROOT!, { skipLint: true });
    assert.equal(s.kbRoot, KB_ROOT);
    assert.ok(typeof s.totals.drifts === "number");
    assert.ok(typeof s.totals.grand === "number");
    assert.ok(s.codeDrift.entries.every((e) => e.kind === "code-drift"));
    assert.ok(s.kbDrift.entries.every((e) => e.kind === "kb-drift"));
    assert.ok(s.standardsDrift.entries.every((e) => e.kind === "standards-drift"));
  });
});

describe("prompt templates", () => {
  it("emit non-empty markdown for each kind", () => {
    const codePrompt = getActionPrompt({
      kind: "code-drift",
      entry: {
        kind: "code-drift",
        kbTarget: "features/x.md",
        codeFiles: [{ path: "src/x.ts", sinceCommit: "abc", sinceDate: "2026-04-01" }],
        hasShared: false,
      },
    });
    assert.ok(codePrompt.includes("features/x.md"));
    assert.ok(codePrompt.includes("kb_drift"));

    const stdPrompt = getActionPrompt({
      kind: "standards-drift",
      entry: {
        kind: "standards-drift",
        queueKey: "x.y",
        standardId: "x",
        standardKind: "contract",
        ruleId: "y",
        severity: "error",
        reason: "r",
        filesByParty: { backend: [{ path: "src/a.ts" }] },
      },
    });
    assert.ok(stdPrompt.includes("kb_conform"));
    assert.ok(stdPrompt.includes("backend"));

    const lintPromptStr = getActionPrompt({
      kind: "lint",
      entry: { file: "knowledge/x.md", severity: "error", message: "Missing front-matter: id" },
    });
    assert.ok(lintPromptStr.includes("knowledge/x.md"));
  });
});
