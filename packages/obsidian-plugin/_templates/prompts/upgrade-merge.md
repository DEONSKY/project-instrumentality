# upgrade-merge prompt
#
# Used by kb_upgrade when a project template has been customized
# by the user and a newer version exists in the MCP bundle.
# Called once per conflicted template file.
#
# Placeholders filled at runtime:
#   {{template_path}}   — relative path of the template (e.g. feature.md)
#   {{project_content}}  — current project version of the template
#   {{bundled_content}}  — new bundled version of the template
#   {{version_from}}     — previous MCP version
#   {{version_to}}       — new MCP version

---

You are merging a customized KB template with an updated version
from the MCP bundle.

## Template

{{template_path}}

## Upgrade context

MCP version: {{version_from}} → {{version_to}}

The project has a customized copy of this template. A new version
is available from the MCP bundle. Your job is to merge the
upstream changes into the customized version while preserving the
user's modifications.

## Current project version (customized)

```
{{project_content}}
```

## New bundled version (upstream)

```
{{bundled_content}}
```

## Task

Produce a merged version of this template that incorporates
upstream changes while keeping user customizations.

## Rules

- Preserve all user customizations: extra fields, changed
  comments, modified placeholders, added sections
- Incorporate new sections, fields, or structural changes
  from the bundled version
- Keep the user's frontmatter field order if they rearranged it
- Add any new frontmatter fields from the bundled version
  that are missing in the project version
- If the bundled version only has cosmetic changes (whitespace,
  punctuation) and no structural changes, respond with:
  KEEP_PROJECT_VERSION
- If the project version is already identical to the bundled
  version, respond with: ALREADY_UP_TO_DATE
- **Comment blocks are hard constraints.** If the bundled version
  contains an HTML comment block (`<!-- ... -->`), preserve it
  exactly — these are strict rules for agents, not hints.
- Write only the merged template content. No explanation.
