# KB-MCP A/B Test Pack

A reusable protocol for measuring whether KB-MCP delivers better retrieval, conformance, and impact analysis than an unaided agent on a real project.

Take this pack to any project that uses KB-MCP. Run it twice (with MCP, without MCP) and compare.

---

## Step 0 — Pick the target project

Must satisfy:
- KB-MCP installed and running
- `_index.yaml` has >20 files
- At least one `standards/` doc with rules
- At least one feature spec with `depends_on` edges
- Drift queue is non-empty (proves the team actually uses Phase 2)

## Step 1 — Snapshot baseline KB health (5 min, do once per project)

Run inside the target project, MCP enabled:

```
Give me a KB-MCP health snapshot. Call kb_status and report:
- files_indexed count
- last_sync date
- drift queue size (code-drift + kb-drift)
- lint issues count
- pending standards-promotions count

Then spot-check 5 random KB files and report:
- how many have non-empty tags
- how many have at least one [[wikilink]] in the body

Finally read knowledge/_rules.md and report:
- is project_name still "My Project"?
- is _detected_stack still "unknown"?
- how many entries in code_path_patterns, and what intents are covered?
```

Save the output. If the KB is in poor health (placeholder rules, empty tags everywhere, large untriaged backlog) you'll know not to blame the MCP design when arm A loses.

## Step 2 — Disable MCP for the control arm

**Preferred:** open the same project in a second Claude Code window with no MCP servers configured for that workspace. The `kb_*` tools simply don't exist for that session.

**Fallback if Option A is impractical:** prepend this to each prompt:

> "For this task, do not call any `kb_*` MCP tools. Use only filesystem search (`find`, `grep`) and `Read` as if no knowledge base existed."

## Step 3 — Build golden answers (1–2 hours, once per project)

For each prompt below, write a short rubric *before* running the test. Use this T1 template:

```
Files that MUST be cited: [list 4–8 absolutely-required files]
Facts that MUST appear:   [list 4–8 absolutely-required facts]
Acceptable omissions:     [trivia, helpers, test files]
Disqualifying errors:     [hallucinations, wrong-by-fact statements]
```

Without these rubrics, scoring is just vibes.

## Step 4 — Run the five prompts

Run each prompt **twice in each arm** (8 runs minimum per scenario for the full battery; 4 if you do smoke test only). Fresh session each time, no shared context. Same model in both arms.

### T1 — Retrieval

```
I'm onboarding to this codebase. Explain how <FEATURE> works end-to-end:
- the request flow from entry point to persistence
- where state is stored
- what middleware / interceptors / guards enforce policy
- which other features depend on it

Cite every file you used to arrive at the answer. If anything is unclear
or contradictory in what you read, say so explicitly.
```

`<FEATURE>` = something with at least one spec doc and 3+ code files (auth, billing, notifications).

### T2 — Write conformance

```
Add a new POST /<RESOURCE>/<ACTION> endpoint that:
- accepts <FIELD_A> and <FIELD_B>
- runs validation
- persists a <RECORD_TYPE> record
- returns the new record id

Follow the project's existing conventions for handler structure, logging
format, error envelope, validation library, and persistence layer. Match
the style of other handlers in the codebase — do not invent new patterns.
```

`<RESOURCE>` = adjacent to existing handlers so reference material exists.

### T3 — Drift detection

```
The project has a standard: <SPEC_RULE — e.g. "monetary fields must be int64
cents, never floating-point" or "all timestamps must be UTC ISO-8601 strings,
never local time">. Audit the codebase against that rule.

Produce:
1. A list of violations with file:line citations.
2. For each violation, a proposed fix (do not apply it).
3. Any cases where the standard itself looks contradicted or outdated by
   how the code actually works — flag those separately.
```

`<SPEC_RULE>` = a documented standard with known violations.

### T4 — Impact analysis

```
I'm planning to <SCHEMA_CHANGE — e.g. "make user.email case-insensitive
(citext in postgres, normalized on write everywhere else)" or "change
order.total from decimal(10,2) to int64 cents">.

Do not write code. Produce an impact report:
- What code will break or need changes? File-level granularity.
- What specs, standards, or KB docs need updating?
- What tests need rewriting?
- What downstream systems / integrations are affected?
- Any risks I'm not asking about that I should be?
```

`<SCHEMA_CHANGE>` = touches a model with `depends_on` edges to multiple features.

### T5 — Pure-code control (expected tie)

```
There's a bug somewhere in <CODE_AREA — e.g. "the rate limiter"> where
<SYMPTOM — e.g. "concurrent requests from the same user occasionally
bypass the limit">. Find the root cause and propose a fix. The behavior
is entirely defined by the code; there is no spec for it.
```

If MCP wins T5 too, the agent is leaning on `kb_*` when it shouldn't — a real risk. A tie here validates the test isn't rigged.

## Step 5 — Score each run

| Metric | How to capture |
|---|---|
| Tool calls (count) | Count `kb_*` / `Read` / `Grep` / `Bash` invocations in transcript |
| Files read (count) | Count `Read` invocations |
| Files read (relevance %) | Of files read, % that appear in your golden file list |
| Action correctness (0–3) | Compare output to golden facts list |
| Conventions matched (T2 only) | Count of project rules the produced code follows |
| Violations found % (T3 only) | True positives / golden-violation count |
| Hallucinated refs | Count of cited files/functions that don't exist |
| Wall-clock (s) | First message to final action |

Use a **third Claude session** to do the scoring — feed it the transcript + the rubric, ask for the table. Self-scoring biases toward the arm whose transcript is longer.

## Step 6 — Smoke-test shortcut (if 4–6 hours is too much)

For a fast signal in ~1 hour:
1. Run T1 once in arm A, once in arm B.
2. Diff the transcripts. Look for: which files each arm read, whether each cited specs vs. only code, missed obvious things, hallucinated.
3. If the result is unambiguous, stop. If it's a wash, run T2 and T3 next — those are the most discriminating.

## What to look for in the results

**MCP wins** (expected on T1, T2, T3, T4):
- Fewer files read, higher relevance %
- Spec citations in addition to code citations
- Catches violations in indirect places (DB schemas, JSON marshalers)
- Traces downstream impact across the `depends_on` graph

**MCP loses** (diagnostic, not failure):
- T1 loss → KB files have empty tags / no wikilinks (run `kb_autotag`)
- T2 loss → `standards/` has stale rules (run `kb_inventory`, triage promotions)
- T3 loss → drift queue has untriaged noise (clear backlog)
- T4 loss → `depends_on` edges are missing (audit frontmatter + wikilinks)
- T5 should tie. If MCP wins T5 by a lot, the agent is over-trusting MCP.

---

## Scorecard template

Fill this in after the runs. One row per scenario, one column per arm. Use the average of the two runs per cell.

```
                 | T1 retrieval | T2 write    | T3 drift    | T4 impact   | T5 code
-----------------|--------------|-------------|-------------|-------------|-----------
Tool calls (A/B) |  /           |  /          |  /          |  /          |  /
Files read (A/B) |  /           |  /          |  /          |  /          |  /
Relevance (A/B)  |  % /  %      |  % /  %     |  % /  %     |  % /  %     |  % /  %
Correctness (A/B)|  /           |  /          |  /          |  /          |  /
Hallucinations   |  /           |  /          |  /          |  /          |  /
Wall-clock (A/B) |  s /  s      |  s /  s     |  s /  s     |  s /  s     |  s /  s
```

Plus a 1-paragraph qualitative note per scenario: what did MCP surface that grep missed? What did MCP miss that grep found? Any hallucinations? Any signs the agent over-trusted an empty / stale MCP response?
