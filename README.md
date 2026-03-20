# KB-MCP

A structured knowledge base for monorepos, managed through MCP tools. Works with Claude Code, Cursor, and any MCP-compatible agent.

> **No API keys required.** The MCP server returns prompts and context. Your agent does the reasoning.

---

## What it does

KB-MCP creates a `knowledge/` folder in your project and keeps it synchronized with your codebase. Instead of scattering product context across Notion, Confluence, and README files, everything lives as structured Markdown beside your code — versioned in git, loaded automatically into your agent's context when relevant.

```
your-project/
  src/                   ← your code
  knowledge/
    features/            ← product features
    flows/               ← user flows and sequences
    data/schema/         ← data models and schemas
    ui/                  ← component specs and copy
    validation/          ← validation rules
    integrations/        ← third-party integrations
    decisions/           ← architectural decisions
    foundation/          ← tech stack, conventions, global rules
    _index.yaml          ← auto-generated dependency graph
    _rules.md            ← KB configuration
    _mcp/                ← MCP server (do not edit)
    _templates/          ← KB and prompt templates (customizable)
```

---

## Installation

**1. Copy the server into your project**

```bash
cp -r knowledge/_mcp your-project/knowledge/_mcp
cp -r knowledge/_templates your-project/knowledge/_templates
cd your-project/knowledge/_mcp && npm install
```

**2. Configure your agent**

For Cursor, add to `.cursor/mcp.json` (or run `kb_init` — it writes this automatically):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["knowledge/_mcp/server.js"]
    }
  }
}
```

For Claude Code, add to `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["knowledge/_mcp/server.js"]
    }
  }
}
```

**3. Bootstrap**

Ask your agent: `"Initialize the knowledge base for this project"` — it will call `kb_init`.

Or call it directly:

```js
// non-interactive
kb_init({ interactive: false, config: { projectName: "MyApp", appNames: ["web", "api"] } })
```

---

## Tools

| Tool | What it does |
|------|-------------|
| `kb_init` | Bootstrap `knowledge/` folder, git hooks, merge drivers, and MCP config |
| `kb_get` | Load relevant KB files into agent context (keyword + scope filtering, token budget aware) |
| `kb_write` | Write a KB file and auto-reindex |
| `kb_reindex` | Rebuild `_index.yaml` from all KB files, run lint |
| `kb_scaffold` | Create a new KB file from template. Two-phase when `description` is given: returns a fill prompt → agent fills → writes |
| `kb_ask` | Ask a question about the KB. Classifies intent (query / brainstorm / challenge / onboard) and returns relevant context |
| `kb_drift` | Two-phase drift detection: Phase 1 finds code changes without matching KB updates → returns summary prompts. Phase 2 writes summaries as notes |
| `kb_impact` | Analyze what KB files are affected by a proposed change, using the dependency graph |
| `kb_import` | Two-phase: Phase 1 chunks a document (PDF, DOCX, MD, TXT, HTML) and returns classify prompts. Phase 2 writes agent-classified files |
| `kb_export` | Export KB as JSON (direct), or Markdown / HTML / Confluence / DOCX / PDF (two-phase via agent) |
| `kb_migrate` | Migrate KB files after `_rules.md` structure changes |
| `kb_note_resolve` | Resolve and remove a sync note from `_index.yaml` |

### Two-phase tools

Several tools use a two-phase pattern — the server gathers context and returns a prompt, your agent processes it, then the server writes the result:

```
Agent calls kb_scaffold({ type: "feature", id: "checkout", description: "..." })
  → Server returns { prompt, file_path, template }

Agent reads the prompt, fills in the template content

Agent calls kb_scaffold({ type: "feature", id: "checkout", content: "<filled content>" })
  → Server writes the file
```

Same pattern applies to `kb_drift`, `kb_import`, and `kb_export`.

---

## Usage scenarios

### 1. Starting a new feature

You're about to build a payment flow. Load relevant context first, then scaffold the feature doc.

```
"Load KB context for the checkout and payment features"
→ kb_get({ keywords: ["checkout", "payment"], task_type: "generate" })

