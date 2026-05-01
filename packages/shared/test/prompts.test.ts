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
      `Code drift: KB target \`features/auth.md\` is out of sync.

The following code files changed without a matching KB update:

- \`src/auth/login.ts\` since \`abc1234\`
- \`src/auth/session.ts\` (renamed from \`src/auth/sess.ts\`) since \`abc1234\`, latest \`def5678\`

Note: at least one of these files is a shared module — make sure the KB update reflects cross-cutting impact.

Please use the \`kb_drift\` tool to inspect the drift, decide whether the KB target needs updating, and resolve the entry. If the KB needs an update, draft it; if the code change is intentional and the KB already covers it, dismiss the entry with a reason.`
    );
  });

  it("kb-drift", () => {
    const out = getActionPrompt({ kind: "kb-drift", entry: KB });
    assert.equal(
      out,
      `KB drift: \`features/checkout.md\` was edited; code may be stale.

Code areas to review:

- \`src/checkout/cart.ts\`
- \`src/checkout/payment.ts\`

2 other KB file(s) reference this one via \`[[features/checkout]]\`. They may need updating too.

Drift baseline: \`abc1234\`

Please use \`kb_drift\` to inspect the entry. Decide whether the implementation needs to catch up to the new KB spec. If yes, draft the code change; if no, dismiss with a reason.`
    );
  });

  it("standards-drift", () => {
    const out = getActionPrompt({ kind: "standards-drift", entry: STD });
    assert.equal(
      out,
      `Standards drift: rule \`api-versioning.deprecation-window\` is failing.

- Standard: \`api-versioning\` (contract)
- Rule: \`deprecation-window\` — error

Affected files:

**Files (party: backend):**
  - \`src/api/v1/users.ts\`

**Files (party: client):**
  - \`web/api-client.ts\`

Reason recorded: missing 6-month deprecation banner

Please use \`kb_conform\` to resolve this entry. Pick one of:

- \`applied\` — code was fixed to satisfy the rule
- \`exempted\` — write an exception into the rule for these files
- \`promoted\` — escalate to senior review (suppresses re-detection until the rule changes)
- \`dismissed\` — false positive`
    );
  });

  it("promotion", () => {
    const out = getActionPrompt({ kind: "promotion", entry: PROMO });
    assert.equal(
      out,
      `Pending promotion: \`naming.snake-case\` is awaiting senior review.

- Standard: \`naming\` (code)
- Rule: \`snake-case\` — warn

Promoted files:

- \`src/legacy/X.ts\` (promoted 2026-04-20) — note: "legacy module"

A senior reviewer should decide whether to update the rule itself or close the promotion. Use \`kb_conform\` with \`closed_promotion: [...]\` to close (writes an exception to the rule and removes the entry); update the rule definition directly to auto-close on fingerprint mismatch.`
    );
  });

  it("conform", () => {
    const out = getActionPrompt({ kind: "conform", entry: CONFORM });
    assert.equal(
      out,
      `Conform pending (mode: current) at baseline \`abc1234\` (2026-04-15).

The agent owes back judgments for these (file, standard, rule) triples:

- \`src/api.ts\` against \`naming\` (rules: \`snake-case\`, \`no-abbrev\`)

Please call \`kb_conform\` with \`submit_judgments\` covering ALL of the requested triples in a single call (the tool validates completeness). For each triple, pick \`pass\`, \`fail\`, or \`n/a\` and supply a short reason for fails.`
    );
  });

  it("lint", () => {
    const out = getActionPrompt({ kind: "lint", entry: LINT });
    assert.equal(
      out,
      `Lint error: \`knowledge/features/x.md\`

> Missing front-matter: id

Please open the file, fix the issue, and re-run lint. Common fixes: add the missing front-matter field, resolve the wikilink target, remove the conflict markers, or move misplaced fields to \`_index.yaml\`.`
    );
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
