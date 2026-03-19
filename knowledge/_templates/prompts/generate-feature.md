# generate-feature prompt template
#
# Used by kb_ask "sync [feature]" and kb_get when a developer
# requests code generation. kb_get fills {{kb_context}} before
# sending to the LLM. Everything below the --- is the prompt.
#
# Placeholders filled at runtime:
#   {{kb_context}}        — relevant KB files loaded by kb_get
#   {{feature_id}}        — id field from the feature front-matter
#   {{target_file}}       — code file to generate or update
#   {{change_summary}}    — from the sync note, or free-text request
#   {{tech_stack}}        — from foundation/tech-stack.md
#   {{conventions}}       — from foundation/conventions.md

---

You are generating production code for a specific feature.
Use only the knowledge base context provided. Do not invent
behaviour that is not described. If something is unclear, state
the assumption explicitly as a comment in the code.

## Knowledge base context

{{kb_context}}

## Task

Feature: {{feature_id}}
Target file: {{target_file}}
Change required: {{change_summary}}

## Rules

- Follow naming conventions in {{conventions}}
- Use the stack and versions in {{tech_stack}}
- Validation rules must match the ## Fields section exactly
- Edge cases in ## Edge cases must be handled
- Do not add fields, endpoints, or logic not in the KB
- If a required KB section is missing, ask before generating

## Output format

Return only the file content. No explanation before or after.
If multiple files need changing, list each file path as a
comment header before its content block.
