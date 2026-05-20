---
id: wikilink-discipline
type: standard
kind: stack-local
app_scope: all
topic: kb-authoring
created: 2026-05-21
tags: [wikilink, kb, authoring, obsidian]
rules:
  - id: relative-to-knowledge-root
    title: Wikilinks must be relative to `knowledge/`, not the file's own folder
    severity: error
    applies_to:
      paths:
        - "knowledge/**/*.md"
      exclude:
        - "knowledge/_mcp/**"
        - "knowledge/_templates/**"
        - "knowledge/sync/**"
    detect:
      kind: llm
      hint: |
        Look for wikilinks like `[[../features/foo]]` or `[[./bar]]` — both are wrong.
        All wikilinks in this KB resolve from the `knowledge/` root.
        Correct: `[[specs/features/foo]]`, `[[data/schema/users]]`.
    fix_hint: |
      Rewrite to an absolute-from-knowledge path. The reindex graph and Obsidian
      both expect this. Section anchors (`#users`) and aliases (`|Users Table`) are
      preserved.
    description: |
      Wikilinks anchor the dependency graph. A relative wikilink either fails to
      resolve in the graph or resolves to a different file than what Obsidian renders,
      producing a silent drift between the rendered view and the index.
    why: |
      The reindex builds `_index.yaml` by resolving every `[[...]]` against the
      knowledge root. Relative links generate graph edges that do not match Obsidian's
      backlinks pane.
    examples: []
    exceptions: []

  - id: no-prose-only-cross-references
    title: Cross-references between KB files must use wikilinks, not prose
    severity: warn
    applies_to:
      paths:
        - "knowledge/specs/**/*.md"
        - "knowledge/decisions/**/*.md"
        - "knowledge/integrations/**/*.md"
    detect:
      kind: llm
      hint: |
        Find phrases like "see the user-registration feature" or "as defined in
        decisions/foo" where there is no wikilink. The graph cannot follow prose.
    fix_hint: |
      Wrap the reference in `[[path]]`. If the link target does not exist yet,
      keep the wikilink — it will surface as a broken link in the next reindex,
      which is the correct signal to write the target file.
    description: |
      The KB's value is in its graph. Prose references give the reader information
      but give the system nothing — `kb_get`, `kb_impact`, and `kb_autorelate` all
      operate on the wikilink graph.
    why: |
      `kb_impact` is asked "what is affected by changing X" — if every reference to
      X is in prose, the answer is always "nothing detectable." This degrades the
      whole tool stack.
    examples: []
    exceptions: []

  - id: section-anchors-for-schema-tables
    title: References to schema tables must use section anchors
    severity: warn
    applies_to:
      paths:
        - "knowledge/**/*.md"
      exclude:
        - "knowledge/data/schema/**"
        - "knowledge/_mcp/**"
        - "knowledge/_templates/**"
    detect:
      kind: llm
      hint: |
        Look for `[[data/schema/<name>]]` without a section anchor when the reference
        is about a specific table or enum. `kb_schema` extracts table-level slices —
        the anchor is what lets it return the relevant piece.
    fix_hint: |
      Add the table or enum name as a section anchor:
      `[[data/schema/postgres#users]]`, `[[data/schema/postgres#OrderStatus]]`.
    description: |
      One schema file holds many tables. A bare link to the file pulls every table
      into context, blowing the token budget and surfacing irrelevant rows.
    why: |
      `kb_get` filters schema files to relevant tables when section anchors are
      present. Without them, the entire DBML body loads for every related lookup.
    examples: []
    exceptions: []
---
