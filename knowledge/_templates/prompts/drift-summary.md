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
