<div align="center">
  <img src="instrumentality-mcp-logo.svg" width="600" alt="Instrumentality-MCP logo" />
</div>

# Instrumentality-MCP

A structured knowledge base for monorepos, managed through MCP tools. Works with Claude Code, Cursor, and any MCP-compatible agent.

> **No API keys required.** The MCP server returns prompts and context. Your agent does the reasoning.

---

## What it does

Instrumentality-MCP creates a `knowledge/` folder in your project and keeps it synchronized with your codebase — in both directions. Code changes are detected and surfaced for KB review (code→KB); KB spec changes are flagged for developers to verify the implementation still matches (KB→code). Instead of scattering product context across Notion, Confluence, and README files, everything lives as structured Markdown beside your code — versioned in git, loaded automatically into your agent's context when relevant.

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
    capabilities/        ← reusable agent instruction prompts
    foundation/          ← tech stack, conventions, global rules
    sync/
      code-drift.md      ← code changed, KB may be stale (PM reviews)
      kb-drift.md        ← KB changed, code may be stale (dev reviews)
      review-queue.md    ← git merge conflicts on KB files
      import-review.md   ← unclassified import chunks
      drift-log/         ← resolved drift audit trail (one file per month)
    _index.yaml          ← auto-generated dependency graph
    _rules.md            ← KB configuration
    _mcp/                ← MCP server (do not edit)
    _templates/          ← KB and prompt templates (customizable)
