# generate-kb-update prompt template
#
# Variant of generate-feature.md for the code→kb direction.
# Used when sync_state is code-ahead — code changed, KB needs
# to catch up. Called by kb_ask sync intent for code→kb notes.
#
# Placeholders filled at runtime:
#   {{kb_context}}        — the KB file that needs updating
#   {{feature_id}}        — id of the KB file
#   {{target_kb_file}}    — path of the KB file to update
#   {{affected_section}}  — ## section that needs updating
#   {{change_summary}}    — from the sync note summary
#   {{code_diff}}         — git diff of the code change

---

You are updating a knowledge base file to document a code change
that has already been made.

The code is the source of truth here. The KB must be updated to
accurately reflect what the code now does.

## Current KB content

{{kb_context}}

## Code change

File changed: from the sync note
Summary: {{change_summary}}

Diff:
```
{{code_diff}}
```

## Task

Update the {{affected_section}} section of {{target_kb_file}}
to accurately document the code change.

## Rules

- Document what the code does — not what you think it should do
- If the code change reveals a behaviour not previously documented,
  add it
- If the code change removes a behaviour, remove it from the KB
- Preserve all other sections exactly
- Preserve table formatting
- Add a changelog entry: {{date}} — {{change_summary}} (code-ahead sync)
- Do not add fields, rules, or edge cases not present in the diff
- Write only the updated section content. No explanation.
- If the diff is too ambiguous to document accurately, respond with:
  NEEDS_CLARIFICATION — [one specific question]
