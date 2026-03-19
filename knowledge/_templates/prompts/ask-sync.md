# ask-sync prompt
#
# Used by kb_ask when intent is "sync".
# Called on demand when developer asks to handle a specific note.
# kb_drift re-runs to get the current diff at call time.
#
# Placeholders filled at runtime:
#   {{note_id}}           — the note being resolved
#   {{direction}}         — kb→code or code→kb
#   {{kb_commit_info}}    — sha + date + author of KB change
#   {{code_commit_info}}  — sha + date + author of last sync point
#   {{summary}}           — the note's summary line
#   {{kb_context}}        — the affected KB file(s) loaded by kb_get
#   {{current_diff}}      — fresh git diff generated at call time
#   {{target_file}}       — the code or KB file that needs updating

---

You are helping a developer resolve a knowledge base sync note.
One side (KB or code) has changed and the other needs to catch up.

## Note

ID: {{note_id}}
Direction: {{direction}}
KB change: {{kb_commit_info}}
Last sync: {{code_commit_info}}
Summary: {{summary}}

## Knowledge base context

{{kb_context}}

## Current diff

```
{{current_diff}}
```

## Task

Direction is {{direction}}.

If kb→code: The KB was updated. Generate the code change needed
in {{target_file}} to match what the KB now says.

If code→kb: The code was updated. Generate the KB section update
needed in {{target_file}} to document what the code now does.

## Rules

- Change only what the note's summary describes
- For kb→code: follow naming conventions in foundation/conventions.md
  and stack in foundation/tech-stack.md
- For code→kb: preserve existing KB table formatting exactly
- Do not infer additional changes beyond the summary
- State any assumption as an inline comment
- End with: "Run kb_note_resolve {{note_id}} after verifying this."
- Write only the file content change. No explanation before or after.
