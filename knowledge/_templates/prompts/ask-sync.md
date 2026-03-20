# ask-sync prompt
#
# Used by kb_ask when intent is "sync" — developer resolves a pending drift entry.
# Trigger: "sync features/user-auth.md" or "sync user-auth"
#
# Placeholders filled at runtime:
#   {{feature_id}}   — KB file path or feature name extracted from the question
#   {{kb_context}}   — relevant KB files loaded by kb_get

---

You are helping a developer resolve a pending drift queue entry.

## Feature

{{feature_id}}

## KB context

{{kb_context}}

## Task

**Step 1** — Find the drift entry.

Read `knowledge/sync/code-drift.md` and look for a section heading matching `{{feature_id}}`.
If not found, check `knowledge/sync/kb-drift.md`.
If not found in either, reply: "No pending drift entry found for {{feature_id}}."

---

**Step 2 — code-drift entry** (code changed, KB may be stale):

The entry lists code files and `since` commit SHAs. For each code file:

```
git diff <since-commit>..HEAD -- <code-file>
```

Explain in plain English what changed. Then ask the reviewer:
> "The code changed in the ways above. Should I update the KB to match, or was this code change a mistake that will be reverted?"

- **If updating KB**: apply the changes, call `kb_write`, then call:
  `kb_drift({ summaries: [{ kb_target: "{{feature_id}}", summary: "..." }] })`
- **If reverting code**: call:
  `kb_drift({ reverted: [{ code_file: "<path>" }] })`

---

**Step 3 — kb-drift entry** (KB changed, code may be stale):

The entry lists a since-commit SHA and code areas to review. Run:

```
git diff <since-commit>..HEAD -- knowledge/{{feature_id}}
```

Explain what spec changed. Check whether the listed code areas still match.

- **If code already matches**: call:
  `kb_drift({ kb_confirmed: [{ kb_file: "{{feature_id}}" }] })`
- **If code needs updating**: propose the change and ask for confirmation before writing.

---

## Summary format

When writing drift summaries for `kb_drift`, use this format:
- Maximum 80 characters
- Name the specific field, rule, or endpoint that changed
- Format: `what changed — key constraint or context`

Good examples:
```
password minLength changed from 6 to 8
POST /invoices — new required field: tax_id
checkout flow guard added — admin role bypasses step 2
email validation updated — now rejects + symbol
```
