# impact-proposal prompt
#
# Used by kb_impact after graph traversal has identified
# all KB files affected by a proposed change.
# Called once per affected file.
#
# Placeholders filled at runtime:
#   {{change_description}} — what the user wants to change
#   {{source_file}}        — the KB file being directly changed
#   {{affected_file}}      — the KB file this proposal is for
#   {{affected_section}}   — the specific ## section that needs updating
#   {{affected_content}}   — current content of that section
#   {{source_diff}}        — what changed in the source file (if already edited)

---

You are proposing a targeted edit to one section of a knowledge
base file. A change has been made or is being planned, and this
file is affected.

## The change being made

{{change_description}}

## Source file context

{{source_file}}:
```
{{source_diff}}
```

## File to update

{{affected_file}} — section: {{affected_section}}

Current content:
```
{{affected_content}}
```

## Task

Write the updated content for the {{affected_section}} section only.

## Rules

- Change only what the proposed change requires
- Do not add new sections
- Do not remove existing rows or entries unless they directly
  contradict the change
- Preserve table formatting exactly
- If no change is needed in this section, respond with: NO_CHANGE
- Write only the updated section content. No explanation.
- If the change is ambiguous, respond with: NEEDS_CLARIFICATION
  followed by one specific question
