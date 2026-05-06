import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildEntryHandles,
  groupEntries,
  pipelineSegments,
} from "../src/grouping.js";
import type { StatusSummary } from "../src/types.js";

function makeStatus(): StatusSummary {
  return {
    kbRoot: "/x",
    currentHeadShort: "abc1234",
    codeDrift: {
      entries: [
        {
          kind: "code-drift",
          kbTarget: "features/auth.md",
          hasShared: false,
          codeFiles: [{ path: "src/auth.ts" }],
        },
      ],
      baseline: { sha: null },
    },
    kbDrift: {
      entries: [
        {
          kind: "kb-drift",
          kbFile: "features/checkout.md",
          codeAreas: ["src/checkout.ts"],
          references: [],
          unmapped: false,
        },
      ],
      baseline: { sha: null },
    },
    standardsDrift: {
      entries: [
        {
          kind: "standards-drift",
          queueKey: "naming.snake-case",
          standardId: "naming",
          standardKind: "code",
          ruleId: "snake-case",
          severity: "warn",
          reason: null,
          filesByParty: { _: [{ path: "src/MyFile.ts" }] },
        },
      ],
      baseline: { sha: null },
    },
    conformPending: {
      current: {
        mode: "current",
        scope: null,
        requested: [
          { file: "src/api.ts", standard_id: "naming", rule_ids: ["snake-case"] },
        ],
        head_sha_short: "abc1234",
        head_date: "2026-01-01",
        staleAgainstHead: false,
      },
      aspirational: null,
    },
    promotions: [
      {
        queueKey: "naming.snake-case",
        standardId: "naming",
        standardKind: "code",
        ruleId: "snake-case",
        severity: "warn",
        ruleFingerprint: null,
        files: [{ path: "src/legacy.ts", promotedAt: "2026-01-01" }],
      },
    ],
    lint: {
      violations: [
        { file: "knowledge/x.md", severity: "error", message: "Missing front-matter: id" },
      ],
      ran: true,
    },
    totals: {
      drifts: 3,
      conformPending: 1,
      promotions: 1,
      lintErrors: 1,
      lintWarnings: 0,
      grand: 6,
    },
  };
}

describe("buildEntryHandles", () => {
  it("emits one handle per entry, with section + lifecycle metadata", () => {
    const handles = buildEntryHandles(makeStatus());
    assert.equal(handles.length, 6);
    const sections = handles.map((h) => h.section).sort();
    assert.deepEqual(sections, [
      "code-drift",
      "conform-pending",
      "kb-drift",
      "lint",
      "promotions",
      "standards-drift",
    ]);
    assert.equal(handles.find((h) => h.section === "code-drift")?.lifecycle, "drift");
    assert.equal(handles.find((h) => h.section === "kb-drift")?.lifecycle, "drift");
    assert.equal(handles.find((h) => h.section === "standards-drift")?.lifecycle, "drift");
    assert.equal(handles.find((h) => h.section === "conform-pending")?.lifecycle, "conform");
    assert.equal(handles.find((h) => h.section === "promotions")?.lifecycle, "promotion");
    assert.equal(handles.find((h) => h.section === "lint")?.lifecycle, "lint");
  });
});

describe("groupEntries", () => {
  const status = makeStatus();
  const handles = buildEntryHandles(status);

  it("section: returns six fixed groups in canonical order", () => {
    const groups = groupEntries(handles, "section");
    assert.equal(groups.length, 6);
    assert.equal(groups[0].key, "section:code-drift");
    assert.equal(groups[5].key, "section:lint");
    assert.equal(groups.reduce((n, g) => n + g.entries.length, 0), 6);
  });

  it("file: clusters entries that touch the same file", () => {
    const groups = groupEntries(handles, "file");
    const keys = groups.map((g) => g.key);
    assert.ok(keys.some((k) => k.includes("src/api.ts")));
    assert.ok(keys.some((k) => k.includes("src/MyFile.ts")));
    assert.ok(keys.some((k) => k.includes("src/legacy.ts")));
  });

  it("standard: clusters drift + promotion + conform under their standard id", () => {
    const groups = groupEntries(handles, "standard");
    const naming = groups.find((g) => g.key === "standard:naming");
    assert.ok(naming);
    // standards-drift, conform-pending, and promotion all reference 'naming'
    assert.equal(naming!.entries.length, 3);
  });

  it("standard: '(no standard)' bucket gets entries without a standardId", () => {
    const groups = groupEntries(handles, "standard");
    const noStandard = groups.find((g) => g.key === "standard:(no standard)");
    assert.ok(noStandard);
    // code-drift, kb-drift, lint
    assert.equal(noStandard!.entries.length, 3);
  });

  it("lifecycle: drift→conform→promotion→lint with right counts", () => {
    const groups = groupEntries(handles, "lifecycle");
    assert.deepEqual(
      groups.map((g) => [g.key, g.entries.length]),
      [
        ["lifecycle:drift", 3],
        ["lifecycle:conform", 1],
        ["lifecycle:promotion", 1],
        ["lifecycle:lint", 1],
      ]
    );
  });

  it("each grouping covers every handle exactly once", () => {
    for (const mode of ["section", "file", "standard", "lifecycle"] as const) {
      const groups = groupEntries(handles, mode);
      const total = groups.reduce((n, g) => n + g.entries.length, 0);
      assert.equal(total, handles.length, `mode=${mode}`);
    }
  });
});

describe("pipelineSegments", () => {
  it("returns four stages with the right counts", () => {
    const segs = pipelineSegments(makeStatus());
    assert.deepEqual(
      segs.map((s) => [s.stage, s.count]),
      [["drift", 3], ["conform", 1], ["promotion", 1], ["lint", 1]]
    );
  });
});
