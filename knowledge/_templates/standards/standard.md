---
id: "{{id}}"
type: standard
kind: stack-local
app_scope: "{{app_scope}}"
topic: "{{topic}}"
created: "{{date}}"
tags: []
rules:
  - id: "{{rule_id}}"
    title: "{{rule_title}}"
    severity: warn
    applies_to:
      paths: []
    detect:
      kind: llm
      hint: "{{detect_hint}}"
    fix_hint: "{{fix_hint}}"
    description: |
      {{rule_description}}
    why: |
      {{rule_why}}
    examples: []
    exceptions: []
---
