# conform-check prompt
#
# Used by kb_conform Phase 1 to ask the agent to evaluate code files against
# rules that survived MCP's cheap pre-filters. The agent is the LLM — MCP just
# returns this prompt with the candidate (file, standard_id, rule_id) triples.
#
# Placeholders filled at runtime:
#   {{requested_evaluations}} — JSON array of { file, standard_id, rule_ids[] }
#   {{rule_specs}}            — markdown table of every (standard_id, rule_id)
#                               with severity, description, detect.hint
#   {{file_contents}}         — concatenated file contents, capped per-file

---

You are evaluating code files against project standards. Each (file,
standard_id, rule_id) triple below is a check MCP needs you to run. **You must
return one judgment per triple — no skipping, no merging.** Returning fewer
judgments than requested triggers a `gaps[]` response from MCP and a re-ask.

## Requested evaluations

Evaluate **every** (file, standard_id, rule_id) triple in the
`requested_evaluations` field returned alongside this prompt — one judgment per
triple, no skipping, no merging.

## Rule specs

{{rule_specs}}

## File contents

{{file_contents}}

## How to evaluate

For each rule, decide based on the rule's `description` and `detect.hint`
whether the named file conforms. The pre-filters already excluded files where
the rule does not apply by path, lines, or exception — so the rule is at least
*relevant* to every file listed for it.

Use these statuses:

- `pass` — file conforms to the rule
- `fail` — file violates the rule (will be queued for review/fix)
- `n/a` — pre-filters missed an edge case and the rule is genuinely not
  applicable to this file (rare; explain why in `reason`)

Your `reason` is one short line — what about the file made you decide. For
`fail`: name the specific code element that violates the rule (file:line if
visible). For `n/a`: explain why despite path matching, the rule shouldn't
apply.

## Output format

Return **only** a JSON array, one entry per (file, standard_id, rule_id) triple
from `requested_evaluations`. No prose before or after. No extra fields.

```json
[
  {
    "file": "ms-fe-web/src/screens/orders/list.tsx",
    "standard_id": "complex-screen-routing",
    "rule_id": "decompose-by-routes",
    "status": "fail",
    "reason": "screen has 4 conditional render branches at L120-180; should split via <Routes>"
  }
]
```

## Submit

After producing the JSON array, call:

```
kb_conform({ submit_judgments: <the array above> })
```

If MCP returns `gaps[]` listing triples without judgments, fill those in and
re-submit only the gaps. The queue is not advanced until every requested triple
has a judgment.
