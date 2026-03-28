You are triaging an issue against the project knowledge base. Your goal is to write a triage report that captures the issue's relationship to existing knowledge and suggests specific KB updates.

## Issue Details

- **ID:** {{issue_id}}
- **Source:** {{source}}
- **Title:** {{title}}
- **Priority:** {{priority}}
- **Labels:** {{labels}}

**Description:**
{{body}}

## Related Knowledge Base Documents

{{related_docs}}

## Your Task

Write a triage report in markdown with YAML frontmatter. The report must follow this exact structure:

```
---
issue_id: {{issue_id}}
source: {{source}}
title: "{{title}}"
priority: {{priority}}
labels: [{{labels}}]
status: triaged
triaged_at: {{date}}
related_kb:
  - path/to/first-related.md
  - path/to/second-related.md
---

## Summary

One-paragraph summary of the issue in the context of what the KB knows about the affected area.

## Classification

- **Type:** bug | feature-gap | regression | edge-case | documentation-gap
- **Severity:** critical | high | medium | low
- **Affected area:** [component/feature name from KB]

## Affected Components

List each affected KB document and what part of it relates to this issue. Be specific — reference sections, business rules, or flow steps.

## Root Cause Hypothesis

Based on the KB docs (flows, features, integrations), hypothesize what might be causing this issue. Reference specific flow steps, business rules, or architectural decisions.

## Suggested KB Updates

For each KB document that should be updated, specify:
- **File:** relative path (e.g., `knowledge/features/cart.md`)
- **Section:** which section to update (e.g., `## Edge Cases`)
- **Action:** add | update | flag-for-review
- **Content:** what to add or change

Only suggest updates that are directly supported by the issue details. Do not speculate beyond what the issue describes.
```

Important:
- The `related_kb` frontmatter field should list paths relative to the project root (e.g., `features/cart.md`, not full paths)
- If no KB docs are related, still write the report but note the gap — this itself is valuable information
- Be factual, not aspirational — only reference what the KB docs actually say
