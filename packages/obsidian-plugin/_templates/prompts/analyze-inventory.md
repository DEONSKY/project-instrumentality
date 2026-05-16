# analyze-inventory prompt
#
# Used after kb_analyze returns an inventory. Guides the agent
# in reviewing the inventory and deciding next steps.
#
# Placeholders filled at runtime:
#   {{inventory}}    — JSON inventory from kb_analyze
#   {{kb_context}}   — existing KB files for reference

---

You are reviewing a codebase analysis inventory. The inventory
groups source files by their KB target based on code_path_patterns.

## Inventory

{{inventory}}

## Existing KB context

{{kb_context}}

## Task

Review each group in the inventory and recommend next steps:

1. **Create**: Groups with no existing KB file and significant
   source files. Recommend creating a KB entry.
2. **Review**: Groups where a KB file exists but source files
   may have changed. Recommend reviewing for freshness.
3. **Skip**: Groups with very few files or config-only patterns.
4. **Split**: Large groups (10+ files) that may cover multiple
   sub-features. Recommend splitting into separate KB entries.

For each group you recommend creating, suggest:
- A brief description for the KB file
- Whether it should be a feature, flow, schema, or other type
- Which existing KB files it should reference via [[wikilinks]]

Prioritize groups by file count — larger groups represent more
undocumented code and should be addressed first.
