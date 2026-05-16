# conform-resolve prompt
#
# Used when the developer/agent reviews open standards-drift queue entries and
# decides how to close each one. MCP returns this prompt with the queue body
# and any pre-fetched diffs; the agent walks each entry, picks a resolution,
# and submits via the appropriate kb_conform Phase 2 argument.
#
# Placeholders filled at runtime:
#   {{queue_path}}    — knowledge/sync/standards-drift.md (or backlog)
#   {{queue_body}}    — current queue entries as markdown
#   {{diffs}}         — pre-fetched per-file diffs (when include_diffs: true)

---

You are reviewing pending standards conformance entries. Each entry names one
violated rule and the code files that fail it.

## Queue file

`{{queue_path}}`

## Queue entries

{{queue_body}}

## Diffs (pre-fetched)

{{diffs}}

## How to resolve each entry

For each entry, pick exactly one resolution:

1. **`applied`** — *the code was fixed (or will be in this PR).* Use when the
   developer agrees with the rule and intends to make the code conform. Just
   provide the `queue_key`; MCP removes the entry and logs the resolution.

   ```
   kb_conform({ applied: [{ queue_key: "<standard-id>.<rule-id>" }] })
   ```

2. **`exempted`** — *this file is a justified exception.* Use when the rule is
   correct but specific files genuinely shouldn't follow it (e.g. a legacy
   single-screen state machine where the "decompose complex screens" rule
   doesn't apply). Provide the file paths and a clear reason. MCP appends a
   `{paths, reason}` entry to the rule's `exceptions[]` so future runs skip
   these files.

   ```
   kb_conform({ exempted: [{
     queue_key: "<standard-id>.<rule-id>",
     file_paths: ["src/screens/onboarding/wizard.tsx"],
     reason: "intentional single-screen state machine; routing breaks the flow"
   }] })
   ```

3. **`promoted`** — *the code is right; the standard should change.* Use when
   reviewing reveals that the rule no longer reflects how the team actually
   builds. MCP records the intent in the audit log; the senior dev later
   reviews via `kb_inventory.pending_promotions` and decides whether to revise
   the standard via `kb_extract` + `kb_write`. The standard file is **not**
   modified automatically.

   ```
   kb_conform({ promoted: [{
     queue_key: "<standard-id>.<rule-id>",
     originating_files: ["..."],
     note: "screens use Tanstack Router subroutes now, not nested <Routes>"
   }] })
   ```

4. **`dismissed`** — *false positive.* Use when the conformance check was wrong
   (LLM misread, edge case the rule wasn't designed for, etc.). MCP removes
   the entry but logs it as DISMISSED rather than RESOLVED so dismissals stay
   visible as a distinct signal in the audit log.

   ```
   kb_conform({ dismissed: [{
     queue_key: "<standard-id>.<rule-id>",
     reason: "LLM flagged conditional rendering, but it's a 3-line ternary, not a render-tree"
   }] })
   ```

## Output

For each entry: state your resolution, the `queue_key`, and the rationale in
2-3 sentences. Then call the relevant `kb_conform` invocation. You may batch
multiple entries with the same resolution into a single call.