"Scaffold a new feature doc for Stripe payment processing"
→ kb_scaffold({ type: "feature", id: "stripe-payments", description: "Stripe integration: charge cards at checkout, handle webhooks for refunds and disputes, store payment method tokens per user." })
→ Agent fills the template using the returned prompt
→ kb_scaffold({ type: "feature", id: "stripe-payments", content: "<filled>" })
```

---

### 2. Keeping KB in sync after code changes

You merged a PR that changed the auth service. Run drift detection to see what KB docs need updating.

```
"Check for drift since last sync"
→ kb_drift({ since: "last-sync" })
→ Returns list of changed files with summary prompts

Agent reads each prompt and writes summaries

"Apply drift summaries"
→ kb_drift({ summaries: [{ kb_target: "features/user-auth.md", summary: "Token expiry reduced to 24h, refresh flow now uses rotating tokens" }] })
→ Server writes notes to _index.yaml
```

---

### 3. Impact analysis before a breaking change

You want to remove the legacy `v1/` API. Find out what breaks.

```
"What KB docs are affected if we remove the v1 REST API?"
→ kb_impact({ change_description: "Remove v1 REST API endpoints. All clients must migrate to v2." })
→ Returns affected files (features, flows, integrations) with per-file proposals

Agent reviews proposals, updates affected KB files with kb_write
```

---

### 4. Onboarding a new developer

New backend engineer joining. Give them a structured onboarding prompt from the KB.

```
"Give me an onboarding brief for the backend scope"
→ kb_ask({ question: "onboard me on the backend — data models, auth, and key flows" })
→ Returns a structured onboarding prompt with all relevant context embedded
```

---

### 5. Importing a spec document

Product handed you a 40-page PRD as a DOCX. Convert it into KB files.

```
"Import the PRD"
→ kb_import({ source: "docs/product-requirements.docx" })
→ Returns chunks with classify prompts (type, suggested_id, confidence)

Agent classifies each chunk

→ kb_import({ files_to_write: [{ path: "knowledge/features/user-onboarding.md", content: "..." }, ...] })
→ Server writes all files and reindexes
```

---

### 6. Exporting for stakeholders

Export the full KB as a Markdown document to share with non-technical stakeholders.

```
"Export the KB as markdown"
→ kb_export({ scope: "all", format: "markdown" })
→ Returns { prompt, output_path } — agent renders a clean stakeholder-friendly summary

→ kb_export({ scope: "all", format: "markdown", rendered_content: "<rendered>" })
→ Writes to knowledge/exports/kb-export.md
```

---

## Presets

`_rules.md` controls how drift detection maps your codebase to KB files. Presets for common stacks are in `knowledge/_mcp/presets/`:

- `nextjs.yaml`
- `react-vite.yaml`
- `react-native.yaml`
- `vue.yaml`
- `django.yaml`
- `rails.yaml`
- `nestjs.yaml`
- `spring-boot.yaml`
- `go.yaml`
- `monorepo.yaml`
- `custom.yaml`

Copy the relevant `code_path_patterns` block into your `knowledge/_rules.md`.

---

## Customizing prompts

All prompts used by the tools are in `knowledge/_templates/prompts/`. To override a prompt for your project without editing the bundled templates, create a file at `knowledge/_prompt-overrides/<prompt-name>.md`. The override directory takes priority.

---

## Git integration

`kb_init` installs:

- **Pre-commit hook** — lints KB files (warns, never blocks)
- **Pre-push hook** — runs drift detection
- **Post-merge hook** — rebuilds `_index.yaml` after pulls
- **Merge drivers** — `kb-reindex` for `_index.yaml`, `kb-conflict` for feature/flow files, `union` for sync logs

---

## File format

Every KB file has YAML front-matter:

```markdown
---
id: stripe-payments
app_scope: web
depends_on:
  - features/checkout.md
  - integrations/stripe.md
owner: payments-team
created: 2026-03-20
screenshot: false
---

## Description
...

## Business rules
...

## Changelog
2026-03-20 — created
```

`depends_on` links are tracked in `_index.yaml` and used by `kb_impact` for blast-radius analysis.

---

## Requirements

- Node.js 18+
- Git repository
- MCP-compatible agent (Claude Code, Cursor, etc.)