```

---

## Installation

**1. Install dependencies**

Clone this repo and install:

```bash
git clone <this-repo> kb-mcp
cd kb-mcp/knowledge/_mcp && npm install
```

**2. Configure your agent**

Point your agent's MCP config to the server using its absolute path on disk.

For Cursor, add to `.cursor/mcp.json` (or run `kb_init` — it writes this automatically):

```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["/absolute/path/to/kb-mcp/knowledge/_mcp/server.js"]
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
      "args": ["/absolute/path/to/kb-mcp/knowledge/_mcp/server.js"]
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
| `kb_init` | Bootstrap `knowledge/` folder, git hooks, merge drivers, and MCP config. Re-run to update `code_path_patterns` when stack changes |
| `kb_get` | Load relevant KB files into agent context (keyword + scope filtering, token budget aware). `max_tokens` overrides the budget; default reads `token_budget` from `_rules.md`. Optional `task_context` (`creating`, `fixing`, `reviewing`, `understanding`) adjusts relevance scoring — `creating` boosts same-type files, `reviewing` includes drift targets |
| `kb_write` | Write a KB file and auto-reindex. Rejects paths outside `knowledge/` |
| `kb_reindex` | Rebuild `_index.yaml` from all KB files, run lint. Returns up to 20 lint violations in the result |
| `kb_lint` | Lint KB files for front-matter correctness and secret patterns |
| `kb_scaffold` | Create a new KB file from template (types: `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `capability`, `group`, `enums`, `relations`, `components`, `permissions`, `copy`, `global-rules`, `tech-stack`, `conventions`). Two-phase when `description` is given: loads related KB context, checks for overlapping entries, returns a fill prompt → agent fills → writes |
| `kb_ask` | Ask a question about the KB. Classifies intent (query / brainstorm / challenge / onboard / generate) and returns relevant context. Short tech terms (api, jwt, sql, etc.) are preserved in keyword extraction |
| `kb_drift` | Bidirectional drift detection. Phase 1: code→kb (code changed, KB stale) and kb→code (KB changed, code may be stale). Writes to queue files in `sync/`. Phase 2: three resolution types — `summaries` (KB updated), `reverted` (code was wrong), `kb_confirmed` (kb→code reviewed) |
| `kb_impact` | Analyze what KB files are affected by a proposed change, using the dependency graph |
| `kb_import` | Import documents (PDF, DOCX, MD, TXT, HTML) into KB files. **Auto-classify mode** (recommended): paginated batches with multi-label classification, cross-reference generation, and an import plan for review before writing. **Classic mode**: Phase 1 returns chunks, Phase 2 writes agent-generated files. Supports DOCX images. Rejects paths outside `knowledge/` |
| `kb_export` | Export KB as JSON (direct), or Markdown / HTML / Confluence / DOCX / PDF (two-phase via agent). Supports `purpose` to guide tone/structure, `type` filter (e.g. all flows), multi-scope (array of ids/domains), and automatic pagination for large KBs. PDF and DOCX output includes proper headings, lists, and inline formatting |
| `kb_migrate` | Migrate KB files after `_rules.md` structure changes. `since` sets the comparison ref (auto-detected if omitted); `dry_run` previews prompts without writing |
| `kb_analyze` | Scan project source files and generate a KB coverage inventory. Groups files by their KB target using `code_path_patterns` from `_rules.md`. Optional `write_drafts` creates draft KB files (`confidence: draft`) for uncovered groups. Useful for bootstrapping KB on legacy projects |

### Two-phase tools

Several tools use a two-phase pattern — the server gathers context and returns a prompt, your agent processes it, then the server writes the result:

```
Agent calls kb_scaffold({ type: "feature", id: "checkout", description: "..." })
  → Server returns { prompt, file_path, template }

Agent reads the prompt, fills in the template content

Agent calls kb_scaffold({ type: "feature", id: "checkout", content: "<filled content>" })
  → Server writes the file
```

Same pattern applies to `kb_export`. `kb_scaffold` also loads related KB files before returning the fill prompt, so the agent can check for overlapping entries and align new content with existing docs. The fill prompt includes an **overlap detection** step — if an existing KB file already covers the same topic, the agent warns before creating a duplicate. `kb_import` supports a **3-phase auto-classify mode**: (1) extract and return chunks in paginated batches for agent classification, (2) return an import plan with proposed files and cross-references, (3) write files on approval. `kb_drift` works differently — Phase 1 writes entries to queue files (no prompts returned). Review happens when PM or developer asks Claude to read the queue files; Claude fetches the git diff live and explains in plain English.

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

Drift entries are written automatically by two hooks:
- **pre-push** — when you push your branch
- **post-merge** — when branches are merged (catches cross-branch semantic conflicts)

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
→ Entry removed from code-drift.md, KB note written, resolution logged to sync/drift-log/
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
→ Entry closed, resolution logged to sync/drift-log/
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

Product handed you a 115-page specification as a DOCX. Convert it into KB files with auto-classify mode.

```
"Import the spec using auto-classify"
→ kb_import({ source: "docs/spec.docx", auto_classify: true })
→ Server extracts text (preserving headings and images from DOCX),
  chunks by heading hierarchy, returns first batch of 5 chunks
  with a classify prompt

Agent classifies each batch (multi-label: one chunk can be a feature + flow + validation)

→ kb_import({ source: "docs/spec.docx", auto_classify: true,
    classifications: [
      { chunk_id: "chunk-1", types: [
        { type: "feature", confidence: 0.9, suggested_id: "invoice-create", reason: "..." },
        { type: "validation", confidence: 0.75, suggested_id: "invoice-create-rules", reason: "..." }
      ], suggested_group: "billing" }
    ], cursor: 5 })
→ Returns next batch (or import plan when all batches classified)

Import plan includes proposed files, cross-references (depends_on),
and items needing review (low confidence)

"Looks good, write it"
→ kb_import({ source: "docs/spec.docx", auto_classify: true, approve: true })
→ Server writes all files with cross-references in frontmatter and reindexes
```

**Classic mode** (without `auto_classify`) still works as before — Phase 1 returns all chunks with classify prompts, Phase 2 writes agent-generated files via `files_to_write`.

**DOCX image support**: Embedded images are extracted to `knowledge/assets/imports/` and referenced as markdown image links in the chunked text.

---

### 6. Exporting for stakeholders

Export the KB with an optional `purpose` to guide tone, depth, and structure. Filter by `type` (all flows, all integrations) or pass multiple scopes.

```
# Full KB as markdown for a client demo
"Export the KB as a client-facing overview"
→ kb_export({ scope: "all", format: "markdown",
    purpose: "Client demo — emphasize capabilities, hide implementation details" })
→ Returns { prompt, output_path } — agent renders content tailored to the purpose

→ kb_export({ scope: "all", format: "markdown", rendered_content: "<rendered>" })
→ Writes to knowledge/exports/all-2026-03-22.md

# All flows as PDF
"Export all user flows as a PDF"
→ kb_export({ type: "flow", format: "pdf",
    purpose: "QA team reference for all user workflows" })
→ Agent renders → PDF with proper headings, bullet lists, page breaks per section

# Specific features as DOCX for CFO review
"Export billing features for the CFO"
→ kb_export({ scope: ["invoice-create", "payment-process", "refund-flow"],
    format: "docx", purpose: "CFO review of billing features — business value focus" })
→ DOCX with Heading 1/2/3 styles, numbered lists, bold/italic formatting

# Combine type + scope: all validations in a domain
→ kb_export({ scope: "billing", type: "validation", format: "markdown",
    purpose: "QA team needs all billing validation rules" })
```

Large KBs are paginated automatically — the agent renders each page and combines them before writing.

---

### 7. Bootstrapping KB on a legacy codebase

You have an existing project with 200+ source files and no KB. Use `kb_analyze` to scan the codebase and generate a coverage inventory.

```
"Analyze the codebase and show me what KB files we need"
→ kb_analyze({ depth: 4 })
→ Returns inventory: groups of source files mapped to KB targets,
  which ones already have KB files, and suggested actions (create/review/skip)

Review the inventory, then create drafts:

"Create draft KB files for uncovered groups"
→ kb_analyze({ write_drafts: true })
→ Creates draft KB files with confidence: draft, listing source files
  and open questions for the agent or developer to fill in
```

Each draft includes a file list, summary placeholder, and open questions. Review and flesh out each one — drafts are a starting point, not a finished product.

---

### 8. Creating reusable agent capabilities

Capabilities are project-agnostic agent instruction prompts stored in `knowledge/capabilities/`. They teach agents how to perform specific tasks consistently.

```
"Create a capability for code review"
→ kb_scaffold({ type: "capability", id: "code-review",
    description: "Guide agents through structured code review: check for security, performance, and consistency with KB conventions" })
→ Agent fills the template: purpose, when to use, instructions, constraints
→ kb_scaffold({ type: "capability", id: "code-review", content: "<filled>" })
```

Capabilities are loaded via `kb_get` like any other KB file — use `keywords: ["code-review"]` or `task_context: "reviewing"` to surface them.

---

### 9. Catching cross-branch semantic conflicts after a merge

Two developers work in parallel. Neither causes a git conflict, but together they create an inconsistency.

```
Dev A (branch: feature/new-auth):
→ Updates knowledge/features/user-auth.md
  "Session tokens now expire after 24h, refresh tokens rotate on every use"

Dev B (branch: fix/auth-service):
→ Updates src/auth/tokenService.ts
  (still implements 7-day expiry, rotation disabled)

Both branches merge to main — git has no conflict (different files)

→ post-merge hook runs drift from ORIG_HEAD:
  - sees user-auth.md changed on one branch → writes entry to kb-drift.md
  - sees tokenService.ts changed on other branch → writes entry to code-drift.md

Developer opens Claude: "review kb-drift.md"
→ Claude fetches git diff, explains: "KB now requires 24h expiry and rotating refresh tokens"
→ Developer updates tokenService.ts to match

PM opens Claude: "review code-drift.md"
→ Claude fetches git diff, explains what changed in tokenService.ts
→ PM approves: kb_drift({ summaries: [{ kb_target: "features/user-auth.md", summary: "..." }] })
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
- **Pre-push hook** — submodule branch guard (blocks push if owned submodule is on wrong branch); runs bidirectional drift detection; appends entries to `sync/code-drift.md` (code changed) and `sync/kb-drift.md` (KB changed). Compares against the remote tracking branch tip (covers all unpushed commits, not just the last one). Re-entry guard prevents double-commits when the hook auto-commits drift files
- **Post-merge hook** — rebuilds `_index.yaml`; then runs drift detection from `ORIG_HEAD` to catch semantic conflicts between branches (KB changed on one branch, related code changed on another)
- **Merge drivers** — `kb-reindex` for `_index.yaml`, `kb-conflict` for feature/flow files, `union` for sync logs

---

## File ownership

Files in `knowledge/` have three ownership tiers. Violating them causes silent data loss — the server overwrites manual edits on the next tool run.

### Tier 1 — Agent only, never edit manually

| File | Managed by |
|------|-----------|
| `_index.yaml` | `kb_reindex` (runs after every `kb_write`) |
| `sync/drift-log/YYYY-MM.md` | `kb_drift` Phase 2 — append-only audit trail, split by month |

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
| `sync/code-drift.md` | pre-push + post-merge hooks (code changed, KB may be stale) | PM decides: update KB or revert code |
| `sync/kb-drift.md` | pre-push + post-merge hooks (KB changed, code may be stale) | Developer confirms code still matches |
| `sync/review-queue.md` | git merge conflict driver (same KB file edited on two branches) | Resolve conflict markers in file, then close entry |
| `sync/import-review.md` | `kb_import` | Classify unresolved chunks via Claude |

Do not delete entries from Tier 3 files manually — always resolve through `kb_drift` or the relevant tool so the resolution is logged to `sync/drift-log/`.

---

## Git submodule support

Projects that use git submodules (e.g., separate `backend/` and `frontend/` repos) get additional safety and drift tracking.

### Two kinds of submodule

| Type | Example | Branch rule | Drift behavior |
|------|---------|------------|----------------|
| **Owned** | `backend/`, `frontend/` | Must match parent branch | Drift entries prefixed with submodule path |
| **Shared** | `client-sdk/`, `common-lib/` | Independent (own branch) | Drift entries tagged with `**Shared module:** true` |

Mark a submodule as shared in `.gitmodules`:

```ini
[submodule "client-sdk"]
    path = client-sdk
    url = git@github.com:org/client-sdk.git
    kb-shared = true
```

### Pre-push branch guard

The pre-push hook checks owned submodules whose pointer changed in the push. If a submodule is on a different branch than the parent, the push is blocked:

```
[kb] ERROR: Submodule branch mismatch — push blocked.
[kb] Parent is on 'feature/auth' but these submodules are not:
  backend  (on 'main', expected 'feature/auth')
```

Shared submodules are not blocked — only a warning is printed when their pointer changes.

### kb-feature.sh — push helper

`kb-feature.sh` ensures submodules are pushed before the parent in the correct order:

```bash
# Show status of all submodules
./knowledge/_mcp/scripts/kb-feature.sh status

# Push submodules first, then parent
./knowledge/_mcp/scripts/kb-feature.sh push
```

Push behavior:
- **Owned submodules** are pushed to the parent's branch name (`-u origin feature/auth`)
- **Shared submodules** are pushed to their own current branch (`-u origin main`)
- If any submodule push fails, the parent push is skipped
- The parent is pushed last

### Merge order (feature branch back to main)

```
1. In each involved submodule: merge feature → main, push
2. In parent on main: git submodule update (pointer tracks submodule's main)
3. In parent: merge feature → main, push
```

Wrong order leaves parent's main pointing to a submodule commit that only exists on a feature branch.

### Drift detection in submodules

Drift uses a per-submodule comparison ref (not the parent's ref), so it correctly detects all unpushed commits within each submodule. Code path patterns in `_rules.md` must include the submodule prefix:

```yaml
code_path_patterns:
  - intent: service-logic
    kb_target: "features/{name}.md"
    paths:
      - "src/services/**"           # direct parent code
      - "backend/src/services/**"   # submodule code
```

`kb_init` will suggest prefixed patterns when it detects submodules.

### Mixed setups

Not all code needs to be in submodules. Direct parent code and submodule code coexist naturally — drift scans parent files first, then submodule files, both feed into the same drift queue. If no `.gitmodules` exists, all submodule features are no-ops.

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
- Windows: Git for Windows (provides sh.exe, awk, sed, grep used by git hooks)
