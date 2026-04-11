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

> If file paths are listed above, call `kb_get` with relevant keywords to load
> their content before filling the template. Do NOT proceed without reviewing
> existing KB files — they are needed for overlap detection and cross-referencing.

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

If you proceed, reference the existing file using [[wikilinks]] in the
new file's content where appropriate.

## Template to fill

```
{{template_content}}
```

## Task

After completing the pre-check above, replace {{placeholders}} with
real values derived from the description. Leave any placeholder you
cannot confidently fill as-is with the original {{placeholder}} text.

## Tags

The `tags` field in frontmatter is **critical for discoverability**. The KB search
engine matches keywords against tags — files with empty tags will not appear in
`kb_get` results unless the keyword happens to match the file path or id.

When filling the `tags` field:
- Extract 5–15 domain keywords from the description and content
- Include synonyms and abbreviations (e.g. both "authentication" and "auth")
- Include key entities, actions, and technical terms mentioned in the file
- Prefer lowercase, kebab-case for multi-word tags (e.g. "error-handling")
- Do NOT use generic structural terms (e.g. "feature", "flow", "rules", "description")

Example: a file about user authentication might have:
```yaml
tags: [auth, authentication, login, jwt, ldap, roles, sadm, plcmt, active-directory, session]
```

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
- **Comment blocks are hard constraints.** If the template above contains
  an HTML comment block (`<!-- ... -->`), every DO / DO NOT instruction
  in that block is a strict rule, not a hint. Before writing each
  paragraph or field, verify it satisfies all instructions in the comment.
  If a piece of content violates a DO NOT rule, redirect it to the
  appropriate file type instead of including it here.

## Content rules by template type

### When template_type is "feature"

Features are **business requirement documents**, not technical references.

WRITE in plain language that a product manager or domain expert can read:
- What the feature does and who uses it
- Field names as the user/domain sees them (labels, not variable names)
- Business invariants: "A user can hold exactly one role", "Only admins can manage users"
- Edge cases from a domain perspective: "If the employee no longer exists in MAB…"

DO NOT write:
- Class names, method names, or package paths
- REST endpoint paths or HTTP verbs
- Database table names, JPA queries, or ORM details
- Framework-specific implementation details (Spring annotations, React hooks, etc.)

If you find yourself writing technical implementation details, stop and ask:
- Does this belong in `standards/code/` instead? → architectural pattern or convention
- Does this belong in `decisions/` instead? → a one-time architectural choice
- Does this belong in `integrations/` instead? → how two systems connect

A good feature file answers: **What does it do and what are the rules?**
A bad feature file answers: **How is it implemented?**
