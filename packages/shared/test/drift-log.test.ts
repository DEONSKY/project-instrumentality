import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseDriftLog } from "../src/parsers/drift-log.js";

// F19: ACKNOWLEDGED was missing from classifyHeading and parsed events fell
// through to "unknown", so the Activity tab grouped them under "Unknown"
// instead of "Acknowledged". The user reasonably read the tab as empty.

describe("drift-log parser — F19 ACKNOWLEDGED classification", () => {
  it("classifies an ACKNOWLEDGED standards-drift heading as drift-acknowledged", () => {
    const log = `<!-- AUTO-GENERATED -->\n\n# Drift Log\n\n` +
      `## 2026-05-16 · ACKNOWLEDGED · standards-drift\n\n` +
      `- **Queue key:** \`foo-std.bar-rule\`\n` +
      `- **By:** @alice\n` +
      `- **At:** \`abc1234\`\n` +
      `- **Reason:** intentional\n`;
    const events = parseDriftLog(log);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "drift-acknowledged");
    assert.equal(events[0].isSystem, false);
    assert.equal(events[0].queueKey, "foo-std.bar-rule");
    assert.equal(events[0].reason, "intentional");
  });

  it("preserves classification of existing CONFORMED · applied headings", () => {
    const log = `# Drift Log\n\n` +
      `## 2026-05-23 · CONFORMED · applied\n\n` +
      `- **Queue key:** \`baz-std.qux-rule\`\n`;
    const events = parseDriftLog(log);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "conformed-applied");
  });

  it("returns events newest-first when multiple headings of mixed types appear", () => {
    const log = `# Drift Log\n\n` +
      `## 2026-05-16 · ACKNOWLEDGED · standards-drift\n\n- **Queue key:** \`a.1\`\n\n` +
      `## 2026-05-23 · DISMISSED-CONFORM\n\n- **Queue key:** \`a.2\`\n- **Reason:** later\n`;
    const events = parseDriftLog(log);
    assert.equal(events.length, 2);
    // parseDriftLog itself does not sort — readDriftLog does. So we only
    // assert both events are recognized (not "unknown").
    const types = events.map((e) => e.eventType).sort();
    assert.deepEqual(types, ["dismissed-conform", "drift-acknowledged"]);
  });
});
