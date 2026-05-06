import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getActionPrompt } from "../src/prompts/index.js";
import type {
  CodeDriftEntry,
  KbDriftEntry,
  StandardsDriftEntry,
  PromotionEntry,
  ConformPending,
  LintViolation,
} from "../src/types.js";

// Snapshots pin prompt-template output against canned input. If a refactor
// edits a template, the diff in this test file flags it loud and clear,
// so prompt drift is reviewed deliberately rather than slipping through.

const CODE: CodeDriftEntry = {
  kind: "code-drift",
  kbTarget: "features/auth.md",
  hasShared: true,
  codeFiles: [
    { path: "src/auth/login.ts", sinceCommit: "abc1234", sinceDate: "2026-04-01" },
    {
      path: "src/auth/session.ts",
      renamedFrom: "src/auth/sess.ts",
      sinceCommit: "abc1234",
      sinceDate: "2026-04-01",
      latestCommit: "def5678",
      latestDate: "2026-04-15",
    },
  ],
};

const KB: KbDriftEntry = {
  kind: "kb-drift",
  kbFile: "features/checkout.md",
  codeAreas: ["src/checkout/cart.ts", "src/checkout/payment.ts"],
  references: ["features/orders.md"],
  refCount: { count: 2, anchor: "features/checkout" },
  sinceCommit: "abc1234",
  sinceDate: "2026-04-01",
  unmapped: false,
};

const STD: StandardsDriftEntry = {
  kind: "standards-drift",
  queueKey: "api-versioning.deprecation-window",
  standardId: "api-versioning",
  standardKind: "contract",
  ruleId: "deprecation-window",
  severity: "error",
  reason: "missing 6-month deprecation banner",
  filesByParty: {
    backend: [{ path: "src/api/v1/users.ts" }],
    client: [{ path: "web/api-client.ts" }],
  },
};

const PROMO: PromotionEntry = {
  queueKey: "naming.snake-case",
  standardId: "naming",
  standardKind: "code",
  ruleId: "snake-case",
  severity: "warn",
  ruleFingerprint: "sha256:deadbeef",
  files: [{ path: "src/legacy/X.ts", promotedAt: "2026-04-20", note: "legacy module" }],
};

const CONFORM: ConformPending = {
  mode: "current",
  scope: null,
  requested: [
    { file: "src/api.ts", standard_id: "naming", rule_ids: ["snake-case", "no-abbrev"] },
  ],
  head_sha_short: "abc1234",
  head_date: "2026-04-15",
};

const LINT: LintViolation = {
  file: "knowledge/features/x.md",
  severity: "error",
  message: "Missing front-matter: id",
};

describe("prompt snapshots", () => {
  it("code-drift", () => {
    const out = getActionPrompt({ kind: "code-drift", entry: CODE });
    assert.equal(
      out,
      `Resolve code drift for \`features/auth.md\` via kb_drift.
Files: \`src/auth/login.ts\`, \`src/auth/session.ts\`, shared module`
    );
  });

  it("kb-drift", () => {
    const out = getActionPrompt({ kind: "kb-drift", entry: KB });
    assert.equal(
      out,
      `Resolve KB drift for \`features/checkout.md\` via kb_drift.
Code areas: \`src/checkout/cart.ts\`, \`src/checkout/payment.ts\`
Since: \`abc1234\``
    );
  });

  it("standards-drift", () => {
    const out = getActionPrompt({ kind: "standards-drift", entry: STD });
    assert.equal(
      out,
      `Resolve \`api-versioning.deprecation-window\` via kb_conform.
Files: backend: \`src/api/v1/users.ts\`; client: \`web/api-client.ts\`
Reason: missing 6-month deprecation banner`
    );
  });

  it("promotion", () => {
    const out = getActionPrompt({ kind: "promotion", entry: PROMO });
    assert.equal(
      out,
      `Review promotion \`naming.snake-case\` via kb_conform.
Files: \`src/legacy/X.ts\` (promoted 2026-04-20)`
    );
  });

  it("conform", () => {
    const out = getActionPrompt({ kind: "conform", entry: CONFORM });
    assert.equal(
      out,
      `Submit judgments via kb_conform (mode: current, baseline \`abc1234\`):
- \`src/api.ts\` against \`naming\` (rules: \`snake-case\`, \`no-abbrev\`)`
    );
  });

  it("lint", () => {
    const out = getActionPrompt({ kind: "lint", entry: LINT });
    assert.equal(
      out,
      `Fix lint error in \`knowledge/features/x.md\`: Missing front-matter: id`
    );
  });
});

describe("standard-author prompt", () => {
  const STD_WITH_RULE: StandardsDriftEntry = {
    ...STD,
    resolvedRule: {
      id: "deprecation-window",
      title: "Deprecation window must be 6 months",
      severity: "error",
      description: "All deprecated endpoints need a 6-month sunset banner.",
      why: "Clients need lead time to migrate.",
      fixHint: "Add a deprecation banner.",
      examples: null,
      exceptions: null,
    },
    resolvedStandard: {
      id: "api-versioning",
      kind: "contract",
      topic: "API versioning",
      filePath: "/tmp/api-versioning.md",
    },
  };

  it("refine includes rule wording and violating files", () => {
    const out = getActionPrompt({ kind: "standard-author", entry: STD_WITH_RULE, mode: "refine" });
    assert.match(out, /Refine rule `deprecation-window`/);
    assert.match(out, /api-versioning\.md/);
    assert.match(out, /src\/api\/v1\/users\.ts/);
    assert.match(out, /web\/api-client\.ts/);
    assert.match(out, /Existing rule:/);
    assert.match(out, /title: Deprecation window must be 6 months/);
    assert.match(out, /6-month deprecation banner/i);
  });

  it("exception mode targets the exceptions list", () => {
    const out = getActionPrompt({ kind: "standard-author", entry: STD_WITH_RULE, mode: "exception" });
    assert.match(out, /new `exceptions` entry/);
  });

  it("example mode targets the examples list", () => {
    const out = getActionPrompt({ kind: "standard-author", entry: STD_WITH_RULE, mode: "example" });
    assert.match(out, /good\/bad example pair/);
  });

  it("works without a resolved rule", () => {
    const out = getActionPrompt({ kind: "standard-author", entry: STD, mode: "refine" });
    assert.match(out, /Existing rule: not resolvable/);
  });
});

describe("resolveStandardPath", () => {
  it("returns null when standards dir missing", async () => {
    const { resolveStandardPath } = await import("../src/parsers/conform-pending.js");
    const result = resolveStandardPath("/tmp/no-such-kb-root", "anything");
    assert.equal(result, null);
  });

  it("finds standard in any of the four groups", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { resolveStandardPath } = await import("../src/parsers/conform-pending.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kbstd-"));
    try {
      const dir = path.join(tmp, "knowledge", "standards", "contracts");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "api-versioning.md");
      fs.writeFileSync(file, "---\nid: api-versioning\n---\n");
      const found = resolveStandardPath(tmp, "api-versioning");
      assert.equal(found, file);
      assert.equal(resolveStandardPath(tmp, "missing-id"), null);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
