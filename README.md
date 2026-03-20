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
| `kb_drift` | Bidirectional drift detection. Phase 1: code→kb (code changed, KB stale) and kb→code (KB changed, code may be stale). Writes to queue files in `sync/`. Phase 2: three resolution types — `summaries` (KB updated), `reverted` (code was wrong), `kb_confirmed` (kb→code reviewed) |
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

Same pattern applies to `kb_import` and `kb_export`. `kb_drift` works differently — Phase 1 writes entries to queue files (no prompts returned). Review happens when PM or developer asks Claude to read the queue files; Claude fetches the git diff live and explains in plain English.

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

Drift detection is bidirectional and PM-gated. Code changes don't update the KB automatically — a PM or tech lead reviews the queue first.

**code→kb** (code changed, KB may be stale):

```
git push
→ pre-push hook writes entry to knowledge/sync/code-drift.md:

  ## features/user-auth.md
  - KB target: features/user-auth.md
  - Code files:
    - src/auth/tokenService.ts — since a1b2c3d (2026-03-20)
  - Status: pending-review

PM opens Claude: "review code-drift.md"
→ Claude fetches: git diff a1b2c3d..HEAD -- src/auth/tokenService.ts
→ Explains in plain English: "token expiry changed from 7d to 24h, refresh tokens now rotate"
→ PM decides

"The change is correct, update the KB"
→ kb_drift({ summaries: [{ kb_target: "features/user-auth.md", summary: "Token expiry reduced to 24h, refresh tokens now rotate" }] })
→ Entry removed from code-drift.md, KB note written, resolution logged to drift-log.md
```

Multiple commits to the same file before PM reviews — no duplicate entries. Claude always fetches `git diff since..HEAD` so it sees all accumulated changes.

If the code was wrong instead:
```
PM: "That change was a mistake, it will be reverted"
→ kb_drift({ reverted: [{ code_file: "src/auth/tokenService.ts" }] })
→ Code file removed from entry, no KB update written
```

**kb→code** (KB spec changed, code may be stale):

```
PM updates knowledge/features/checkout.md and pushes
→ pre-push hook writes entry to knowledge/sync/kb-drift.md:

  ## features/checkout.md
  - KB file: features/checkout.md
  - Code areas to review:
    - src/app/api/checkout/**
    - src/components/**Form*
  - Since: c3d4e5f (2026-03-20)
  - Status: pending-review

Developer opens Claude: "review kb-drift.md"
→ Claude fetches: git diff c3d4e5f..HEAD -- knowledge/features/checkout.md
→ Explains what spec changed in plain English
→ Developer checks the listed code areas

"Code already matches the updated spec"
→ kb_drift({ kb_confirmed: [{ kb_file: "features/checkout.md" }] })
→ Entry closed, resolution logged to drift-log.md
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

- **Pre-commit hook** — lints KB files (warns, never blocks); warns if Tier 1 auto-generated files are staged
- **Pre-push hook** — runs bidirectional drift detection; appends entries to `sync/code-drift.md` (code changed) and `sync/kb-drift.md` (KB changed)
- **Post-merge hook** — rebuilds `_index.yaml` after pulls
- **Merge drivers** — `kb-reindex` for `_index.yaml`, `kb-conflict` for feature/flow files, `union` for sync logs

---

## File ownership

Files in `knowledge/` have three ownership tiers. Violating them causes silent data loss — the server overwrites manual edits on the next tool run.

### Tier 1 — Agent only, never edit manually

| File | Managed by |
|------|-----------|
| `_index.yaml` | `kb_reindex` (runs after every `kb_write`) |
| `sync/drift-log.md` | `kb_drift` Phase 2 — append-only audit trail |
| `sync/changelog.md` | `kb_reindex` — auto-generated change history |

The pre-commit hook warns if any of these are staged. `_index.yaml` has a `# AUTO-GENERATED` header that `kb_lint` checks for.

### Tier 2 — Humans directly, no agent needed

| File | Purpose |
|------|---------|
| `_rules.md` | Project config — depth policy, code path patterns, secrets |
| `_templates/` | Customize KB file templates |
| `_prompt-overrides/` | Override bundled prompts for your project |
| `features/*.md`, `flows/*.md`, etc. | KB content — developers and PMs edit directly; agent can too |

### Tier 3 — Shared / hybrid

Written by the server automatically, reviewed and resolved by humans via Claude.

| File | Written by | Human role |
|------|-----------|------------|
| `sync/code-drift.md` | pre-push hook (code changed) | PM decides: update KB or revert code |
| `sync/kb-drift.md` | pre-push hook (KB changed) | Developer confirms code still matches |
| `sync/review-queue.md` | lint violations, challenge intent, merge conflicts | Add notes, resolve via Claude |
| `sync/import-review.md` | `kb_import` | Classify unresolved chunks via Claude |

Do not delete entries from Tier 3 files manually — always resolve through `kb_drift` or the relevant tool so the resolution is logged to `drift-log.md`.

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
