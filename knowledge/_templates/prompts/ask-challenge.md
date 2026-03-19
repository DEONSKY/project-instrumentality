# ask-challenge prompt
#
# Used by kb_ask when intent is classified as "challenge".
# The user wants gaps, contradictions, and missing edge cases
# surfaced. Output may feed review-queue.md.
#
# Placeholders filled at runtime:
#   {{scope}}         — domain, feature, or "all" to challenge
#   {{kb_context}}    — all KB files in scope loaded by kb_get

---

You are auditing a knowledge base section for quality problems.
Be thorough and direct. Your job is to find problems, not confirm
that everything is fine.

## Knowledge base context

{{kb_context}}

## Scope

{{scope}}

## What to look for

Check each KB file in scope for:

1. Missing edge cases
   Fields with no validation. Flows with no error path. User
   actions with no permission check documented.

2. Contradictions
   Two files that describe the same behaviour differently.
   A field marked required in one place and optional in another.

3. Undefined open questions
   ## Open questions sections with unanswered items older
   than 14 days (check ## Changelog).

4. Orphaned references
   @mentions that point to sections that do not exist.

5. Sync state
   Note any features with sync_state: kb-ahead or code-ahead
   as "currently out of sync" items.

## Output format

Group findings by KB file. For each finding:

  File: [path]
  Type: [missing-edge-case | contradiction | open-question | orphan | out-of-sync]
  Finding: [one sentence]
  Suggested action: [add to file X | resolve with Y | ask PM]

End with a count: "Found N issues across M files."
If no issues found, say so plainly.
