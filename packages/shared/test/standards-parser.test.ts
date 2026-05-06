import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseStandardDefinition,
  readStandardDefinition,
  findRule,
  findRuleLineRange,
  _clearStandardsCache,
} from "../src/parsers/standards.js";

function makeStandard(tmp: string, group: string, id: string, body: string): string {
  const dir = path.join(tmp, "knowledge", "standards", group);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, body);
  return file;
}

const FULL_STANDARD = `---
id: api-versioning
type: standard
kind: contract
app_scope: backend
topic: API versioning
created: 2026-01-01
tags: [api, versioning]
rules:
  - id: deprecation-window
    title: Deprecation window must be 6 months
    severity: error
    applies_to:
      paths: ["src/api/**"]
    detect:
      kind: llm
      hint: deprecation comments
    fix_hint: Add a 6-month deprecation banner
    description: |
      All deprecated endpoints must include a deprecation banner with
      a 6-month sunset date.
    why: |
      Clients need lead time to migrate.
    examples:
      - label: good
        code: "// @deprecated: sunset 2026-09-01"
    exceptions: []
  - id: version-header
    title: Version header required
    severity: warn
    fix_hint: Set the X-API-Version header
    description: Outgoing responses must declare X-API-Version.
    why: Clients route on the header.
---

Body content here.
`;

describe("parseStandardDefinition", () => {
  it("parses full frontmatter into a StandardDefinition", () => {
    const def = parseStandardDefinition(FULL_STANDARD, "/tmp/api-versioning.md");
    assert.ok(def);
    assert.equal(def!.id, "api-versioning");
    assert.equal(def!.kind, "contract");
    assert.equal(def!.appScope, "backend");
    assert.equal(def!.topic, "API versioning");
    assert.deepEqual(def!.tags, ["api", "versioning"]);
    assert.equal(def!.filePath, "/tmp/api-versioning.md");
    assert.equal(def!.rules.length, 2);

    const r0 = def!.rules[0];
    assert.equal(r0.id, "deprecation-window");
    assert.equal(r0.title, "Deprecation window must be 6 months");
    assert.equal(r0.severity, "error");
    assert.match(r0.description ?? "", /6-month sunset/);
    assert.match(r0.why ?? "", /lead time/);
    assert.equal(r0.fixHint, "Add a 6-month deprecation banner");
    assert.equal(r0.examples?.length, 1);
    assert.equal(r0.exceptions, null); // empty array becomes null
  });

  it("returns null when frontmatter missing", () => {
    assert.equal(parseStandardDefinition("just body, no frontmatter", "/x"), null);
  });

  it("returns null when YAML malformed", () => {
    const bad = `---\nid: x\nrules: [unclosed\n---`;
    assert.equal(parseStandardDefinition(bad, "/x"), null);
  });

  it("returns null when type != standard", () => {
    const wrong = `---\nid: x\ntype: feature\n---`;
    assert.equal(parseStandardDefinition(wrong, "/x"), null);
  });

  it("skips rules without an id", () => {
    const partial = `---
id: x
type: standard
rules:
  - id: keeper
    title: kept
  - title: orphan-no-id
---`;
    const def = parseStandardDefinition(partial, "/x");
    assert.ok(def);
    assert.equal(def!.rules.length, 1);
    assert.equal(def!.rules[0].id, "keeper");
  });
});

describe("readStandardDefinition + cache", () => {
  it("returns null when standard file does not exist", () => {
    assert.equal(readStandardDefinition("/tmp/no-such-kb", "anything"), null);
  });

  it("reads and caches by mtime", () => {
    _clearStandardsCache();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kbstd-"));
    try {
      makeStandard(tmp, "contracts", "api-versioning", FULL_STANDARD);
      const a = readStandardDefinition(tmp, "api-versioning");
      assert.ok(a);
      const b = readStandardDefinition(tmp, "api-versioning");
      assert.strictEqual(a, b, "should return the cached def reference");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("findRule", () => {
  it("returns the matching rule or null", () => {
    const def = parseStandardDefinition(FULL_STANDARD, "/x");
    assert.ok(def);
    assert.equal(findRule(def, "version-header")?.title, "Version header required");
    assert.equal(findRule(def, "missing"), null);
    assert.equal(findRule(null, "anything"), null);
    assert.equal(findRule(def, null), null);
  });
});

describe("getStatus enriches conform-pending with resolved rules", () => {
  it("attaches resolvedRules to each conform request", async () => {
    const { getStatus } = await import("../src/status.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kbi-"));
    try {
      // Minimal kb layout: a sync dir, a standard, and a conform-pending JSON.
      fs.mkdirSync(path.join(tmp, "knowledge", "sync", ".conform-pending"), {
        recursive: true,
      });
      fs.writeFileSync(path.join(tmp, "knowledge", "_rules.md"), "# rules\n");
      makeStandard(tmp, "code", "naming", FULL_STANDARD.replace("api-versioning", "naming"));
      fs.writeFileSync(
        path.join(tmp, "knowledge", "sync", ".conform-pending", "current.json"),
        JSON.stringify({
          mode: "current",
          scope: null,
          requested: [
            { file: "src/api.ts", standard_id: "naming", rule_ids: ["deprecation-window"] },
          ],
          head_sha_short: "abc1234",
          head_date: "2026-01-01",
        })
      );
      const status = await getStatus(tmp, { skipLint: true });
      const req = status.conformPending.current?.requested[0];
      assert.ok(req);
      assert.ok(req!.resolvedStandard);
      assert.equal(req!.resolvedStandard!.id, "naming");
      assert.equal(req!.resolvedRules?.length, 1);
      assert.equal(req!.resolvedRules![0].id, "deprecation-window");
      assert.equal(
        req!.resolvedRules![0].title,
        "Deprecation window must be 6 months"
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("findRuleLineRange", () => {
  it("locates a rule's line range inside the frontmatter", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kbstd-"));
    try {
      const file = makeStandard(tmp, "contracts", "api-versioning", FULL_STANDARD);
      const r0 = findRuleLineRange(file, "deprecation-window");
      const r1 = findRuleLineRange(file, "version-header");
      assert.ok(r0);
      assert.ok(r1);
      assert.ok(r0!.start < r1!.start, "first rule should come before second");
      // Sanity: the line at start should contain `- id: deprecation-window`.
      const text = fs.readFileSync(file, "utf8").split(/\r?\n/);
      assert.match(text[r0!.start], /-\s+id:\s+deprecation-window/);
      assert.match(text[r1!.start], /-\s+id:\s+version-header/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns null for a missing rule id or missing rules: block", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kbstd-"));
    try {
      const file = makeStandard(tmp, "contracts", "api-versioning", FULL_STANDARD);
      assert.equal(findRuleLineRange(file, "no-such-rule"), null);

      const norules = makeStandard(
        tmp,
        "contracts",
        "norules",
        `---\nid: norules\ntype: standard\n---\n`
      );
      assert.equal(findRuleLineRange(norules, "anything"), null);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
