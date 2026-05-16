# drift-summary prompt
#
# Used by kb_drift stage 2. Called once per unique KB target
# after stage 1 (path classifier) has already identified:
#   - which code file changed
#   - which KB file is the target
#   - which direction (kb→code or code→kb)
#
# Placeholders filled at runtime:
#   {{direction}}         — "kb→code" or "code→kb"
#   {{changed_file}}      — path of the file that changed
#   {{kb_target}}         — path of the KB file to update or notify about
#   {{git_diff}}          — raw git diff of the changed file (trimmed to 200 lines)
#   {{kb_section}}        — content of the relevant ## section from the KB target

---

You are writing a one-line sync note summary for a knowledge base
drift detection system.

## Direction

{{direction}}

## What changed

File: {{changed_file}}

Diff:
```
{{git_diff}}
```

## Relevant KB section

File: {{kb_target}}

```
{{kb_section}}
```

## Pre-condition: verify KB file before closing this entry

Before writing the summary and calling `kb_drift` with summaries, you MUST:

1. **Read `{{kb_target}}`** and check its current content.
2. **If the file has `{{placeholders}}`** — it was never filled. Update it first
   using `kb_extract` (standards from code) or `kb_scaffold` (features/flows/ui).
3. **If the file does not exist** — create it first. Do not close the entry
   against a missing file.
4. **If the file is up to date** — proceed to write the summary and close.

**Sequence (non-negotiable):**
1. Read `{{kb_target}}`
2. Update or create it if needed (`kb_extract` / `kb_scaffold` / Write)
3. Confirm the file reflects the code change
4. THEN write the summary and call `kb_drift(summaries=[...])` to close

Closing the queue entry before updating the KB leaves knowledge stale
while the drift tracker shows "resolved". This is the failure mode this
rule prevents.

## Task

Write a single summary line that describes what changed and
the most important constraint or detail a developer needs to know.

## Rules

- Maximum 80 characters
- Must name the specific field, rule, or endpoint that changed
- Must include the key constraint if one exists (optional, required,
  min length, region-restricted, etc.)
- Never write vague summaries like "field updated" or "code changed"
- Format: "{{what changed}} — {{key constraint or context}}"
- Write only the summary line. No explanation, no prefix, no quotes.

## Good examples

phone field added — optional, TR/EU regions only
password minLength changed from 6 to 8
POST /invoices — new required field: tax_id
checkout flow guard added — admin role bypasses step 2
email validation regex updated — now rejects + symbol
