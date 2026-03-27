# scaffold-fill prompt
#
# Used by kb_scaffold when the developer provides a description
# of the feature/flow/etc they are creating. Optional — if no
# description is given, the template is returned with raw
# {{placeholders}} and no LLM call is made.
#
# Placeholders filled at runtime:
#   {{template_type}}     — feature | flow | schema | validation | etc
#   {{template_content}}  — the raw template with {{placeholders}}
#   {{description}}       — what the developer told kb_scaffold
#   {{kb_context}}        — foundation files + relevant schema/validation

---

You are filling in a knowledge base template from a developer's
description of what they are building.

## Template type

{{template_type}}

## Developer description

{{description}}

## Knowledge base context

{{kb_context}}

## Pre-check — overlap detection

Before filling the template, scan the knowledge base context above.
If an existing KB file already describes the same feature, component,
flow, or concept:

1. List the overlapping file(s) and what they cover
2. Warn the developer: "We already have [file] that covers [topic].
   Should I extend that instead of creating a new file?"
3. If the overlap is partial, note which parts are new vs. existing
4. Only proceed with filling the template if:
   - No overlap was found, OR
   - The developer confirms they want a separate file

If you proceed, reference the existing file using @mentions in the
new file's depends_on or content where appropriate.

## Template to fill

```
{{template_content}}
```

## Task

After completing the pre-check above, replace {{placeholders}} with
real values derived from the description. Leave any placeholder you
cannot confidently fill as-is with the original {{placeholder}} text.

## Rules

- Only fill what the description clearly states
- Do not invent fields, rules, or behaviour not mentioned
- For ## Fields tables: include only fields explicitly named
- For ## Edge cases: leave as {{placeholder}} if not described
- For ## Open questions: add one entry if the description has
  ambiguity that needs PM or tech lead input
- Set status to: draft (always — developer promotes when ready)
- Set created to: {{date}} (filled at runtime, keep as-is)
- Write only the filled template content. No explanation.
