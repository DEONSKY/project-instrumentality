# migrate prompt
#
# Used by kb_migrate (manual tool). Called once per KB file
# that violates the new _rules.md version.
# kb_migrate diffs old vs new _rules.md before calling this.
#
# Placeholders filled at runtime:
#   {{rules_diff}}        — diff between old and new _rules.md
#   {{affected_file}}     — KB file that needs updating
#   {{affected_content}}  — full content of that file
#   {{new_rules_version}} — the new version string

---

You are migrating a knowledge base file to comply with a new
version of the KB writing rules.

## Rules change

Old version → New version: {{new_rules_version}}

What changed:
```
{{rules_diff}}
```

## File to migrate

{{affected_file}}

Current content:
```
{{affected_content}}
```

## Task

Update the file so it complies with the new rules.

## Rules

- Apply only the changes required by the rules diff
- Do not rewrite content that is not affected by the change
- If a new required section is needed, add it with a
  {{placeholder}} value — do not invent content
- If the file already complies, respond with: ALREADY_COMPLIANT
- Preserve all existing front-matter fields
- Add rules_version: "{{new_rules_version}}" to front-matter
- Write only the updated file content. No explanation.
