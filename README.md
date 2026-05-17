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
    data/schema/         ← data models (DBML format, one file per database)
    ui/                  ← component specs and copy
    validation/          ← validation rules
    integrations/        ← third-party integrations
    decisions/           ← architectural decisions
    assets/
      design/            ← design files and diagrams
      screenshots/       ← UI screenshots referenced in KB docs
    standards/           ← how to work on this project (contextually loaded)
      code/              ← loaded when writing/reviewing code
      knowledge/         ← loaded when writing/reviewing KB files
      process/           ← task workflows and checklists
    sync/
      code-drift.md      ← code changed, KB may be stale (PM reviews)
      kb-drift.md        ← KB changed, code may be stale (dev reviews)
      review-queue.md    ← git merge conflicts on KB files
      import-review.md   ← unclassified import chunks
      drift-log/         ← resolved drift audit trail (one file per month)
      inbound/           ← issue triage reports (written by kb_issue command=triage)
      outbound/          ← task breakdowns for PM tools (written by kb_issue command=plan)
    _index.yaml          ← auto-generated dependency graph
    _rules.md            ← KB configuration (depth policy, token_budget, code path patterns, secrets)
    exports/             ← kb_export output files
    _prompt-overrides/   ← project-specific prompt overrides (takes priority over _templates/prompts/)
    _mcp/                ← MCP server (do not edit)
    _templates/          ← KB and prompt templates (customizable)
      data/              ← schema and enum templates
      ui/                ← UI component templates
      standards/         ← standards templates
      prompts/           ← prompt templates (overridable via _prompt-overrides/)
```

### Lifecycle at a glance

Drift and standards conformance are queue-driven. Two MCP tools (`kb_drift` and `kb_conform`) write entries into Markdown queue files; humans (or the agent) read those entries and submit verdicts that close them. Every resolution is logged to `sync/drift-log/YYYY-MM.md` for audit.

```
                 git diff window (since baseline → HEAD)
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
         kb_drift                              kb_conform
      (Phase 1: detect)                     (Phase 1: detect)
              │                                   │
      ┌───────┴───────┐                  ┌────────┴────────┐
      ▼               ▼                  ▼                 ▼
  code-drift.md   kb-drift.md      standards-drift.md   standards-backlog.md
  (code → KB)     (KB → code)      (must-fix this PR)   (advisory, aspirational)
      │               │                  │                 │
      └────┬──────────┘                  ▼                 ▼
           ▼                       kb_conform           (advisory only —
   kb_drift Phase 2:               Phase 2:              surfaced via kb_get)
   summaries / reverted /          applied / exempted /
   kb_confirmed / dismiss          promoted / dismissed
           │                              │
           │                ┌─────────────┼─────────────┐
           │                ▼             ▼             ▼
           │           rule.excep-   standards-      drift-log/
           │           tions[]       promotions.md   (audit)
           │           writeback     (ledger)
           │                              │
           │                              │ suppresses (file, rule)
           │                              ▼
           │                       future Phase 1 sweeps skip these
           │                              │
           │                 ┌────────────┴────────────┐
           │                 ▼                         ▼
           │       rule fingerprint changes    senior calls kb_conform
           │       (auto-close)                with closed_promotion
           │                 │                         │
           │                 └────────────┬────────────┘
           │                              ▼
           │                       entry removed
           │                       (writes exception in rule)
           │                              │
           └──────────────────────────────┴──→ sync/drift-log/YYYY-MM.md
                                              (append-only audit)
```

The drift-log records every Phase-2 close with a discriminating `event_type`. Auto-close events appear as `AUTO-CLOSED-PROMOTION · rule changed`, `AUTO-CLOSED-PROMOTION · standard removed`, and `AUTO-DISMISSED · standard removed` — useful to grep when reconstructing why an entry left the queue.

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
| `kb_init` | Bootstrap `knowledge/` folder, git hooks, merge drivers, MCP config, and agent rule files (`CLAUDE.md`, `.cursorrules`, `.windsurfrules`). Re-run to update `code_path_patterns` when stack changes. Pass `regenerate_agent_rules: true` (with optional `force: true`) to (re)generate the agent rule files only |
| `kb_get` | Load relevant KB files into agent context (keyword + scope filtering, token budget aware). `max_tokens` overrides the budget; default reads `token_budget` from `_rules.md`. Optional `task_context` (`creating`, `fixing`, `reviewing`) adjusts relevance scoring — `creating` boosts same-type files, `fixing` boosts code standards, `reviewing` includes drift targets. **Pass `working_paths: [...]`** with the file paths you're about to edit and the response includes a separate `rules_in_scope` field listing applicable standards rules (capped at `working_paths_cap`, descriptions trimmed to first paragraph or 300 chars). Aspirational backlog entries surface in the same field as `advisory: true`. |
| `kb_write` | Write a KB file and auto-reindex. Rejects paths outside `knowledge/`. Response includes the full reindex + lint result (up to 20 lint violations). Lint and reindex run automatically on every write and via git hooks — they're not exposed as separate tools. **Writes to `knowledge/standards/<group>/<id>.md` synchronously trigger an aspirational `kb_conform` sweep** (skipped on lint errors); the result lands under `aspirational_sweep` in the response, queue entries in `sync/standards-backlog.md`. |
| `kb_scaffold` | Create a new KB file from template (types: `feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `standard`, `group`, `component`). Two-phase when `description` is given: loads related KB context, checks for overlapping entries, returns a fill prompt → agent fills → writes. For `type: standard`, `group` must be one of `code | contracts | knowledge | process`. Legacy types `tech-stack` and `conventions` were removed; the tool returns a migration hint pointing at `foundation/<id>.md` for inventory or `standards/code/<id>.md` for rules. |
| `kb_ask` | Ask a question about the KB. Classifies intent (query / sync / brainstorm / challenge / onboard / generate) and returns relevant context. Short tech terms (api, jwt, sql, etc.) are preserved in keyword extraction |
| `kb_drift` | Bidirectional **functional** drift detection. Phase 1: code→kb (code changed, KB stale) and kb→code (KB changed, code may be stale). Writes to queue files in `sync/`. Handles file/folder renames as single linked operations — code renames annotate the entry with `← renamed from`, KB renames surface broken `[[wikilink]]` references with a count and file list. Stale `_rules.md` patterns (old path matched, new path doesn't) are returned as `stale_patterns[]` warnings. Phase 2: three resolution types — `summaries` (KB updated), `reverted` (code was wrong), `kb_confirmed` (kb→code reviewed). The pre-push hook passes the remote name automatically; sync baseline is resolved via graduated fallback: upstream tracking ref → `<remote>/<branch>` → closest parent branch (merge-base across all remote branches, so `main→dev→feature` correctly finds `dev`) → skip with warning. Submodules with a different remote name than the parent are detected and warned about explicitly (with a fix command), not silently skipped or compared against the wrong remote |
| `kb_conform` | **Non-functional** conformance — does code follow the architectural decisions in standards? Three phases. **Phase 1** (no resolution args): MCP runs cheap pre-filters (path glob, exceptions, min_lines, regex, ast-grep) and returns `requested_evaluations: [{file, standard_id, rule_ids[]}]` plus a prompt for the agent to evaluate. Deterministic regex/ast-grep failures are queued without an LLM round-trip. **Phase 1.5** (`submit_judgments: [{file, standard_id, rule_id, status, reason}]`): MCP verifies completeness against the requested set and returns `gaps[]` if any triple is missing. The queue is not advanced until every requested triple has a judgment. **Phase 2** (`applied`/`exempted`/`promoted`/`dismissed`): close queue entries. `exempted` writes a per-rule `exceptions: [{paths, reason}]` entry into the standard so future runs skip those files; `promoted` records intent in the audit log without modifying the standard (senior-dev review via `kb_inventory.pending_promotions`). Queue files: `sync/standards-drift.md` (current diff) and `sync/standards-backlog.md` (aspirational sweeps). |
| `kb_inventory` | Read-only signal report for senior devs. Returns `stale_rules` (rules whose `applies_to.paths` matches no source files), `uncovered_files` (source files matching no standard's globs), and `pending_promotions` (recent `promoted` events from the audit log). Never writes; running it twice produces zero changes. Use to inform manual `kb_extract` / `kb_write` decisions — does not auto-promote. |
| `kb_impact` | Analyze what KB files are affected by a proposed change, using the dependency graph |
| `kb_import` | Import documents (PDF, DOCX, MD, TXT, HTML) into KB files. **Auto-classify mode** (recommended): paginated batches with multi-label classification, cross-reference generation, and an import plan for review before writing. **Classic mode**: Phase 1 returns chunks, Phase 2 writes agent-generated files. Supports DOCX images. Rejects paths outside `knowledge/` |
| `kb_export` | Export KB in multiple formats. `json` writes directly (no agent needed). `markdown`, `html`, `confluence`, `notion`, `docx`, `pdf` are two-phase via agent. Supports `purpose` to guide tone/structure, `type` filter (e.g. all flows), multi-scope (array of ids/domains), and automatic pagination for large KBs. PDF and DOCX output includes proper headings, lists, and inline formatting |
| `kb_migrate` | Migrate KB files after `_rules.md` structure changes. `since` sets the comparison ref (auto-detected if omitted); `dry_run` previews prompts without writing |
| `kb_analyze` | Scan project source files and generate a KB coverage inventory. Groups files by their KB target using `code_path_patterns` from `_rules.md`. Optional `write_drafts` creates draft KB files (`confidence: draft`) for uncovered groups. Useful for bootstrapping KB on legacy projects |
| `kb_extract` | Derive a standards document from existing code or KB files. Phase 1: samples representative files and returns a prompt for the agent to observe patterns and fill the template. Phase 2: writes the filled standard. Supports `paths` to narrow sampling (glob patterns for code, subfolder name for KB), and `app_scope` for multi-stack projects |
| `kb_issue` | Issue ↔ KB bridge. `command: "triage"` — Phase 1 searches KB for related docs and returns a triage prompt, Phase 2 writes the report to `sync/inbound/`. Supports `issue_id`, `source` (jira/github/linear), `labels`, `priority`. `command: "plan"` — Phase 1 gathers source docs by `scope`/`type`/`keywords` and returns a planning prompt, Phase 2 writes task breakdown YAML to `sync/outbound/`. Supports `target` and `project_key`. `command: "consult"` — single-phase; returns a prompt advising the reporter before filing. `app_scope` filters KB search in all three commands |
| `kb_sub` | Submodule coordination. `status`: shows parent + submodule branches, pointer changes, owned/shared types. `push`: pushes submodules first (correct order), then parent — supports `dry_run` to preview the plan. `merge_plan`: returns correct merge sequence for feature-to-main |
| `kb_autotag` | Auto-extract tags from KB file content and write them to frontmatter. Improves `kb_ask` search accuracy when files have empty `tags: []`. Extracts from headings (3×), bold text, inline code, file path, and body word frequency. Merges with existing tags — never removes manual ones. Run `file_path: "all"` (default) or target a single file |
| `kb_autorelate` | Discover semantic relations between KB files using keyword overlap (Overlap Coefficient). Proposes `depends_on` links. Use `dry_run: true` to preview before writing. `threshold` (default `0.25`) controls sensitivity. Direction is inferred from type priority: schemas and validation are upstream, flows and decisions are downstream |
| `kb_schema` | Query database schema files (DBML format) with table-level extraction. `list`: returns all table/enum names in a schema file. `query`: extracts specific tables by name (`entities`) or keyword relevance (`keywords`). Schema files use one-file-per-database layout with dbdiagram.io DBML syntax in the markdown body. `kb_get` automatically filters schema files to relevant tables when loading context |

### `_rules.md` configuration reference

Key fields you can set in the YAML front-matter of `knowledge/_rules.md`:

| Field | Default | Purpose |
|-------|---------|---------|
| `token_budget` | `8000` | Max tokens `kb_get` loads per call. Override per-call with `max_tokens` |
| `depth_policy` | see template | Max folder nesting per domain before files are grouped |
| `secret_patterns` | see template | Patterns that block KB file writes if found in content |
| `code_path_patterns` | stack preset | Maps source file globs to KB targets for drift detection |
| `working_paths_cap` | `10` | Max rules `kb_get` returns in `rules_in_scope` per call (token budget at guidance time) |
| `standards_threshold` | `40` | Soft warning when a standard's rule count exceeds this (sprawl detector) |
| `app_root_patterns` | `{}` | Path glob → app_scope mapping for monorepos. Drives `kb_get`/`kb_conform` app-scope inference when the agent doesn't pass `app_scope` explicitly. Unset → only `app_scope: all` standards match in inferred contexts. |

### Two-phase tools

Several tools use a two-phase pattern — the server gathers context and returns a prompt, your agent processes it, then the server writes the result:

```
Agent calls kb_scaffold({ type: "feature", id: "checkout", description: "..." })
  → Server returns { prompt, file_path, template }

Agent reads the prompt, fills in the template content

Agent calls kb_scaffold({ type: "feature", id: "checkout", content: "<filled content>" })
  → Server writes the file
```

Same pattern applies to `kb_export`, `kb_extract`, and `kb_issue` (`triage` and `plan` commands). `kb_scaffold` also loads related KB files before returning the fill prompt, so the agent can check for overlapping entries and align new content with existing docs. The fill prompt includes an **overlap detection** step — if an existing KB file already covers the same topic, the agent warns before creating a duplicate. `kb_import` supports a **3-phase auto-classify mode**: (1) extract and return chunks in paginated batches for agent classification, (2) return an import plan with proposed files and cross-references, (3) write files on approval. `kb_drift` works differently — Phase 1 writes entries to queue files (no prompts returned). Review happens when PM or developer asks Claude to read the queue files; Claude fetches the git diff live and explains in plain English.

---

## Usage scenarios

### 1. Starting a new feature

You're about to build a payment flow. Load relevant context first, then scaffold the feature doc.

```
"Load KB context for the checkout and payment features"
→ kb_get({ keywords: ["checkout", "payment"], task_context: "creating" })

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

**Merge-conflict protocol for drift queues.** The queue files (`sync/code-drift.md`, `sync/kb-drift.md`) and the drift log are committed with `merge=union` in `.gitattributes`, so branches rarely conflict:

- **Different entries on each branch** — union concatenates cleanly, no action needed.
- **Same entry on both branches** — real semantic conflict. Resolve by hand: dedupe the duplicate heading and keep the entry whose `since` commit is later.
- **Baseline line (`<!-- baseline: <sha> -->`)** — the post-merge hook runs `kb_drift({ dedup_baselines: true })` automatically, which collapses duplicates to whichever SHA is the descendant of the other. If the hook didn't run (shallow clone, detached-HEAD merge), remove the ancestor line manually.

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

Import plan includes proposed files, cross-references ([[wikilinks]] and depends_on),
and items needing review (low confidence)

"Looks good, write it"
→ kb_import({ source: "docs/spec.docx", auto_classify: true, approve: true })
→ Server writes all files with cross-references as [[wikilinks]] in content and reindexes
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

### 8. Creating standards & enforcing conformance

Standards govern *how* to work on this project — architectural patterns, layering rules, contracts between apps, naming/structure decisions. They live in `knowledge/standards/` as **pure-frontmatter YAML** documents (no markdown body) and are queryable, structurally checkable, and enforced via `kb_conform`.

> **Boundary:** if eslint / prettier / tsc / biome can enforce it, it doesn't belong here. Standards capture decisions tooling can't make on its own.

#### Standard file shape

Every standard is a YAML file with no body. Rules are entries in the `rules:` array, each with a stable local `id` paired with the standard's `id` for unambiguous cross-tool references.

```yaml
---
id: complex-screen-routing
type: standard
kind: stack-local           # stack-local | contract | process | knowledge
app_scope: ms-fe-web
topic: screens
created: 2026-04-26
tags: [react-router, screens]
rules:
  - id: decompose-by-routes
    title: Decompose complex screens via nested routes
    severity: warn          # info | warn | error
    applies_to:
      paths: ["src/screens/**"]
      min_lines: 200        # cheap pre-filter — rule fires only on files larger than this
    detect:
      kind: llm             # llm | regex | ast-grep
      hint: "screen uses conditional render trees instead of <Routes>"
    fix_hint: "introduce nested <Routes>; split branches into route components"
    description: |
      Screens over ~200 lines handling multiple distinct sub-views should be
      broken into nested routes rather than conditional rendering trees.
    why: |
      Tab-state mega-screens (2023) caused testing surface to explode.
    examples: ["[[features/checkout]]"]
    exceptions: []          # filled by kb_conform exempted resolution
---
```

**Cross-app contracts** use `kind: contract` and scope each side via `parties[].applies_to.paths`:

```yaml
---
id: i18n-translation-keys
type: standard
kind: contract
app_scope: [ms-be-go, ms-fe-web]
parties:
  backend:
    app_scope: [ms-be-go]
    applies_to: { paths: ["ms-be-go/handlers/**"] }
    detect: { kind: ast-grep, hint: "no literal user-facing strings in API responses" }
  frontend:
    app_scope: [ms-fe-web]
    applies_to: { paths: ["ms-fe-web/src/**"] }
    detect: { kind: llm, hint: "must call t(key); never render BE strings raw" }
rules:
  - id: keys-only
    title: BE sends translation keys; FE renders via t()
    severity: error
    description: |
      Backend responses contain translation keys, never user-facing strings.
      Frontend always passes received keys through t() before rendering.
    exceptions: []
---
```

#### Editor support — JSON Schema

`knowledge/_mcp/schemas/standard.schema.json` ships with the project. Wire it into VSCode's YAML extension for live validation and autocomplete while editing standards directly:

```jsonc
// .vscode/settings.json
{
  "yaml.schemas": {
    "knowledge/_mcp/schemas/standard.schema.json": "knowledge/standards/**/*.md"
  }
}
```

The schema is editor-only. Structural enforcement happens via the internal `kb_lint` module — it runs automatically inside `kb_reindex` (after every `kb_write`) and via the pre-commit hook ([`scripts/lint-standalone.js`](knowledge/_mcp/scripts/lint-standalone.js)). It is not exposed as an MCP tool. Enumerated checks: missing `id`/`title`/`severity`/`description`, duplicate rule ids, bad `severity`/`detect.kind`, contracts requiring `parties[].applies_to.paths`, overlapping party `app_scope`, etc.

#### Authoring — three on-ramps

**Manually:** copy [`_templates/standards/standard.md`](knowledge/_templates/standards/standard.md), fill the YAML, save.

**Via `kb_scaffold`:** template + description → LLM produces a draft → review and save. `group` selects the subfolder:

```
kb_scaffold({ type: "standard", id: "complex-screen-routing", group: "code",
              app_scope: "ms-fe-web",
              description: "screens over 200 lines should split via routes" })
```

**Via `kb_extract`** (best for existing projects — derive from observed code patterns):

```
kb_extract({ source: "code", target_id: "screen-routing",
             target_group: "code", paths: ["src/screens/**"] })
→ Phase 1: samples representative files, returns a prompt for the agent
→ Agent observes actual patterns and fills the YAML rules array (no body)
→ kb_extract({ ..., content: "<filled YAML>" })
```

`target_group` is one of `code | contracts | knowledge | process`. Knowledge-writing standards (rules about how to write KB files themselves) live under `standards/knowledge/`.

#### The conformance loop

`kb_conform` answers one question: **"does the code I just wrote follow the standards?"** It runs in three phases because the work splits naturally between code (cheap, deterministic) and judgment (LLM, expensive).

```
   Phase 1  detect                       (MCP, deterministic)
   ────────────────────────────────────────────────────────────────
   Walks the diff (or the whole codebase, in aspirational mode).
   Applies cheap pre-filters: path globs, min-lines, party scope,
   already-exempted, already-promoted. Returns a small list of
   (file, rule) pairs to judge — plus the file contents.
                              │
                              ▼
   Phase 1.5  judge                      (you / the agent)
   ────────────────────────────────────────────────────────────────
   Read each (file, rule) pair, decide pass / fail / n/a. Submit
   ALL judgments in one call (partial submissions return gaps[]
   and don't advance the queue). Failures land in a queue file.
                              │
                              ▼
   Phase 2  resolve queue entries        (you / the agent)
   ────────────────────────────────────────────────────────────────
   For each queued failure, pick exactly one outcome:
     applied   — code was fixed
     exempted  — justified exception, written into rule.exceptions[]
     promoted  — code is right, standard should change (suppress + log)
     dismissed — false positive
```

**Why three phases?** Phase 1 is cheap, so it runs every time and bounds the work. Phase 1.5 is where the LLM actually thinks — keeping it separate means the MCP can verify completeness (no rule silently skipped). Phase 2 is the deliberate decision per violation; nothing is auto-resolved.

**Two queue files** capture results, depending on which mode produced them:
- [`sync/standards-drift.md`](knowledge/sync/standards-drift.md) — current-mode sweep against the diff between a baseline SHA and HEAD. This is the PR gate.
- [`sync/standards-backlog.md`](knowledge/sync/standards-backlog.md) — aspirational sweep across the whole codebase against a (possibly new) standard. Advisory only; doesn't gate PRs.

The full API:

```
# Phase 1 — detect
→ kb_conform()
← { requested_evaluations: [{file, standard_id, rule_ids[]}], prompt }

# Phase 1.5 — submit per-rule judgments (one per requested triple)
→ kb_conform({ submit_judgments: [
    { file, standard_id, rule_id, status: "fail", reason: "..." },
    { file, standard_id, rule_id, status: "pass", reason: "..." }
  ]})
← { entries_new, queue_advanced: true }
  // Or: { gaps: [...], queue_advanced: false }  — fill gaps and resubmit

# Phase 2 — resolve queue entries
→ kb_conform({ applied: [{ queue_key: "complex-screen-routing.decompose-by-routes" }] })
→ kb_conform({ exempted: [{ queue_key, file_paths: [...], reason: "..." }] })
→ kb_conform({ promoted: [{ queue_key, originating_files: [...], note: "..." }] })
→ kb_conform({ dismissed: [{ queue_key, reason: "..." }] })
```

**Skip-prevention** is structural: MCP knows which (file, rule) triples it requested in Phase 1; if Phase 1.5 omits any, MCP returns `gaps[]` and refuses to advance the queue. The agent re-evaluates only the gaps — no rule is silently skipped.

**Resolutions:**
- **`applied`** — the code was fixed. Queue entry removed; logged as `RESOLVED · applied`.
- **`exempted`** — these specific files are justified exceptions. MCP appends a `{paths, reason}` entry to the rule's `exceptions[]` so future Phase 1 runs skip them deterministically (the exception filter sits between path-glob and min_lines in the cascade).
- **`promoted`** — *the code is right; the standard should change.* Recorded as senior-review intent in the audit log; the standard file is **not** modified automatically. Surfaced via `kb_inventory.pending_promotions` for a senior dev to review and act on manually with `kb_extract` + `kb_write`.
- **`dismissed`** — false positive. Logged as `DISMISSED-CONFORM` (distinct from `RESOLVED`) so dismissals stay visible as a separate signal.

#### Promotions ledger — suppression with an escape hatch

`promoted` needs more explanation than the others because it's the one resolution that doesn't end the conversation: the code is fine, but the standard hasn't been updated yet. To prevent the same `(file, rule)` pair from re-firing on every sweep until a senior reviewer acts, MCP records it in [`sync/standards-promotions.md`](knowledge/sync/standards-promotions.md) as a **suppression entry**. Phase 1 honors the ledger and skips suppressed pairs.

Suppression auto-clears in one of two ways:

- **Rule changes.** The promotion entry stores a fingerprint of the rule's enforcement-relevant fields (`description`, `severity`, the full `detect` config, `applies_to`, plus party paths for contracts). When a senior reviewer edits the rule, the fingerprint mismatches on the next sweep and the entry auto-closes — the rule re-evaluates against all originally-promoted files. A drift-log block lands so the change is auditable. The three auto-close `event_type` sub-discriminators are `AUTO-CLOSED-PROMOTION · rule changed`, `AUTO-CLOSED-PROMOTION · standard removed`, and (for queue entries not in the ledger) `AUTO-DISMISSED · standard removed`.
- **Reviewer decides not to change the rule.** They call `kb_conform({ closed_promotion: [{ queue_key, file_paths, reason }] })`. MCP removes the suppression and writes the file paths into the rule's `exceptions[]` — the same writeback path as `exempted` — so the files are permanently exempted instead of suppressed.

Run `kb_inventory` to see everything currently in the ledger under `pending_promotions`.

#### Aspirational retroactive sweeps

When you write or modify a standard via `kb_write`, MCP synchronously runs `kb_conform({ mode: "aspirational", scope: <standard-file> })` against the entire codebase scoped to the standard's `applies_to.paths`. Results land in `sync/standards-backlog.md` (separate from the current-diff queue). The sweep is included in the `kb_write` response under `aspirational_sweep`.

Backlog entries surface in `kb_get`'s `rules_in_scope` field with `advisory: true` — the next time someone edits an affected file, they see the entry as advisory backlog they may opt to fix as part of their natural change. No PR is blocked by aspirational entries; they're a "tech debt is queued" signal, not a gate.

**Chunking large sweeps with `path_filter`.** A new standard against a big codebase can produce hundreds of evaluations — too many to judge in one response. Pass `path_filter` to limit a sweep to a subtree:

```
kb_conform({
  mode: "aspirational",
  scope: "knowledge/standards/code/screen-routing.md",
  path_filter: "src/admin"            // or ["src/admin", "src/checkout"]
})
```

Bare directory inputs auto-expand to `<dir>/**`. The filter intersects with the standard's `applies_to.paths`; an empty intersection returns an error. Run a series of scoped sweeps (admin → customer → legacy) until coverage is done — the backlog accumulates across them naturally because queue writes upsert by `(standard_id.rule_id, file)`.

`path_filter` is aspirational-only. Current-mode sweeps always cover the full diff so baseline tracking stays consistent; trying to use it there returns an error.

Phase 1 also nudges you toward `path_filter` automatically: if an unscoped aspirational sweep returns more than 200 evaluations, the prompt prepends a one-line suggestion to abort and re-run with a filter.

#### Pre-write guidance — `working_paths`

Before writing code, pass the file paths you're about to edit to `kb_get` so applicable rules are auto-injected:

```
kb_get({
  keywords: ["orders"],
  working_paths: ["ms-fe-web/src/screens/orders/list.tsx"]
})
→ { files: [...],
    rules_in_scope: [
      { standard_id, rule_id, severity, applies_to, detect_hint, fix_hint, description, advisory: false },
      ...
    ] }
```

The cap (default `working_paths_cap: 10`) bounds token cost at guidance time. `kb_conform` detection is uncapped — a file may be flagged for a rule that wasn't surfaced at write-time. This is intentional: cheap pre-filters keep conform's cost bounded even across many rules.

#### Monorepo support — `app_root_patterns`

In a polyglot repo, `kb_get` and `kb_conform` infer a file's app from `_rules.md`:

```yaml
app_root_patterns:
  "ms-fe-web/**": ms-fe-web
  "ms-be-go/**":  ms-be-go
```

A file under `ms-fe-web/src/...` is automatically scoped to `ms-fe-web`, so only standards with `app_scope: ms-fe-web` (or `app_scope: all`, or contracts where the FE party includes `ms-fe-web`) are surfaced. Agents can override per-call with an explicit `app_scope` argument.

If `app_root_patterns` is unset, inference returns `null` silently and only `app_scope: all` standards match (conservative default).

#### Reading a standard

Standards are pure YAML. Editors render them with the JSON Schema (autocomplete, validation). For terminal reading, `cat knowledge/standards/code/<id>.md` is a flat file with all the rules. Tools that need the rules (lint, conform, get) read them from `knowledge/_index.yaml` — `kb_reindex` carries the `rules`, `kind`, `topic`, and `parties` frontmatter into per-file entries.

#### Bottom-up signal — `kb_inventory`

Senior developers run `kb_inventory` periodically to surface signal without auto-promoting anything:

```
→ kb_inventory({ lookback_months: 3 })
← {
    stale_rules: [...],         // rules whose applies_to.paths matches no source file
    uncovered_files: { files, count, truncated },  // source files matching no standard
    pending_promotions: [...],  // recent `promoted` events awaiting senior review
    summary: { standards_count, rules_count, source_files_scanned }
  }
```

Read-only — running it twice produces zero file changes. Outputs are deterministic; no heuristic shape detection in v1.

#### Operational note — single MCP per project

`kb_conform` (and `kb_drift`) inherit a single-writer-per-process assumption. Cross-branch concurrency is handled via `merge=union` in `.gitattributes`, but two MCP instances writing to the same project's queue files simultaneously can corrupt them via last-writer-wins on `fs.writeFileSync`. **Deploy one MCP per project.**

#### Migration from legacy `tech-stack` and `conventions` types

These two singleton types were removed. Their content folds into the new model:

| Legacy | New home |
|---|---|
| `standards/code/tech-stack.md` (inventory of what we use) | `foundation/<id>.md` — normal reference doc, no rules |
| `standards/code/conventions.md` (rules about naming, structure) | One or more `standards/code/<id>.md` documents with structured `rules:` arrays |

`kb_scaffold type: tech-stack` and `kb_scaffold type: conventions` now return a hint pointing at the new locations.

#### How standards trigger in normal usage

Standards interact with the development flow at four distinct moments. Two are automatic; two are developer-initiated.

**Automatic — no extra steps**

| Moment | What triggers it | What happens |
|---|---|---|
| Writing or updating a standard file | `kb_write` on any `knowledge/standards/**/*.md` | Aspirational sweep fires synchronously inside the same `kb_write` response. Failures land in `sync/standards-backlog.md`. No separate call needed. |
| Editing code | `kb_get({ working_paths: [...] })` (called by the agent before every code change, per CLAUDE.md) | Standards index is scanned; matching rules are injected into `rules_in_scope[]`. Backlog entries for those paths surface as `advisory: true` items. |

**Developer-initiated**

| Moment | What to do | Why |
|---|---|---|
| Before opening a PR | Run the three-phase `kb_conform` loop (detect → judge → resolve) | Enforcement gate — catches violations in the diff before review. Not run by hooks so PRs aren't blocked by noise. |
| Periodic coverage health check | `kb_inventory({ lookback_months: 3 })` | Read-only report: stale rules, uncovered source files, pending promotions. Senior dev reviews and decides whether to extend or create standards. |

**The full lifecycle in one sequence**

```
1. Standard authored
   kb_scaffold / kb_extract → kb_write
   → aspirational sweep auto-fires → sync/standards-backlog.md populated

2. Developer edits a file
   kb_get({ keywords: [...], working_paths: ["src/..."] })
   → rules_in_scope[] injected automatically (active rules + advisory backlog)
   → developer writes code aware of the constraints

3. Before opening PR                              ← developer triggers
   kb_conform() → submit_judgments → resolve
   → sync/standards-drift.md updated; violations fixed/exempted/promoted/dismissed

4. Periodic senior review                         ← senior dev triggers
   kb_inventory() → stale_rules / uncovered_files / pending_promotions
   → decides to write or update standards via kb_extract + kb_write
```

The key design decision: the system **surfaces** constraints automatically at write-time and opportunistically surfaces backlog items, but the **enforcement gate** (`kb_conform`) is always a deliberate act.

---

### 9. Improving KB search quality after import

After importing documents or creating KB files in bulk, tags are often empty — `kb_ask` falls back to weak path-matching. Run the two enrichment tools to fix this.

```
"Tag all KB files automatically"
→ kb_autotag()
→ Returns: { tagged: 40, tags_added: 333, sample: { "features/auth.md": ["auth", "jwt", ...] } }

"Discover missing depends_on relations"
→ kb_autorelate({ dry_run: true })
→ Returns proposals: [{ source: "features/checkout.md", target: "features/auth.md", score: 0.64, shared_terms: [...] }]

"Looks good, apply them"
→ kb_autorelate()
→ Writes depends_on links to frontmatter, reindexes

Now kb_ask finds files reliably:
→ kb_ask({ question: "how does authentication work?" })
→ context_files: ["features/auth.md", "flows/auth-flow.md", "validation/auth-rules.md"]
```

Both tools are safe to re-run — `kb_autotag` merges with existing tags, `kb_autorelate` skips already-present relations and prevents cycles.

> **Future improvement — content_keywords in index (Level 2)**
>
> Currently the `kb_get` scorer matches keywords against metadata only (path, id, type, tags, depends_on) — not file body content. Tags bridge this gap, but if files lack tags they become invisible to keyword search. A future enhancement could extract content keywords during `kb_reindex` and store them as a `content_keywords` field in `_index.yaml` (not in the source file). The scorer would then search both `tags` and `content_keywords`, making files discoverable even with empty tags. This is pure Node.js (no LLM cost), adds ~1ms per file to reindex, and requires no source file writes. See `lib/tag-extract.js` for the extraction logic that could be reused.

---

### 10. Working with database schemas (DBML)

Schema files use dbdiagram.io DBML syntax — one file per database, multiple tables per file. `kb_schema` extracts individual tables so the agent only loads what's relevant.

```
# List all tables in the postgres schema
→ kb_schema({ command: "list", file: "postgres" })
→ { tables: ["users", "orders", "products", "payments"], enums: ["order_status"], refs_count: 4 }

# Extract specific tables
→ kb_schema({ command: "query", file: "postgres", entities: ["users", "orders"] })
→ Returns only users and orders Table blocks + related Ref: lines

# Keyword-based extraction
→ kb_schema({ command: "query", file: "postgres", keywords: ["payment", "billing"] })
→ Returns tables mentioning payment/billing, scored by relevance
```

When `kb_get` loads a schema file during keyword search, it automatically filters to relevant tables — the full file is never sent to the agent unless all tables match.

---

### 11. Setting up agent instructions

`kb_init` generates `CLAUDE.md`, `.cursorrules`, and `.windsurfrules` automatically. To regenerate them (e.g. after updating the template):

```
"Regenerate agent rule files"
→ kb_init({ regenerate_agent_rules: true, force: true })
→ Returns: { files_written: ["CLAUDE.md", ".cursorrules", ".windsurfrules"] }
```

Without `force: true`, existing files with content are not overwritten — your customizations are preserved.

---

### 12. Catching cross-branch semantic conflicts after a merge

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

### 13. PM tool integration (Jira, GitHub Issues, Linear)

The KB bridges the gap between knowledge and project management tools through a middleware layer. No direct PM tool API calls — staging files in `sync/inbound/` and `sync/outbound/` act as the interface. External adapter scripts handle actual API sync.

**Consult KB before filing an issue:**
```
PM: "I want to file a bug about login failing with expired tokens"

→ kb_issue({ command: "consult",
             title: "Login fails with expired token",
             body: "Users get 500 error instead of redirect..." })
  → Returns related KB docs (features/auth.md, flows/login.md)
  → Agent advises: "This relates to the session handling flow, step 4.
     The KB notes 24h token expiry. Suggest labels: auth, session.
     Priority: high (affects all users with expired tokens)."
```

**Triage an existing Jira bug:**
```
→ kb_issue({ command: "triage",
             title: "Cart total wrong", body: "...",
             issue_id: "PROJ-123", source: "jira",
             labels: ["bug", "cart"], priority: "high" })
  → Phase 1: returns related KB docs + triage prompt
  → Agent fills triage report (summary, root cause hypothesis, suggested KB updates)

→ kb_issue({ command: "triage", ..., content: "<filled triage report>" })
  → Writes to knowledge/sync/inbound/PROJ-123.md
  → Agent can then apply suggested updates to feature/flow docs via kb_write
```

**Generate work items from KB features:**
```
→ kb_issue({ command: "plan",
             type: "feature", keywords: ["cart"],
             target: "jira", project_key: "CART" })
  → Phase 1: gathers cart-related KB docs, returns planning prompt
  → Agent breaks features into stories with acceptance criteria

→ kb_issue({ command: "plan", ..., content: "<YAML task breakdown>" })
  → Writes to knowledge/sync/outbound/2026-03-28-feature.yaml
  → Adapter script picks up YAML and creates Jira tickets
```

**Staging file flow:**
```
PM Tool (Jira, Linear, GitHub Issues)
    ↕  adapter scripts (outside MCP)
Staging files (knowledge/sync/inbound/, sync/outbound/)
    ↕  kb_issue (triage, plan)
KB documents (knowledge/features/, flows/, standards/)
```

---

## Drift diagnostics — surfacing silent failures

Six features that turn previously-invisible drift problems into machine-readable signals. The shape is consistent: kb-mcp never tries to auto-fix anything — it just exposes the problem in a field an agent or human can act on (`pattern_audit.findings`, `mapping_status`, `orphan_dependencies`, `AUTO-CLOSED-PATTERN-CHANGED`).

### 1. Fan-out (P0)

**What it does.** When one code file matches multiple `code_path_patterns` entries with different `kb_targets`, `kb_drift` creates a separate drift entry per `kb_target`.

**Why it matters.** Before this, a file like `AuthForm.tsx` matching both a "form" pattern (→ `validation.md`) and an "auth" pattern (→ `authentication.md`) would produce a single drift entry — half the KB context got lost. Fan-out ensures both KB docs get flagged when that file changes.

**Key signal:** `_state.codeEntries` has one entry per `kbTarget`, each with its own fingerprint.

```
                     _rules.md
      ┌──────────────────────────────────────┐
      │ - intent: form                       │
      │   kb_target: validation/common.md    │  ← pattern A
      │   paths: [src/**Form.tsx]            │
      │                                      │
      │ - intent: auth                       │
      │   kb_target: features/auth.md        │  ← pattern B
      │   paths: [src/auth/**]               │
      └──────────────────────────────────────┘
                        │
      edit ───►  src/auth/LoginForm.tsx  (matches BOTH)
                        │
                        ▼
      ┌──────────────────────────────────────┐
      │            code-drift.md             │
      │                                      │
      │  ## validation/common.md             │  entry 1
      │     - src/auth/LoginForm.tsx         │  fingerprint X
      │                                      │
      │  ## features/auth.md                 │  entry 2
      │     - src/auth/LoginForm.tsx         │  fingerprint Y
      └──────────────────────────────────────┘

BEFORE: only one entry → second KB doc silently missed
AFTER:  one entry per kb_target → both KB docs flagged
```

### 2. Scaffold mapping check (P1)

**What it does.** When you scaffold a new KB file in a folder that no `code_path_patterns` entry maps to, the response includes `mapping_status: "unmapped"` plus a `suggested_pattern` stub and an instruction telling you to add the pattern to `_rules.md`.

**Why it matters.** New KB docs that aren't reachable via patterns are invisible to drift detection — they silently rot. This flow makes the gap loud at creation time instead of months later.

```
  kb_scaffold({type:"decision", id:"x"})
              │
              ▼
  ┌────────────────────────────────────┐
  │  decisions/x.md  ← created         │
  └────────────────────────────────────┘
              │
              ▼  is there a pattern targeting decisions/?
              │
        ┌─────┴─────┐
        │           │
       YES          NO
        │           │
        ▼           ▼
   mapping_     mapping_status: "unmapped"
   status:      suggested_pattern: {
   "mapped"       intent: null,
                  kb_target: "decisions/{name}.md",
                  paths: []
                }
                _mapping_instruction:
                 "Add this to _rules.md →
                  code_path_patterns…"
```

### 3. Pattern audit (P1)

**What it does.** `kb_drift` ships a `pattern_audit.findings[]` array that flags broken `_rules.md` patterns up front:

- **`orphan_pattern`** — pattern's `paths` glob matches zero real files (typo, deleted directory, dead module).
- **`ghost_target`** — pattern's `kb_target` points at a KB file that doesn't exist.
- **`multi_target_files`** — the fan-out twin: tells you which files are being fanned out to multiple targets (useful when one is intentional, the other is a mistake).
- **`convention_violation`** — pattern's `kb_target` is in the "wrong" folder per project convention (e.g. `standards/code/tech-stack.md` should live in `foundation/`).
- **`unmapped_kb_group`** — KB folders that have files but no patterns pointing to them (drift can't track their code).

**Why it matters.** This is the diagnostic layer for `_rules.md` itself. Without it, broken patterns fail silently.

```
                _rules.md  ──►  kb_drift({readonly:true})
                                        │
                                        ▼
                            pattern_audit.findings[]
                            ┌─────────────────────────┐
                            │                         │
            ┌───────────────┼─────────┬───────────┬───┴──────────┐
            ▼               ▼         ▼           ▼              ▼
     orphan_pattern   ghost_target  multi_   convention_   unmapped_
     (paths match     (kb_target    target_  violation     kb_group
      no files)        missing)     files    (wrong        (folder has
                                    (fan-out  folder)       files but
                                     map)                   no patterns)

     paths:           kb_target:    file:    kb_target:    folder:
      src/dead/**      foo.md       Auth     standards/    decisions/
                       ⚠            Form     code/tech-    count: 4
                       doesn't       ↓        stack.md     no patterns
                       exist        2 kb     should be
                                    targets  foundation/
```

### 4. UI mapping diagnostics (P1/P2)

The same `pattern_audit.findings` get rendered as a "Mapping Diagnostics" card in the extension panel with a per-finding **Copy fix prompt** button — paste it into a chat and the agent has everything it needs to fix the rule.

```
  ┌─ kb-mcp panel ────────────────────────────────┐
  │                                                │
  │  📋 Mapping Diagnostics              [  7  ]   │  ← count badge
  │  ─────────────────────────────────────────     │
  │  ▼ orphan_pattern · validation/common.md       │  ← expand
  │      paths: src/dead/**                        │
  │      [ Copy fix prompt ]   ←─ clipboard        │
  │                                                │
  │  ▶ ghost_target · features/missing.md          │  ← collapsed
  │  ▶ multi_target · AuthForm.tsx                 │
  │  ▶ convention · standards/code/...             │
  │                                                │
  └────────────────────────────────────────────────┘

  Copy-fix-prompt clipboard payload:
  ┌────────────────────────────────────────────────┐
  │ The knowledge/_rules.md → code_path_patterns   │
  │ audit surfaced this finding:                   │
  │ {finding JSON…}                                │
  │ Please propose a fix…                          │
  └────────────────────────────────────────────────┘
```

### 5. Fingerprint stability vs invalidation (P3)

**What it does.** Each drift queue entry carries a fingerprint computed from the pattern's semantic shape (intent, `kb_target`, and the sorted set of `paths`).

- **Cosmetic edits** (reordering paths, whitespace) → fingerprint unchanged → queue entries survive untouched.
- **Semantic edits** (renaming `kb_target`, adding/removing a path) → fingerprint changes → kb-mcp auto-closes the stale entry and logs `AUTO-CLOSED-PATTERN-CHANGED` in the monthly drift log with old + new fingerprints.

**Why it matters.** Without fingerprinting, any edit to `_rules.md` either churned the queue (every entry re-created) or left stale entries pointing at patterns that no longer exist. Now the queue tracks intent, not source-text shape.

```
  Pattern in _rules.md:
  ┌──────────────────────────────┐
  │ intent: validation           │
  │ kb_target: validation/x.md   │ ──► fingerprint = sha256(intent + target + SORTED paths)
  │ paths: [a.java, b.java]      │     = de538367...
  └──────────────────────────────┘

  ──── COSMETIC EDIT (reorder paths) ─────────────────────────
        paths: [b.java, a.java]   ← same set, different order
                       │
                       ▼ sort → [a.java, b.java]  same hash
                fingerprint = de538367...  UNCHANGED
                       │
                       ▼
        ╔═══════════════════════════╗
        ║  queue entry: UNTOUCHED   ║   no churn
        ║  drift-log: NO event      ║
        ╚═══════════════════════════╝

  ──── SEMANTIC EDIT (rename kb_target) ──────────────────────
        kb_target: validation/x-v2.md   ← actually different
                       │
                       ▼ fingerprint = a91f2c...  CHANGED
                       │
                       ▼
        ╔═══════════════════════════════════════════════╗
        ║  queue entry: AUTO-CLOSED                     ║
        ║  drift-log/2026-05.md:                        ║
        ║   ## AUTO-CLOSED-PATTERN-CHANGED              ║
        ║   Queue key: validation/x.md                  ║
        ║   Old fingerprint: de538367...                ║
        ║   New fingerprint: (pattern removed)          ║
        ║   Reason: pattern removed from _rules.md      ║
        ╚═══════════════════════════════════════════════╝
```

### 6. Orphan depends_on detection (P3)

**What it does.** When `kb_write` reindexes, it walks every file's `depends_on:` frontmatter and writes a top-level `orphan_dependencies:` array in `_index.yaml` for any reference that points at a non-existent KB file.

**Why it matters.** `[[wikilinks]]` and `depends_on:` are how KB files cross-reference each other. Broken refs used to fail silently — now `_index.yaml` has an explicit punch list.

```
   features/buffer-definitions.md
   ┌──────────────────────────────────────┐
   │ ---                                  │
   │ depends_on:                          │
   │   - line-definitions       ◄─ exists │
   │   - features/missing-file  ◄─ ghost! │
   │ ---                                  │
   └──────────────────────────────────────┘
                    │
                    ▼  kb_write → reindex
                    │  (walks every file's depends_on)
                    ▼
   knowledge/_index.yaml
   ┌──────────────────────────────────────┐
   │ orphan_dependencies:                 │
   │   - source: features/buffer-def...   │
   │     missing_dep: features/missing... │
   │   - source: …                        │
   │     missing_dep: …                   │
   │                                      │
   │ files: …                             │
   └──────────────────────────────────────┘
                    │
                    ▼
            agent/human sees the list
            and fixes refs or creates files
```

### The unifying picture

All six features are diagnostics that surface previously-silent failures in `_rules.md` and KB cross-references.

```
              ┌─────────────────────────────────────┐
              │      kb-mcp diagnostic surface       │
              └─────────────────┬───────────────────┘
                                │
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
 _rules.md issues       KB file issues          Cross-ref issues
 (patterns)             (mapping)               (depends_on)
      │                         │                         │
      ▼                         ▼                         ▼
 pattern_audit         mapping_status          orphan_dependencies
 .findings[]           in kb_scaffold          in _index.yaml
      │                         │                         │
      ▼                         ▼                         ▼
      Surface the problem in a machine-readable field.
      Never auto-fix. Let agent or human decide.
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
| `sync/drift-log/YYYY-MM.md` | `kb_drift` + `kb_conform` Phase 2 — append-only audit trail, split by month |
| `sync/standards-promotions.md` | `kb_conform` Phase 2 (`promoted` writes; `closed_promotion` and fingerprint-mismatch auto-close remove) — suppression ledger for promoted (file, rule) pairs |
| `sync/standards-backlog.md` | `kb_conform` aspirational sweeps (auto-fires on standards `kb_write`) — advisory entries surfaced via `kb_get` |
| `sync/.conform-pending/<mode>.json` | `kb_conform` Phase 1 → 1.5 handoff cache (transient; cleared on successful `submit_judgments`) |

The pre-commit hook warns if any of these are staged. `_index.yaml` has a `# AUTO-GENERATED` header that the pre-commit linter ([`scripts/lint-standalone.js`](knowledge/_mcp/scripts/lint-standalone.js)) checks for.

### Tier 2 — Humans directly, no agent needed

| File | Purpose |
|------|---------|
| `_rules.md` | Project config — depth policy, code path patterns, secrets, `token_budget` |
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
| `sync/inbound/*.md` | `kb_issue` (command=triage) | Review triage reports, apply suggested KB updates |
| `sync/outbound/*.yaml` | `kb_issue` (command=plan) | Review task breakdowns, push to PM tool via adapter script |

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

### kb_sub — submodule coordination

`kb_sub` ensures submodules are pushed before the parent in the correct order:

```
# Show status of all submodules
kb_sub({ command: "status" })
→ { parent: { branch: "feature/auth" }, submodules: [
    { name: "backend", type: "owned", branch: "feature/auth", pointer_changed: true },
    { name: "client-sdk", type: "shared", branch: "main", pointer_changed: false }
  ] }

# Preview what would be pushed (no side effects)
kb_sub({ command: "push", dry_run: true })

# Push submodules first, then parent
kb_sub({ command: "push" })

# Get correct merge sequence for merging feature branch to main
kb_sub({ command: "merge_plan", target_branch: "main" })
```

Push behavior:
- **Owned submodules** are pushed to the parent's branch name (`-u origin feature/auth`)
- **Shared submodules** are pushed to their own current branch (`-u origin main`)
- If any submodule push fails, the parent push is skipped
- The parent is pushed last

A standalone shell script (`knowledge/_mcp/scripts/kb-feature.sh`) is also available for CI pipelines and terminal use outside MCP.

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
type: integration
aliases: [Stripe, Stripe Payments]
cssclasses: [kb-integration]
app_scope: web
owner: payments-team
created: 2026-03-20
---

## Description
...
See [[features/checkout]] for the checkout flow.
Uses [[integrations/stripe]] for payment processing.
![[assets/design/stripe-flow.png]]

## Business rules
...

> [!caution] Rate limits
> Requests per second: 100
> Retry strategy: exponential_backoff

## Changelog
2026-03-20 — created
```

Cross-references use Obsidian-compatible `[[wikilinks]]` in content. These are automatically extracted during `kb_reindex` and stored as `depends_on` in `_index.yaml`, which `kb_impact` uses for blast-radius analysis.

Supported wikilink formats:
- Whole file: `[[schema/user]]`
- Specific section: `[[data/schema/postgres#users]]` — the `#section` part is preserved in `depends_on` entries, enabling table-level cross-references for schema files
- With display text: `[[data/schema/postgres#users|Users Table]]`
- Embedded file: `![[assets/design/flow.png]]`

### Obsidian vault compatibility

The `knowledge/` folder is designed to open directly as an Obsidian vault. All generated templates include:

- **`type`** — document type (`feature`, `flow`, `schema`, `validation`, `integration`, `decision`, `standard`, `ui`, `data`, `group`). Stored in `_index.yaml` and used for keyword-based scoring in `kb_get` / `kb_impact`. Files without an explicit `type` field have it inferred from their folder path by `inferType()` during reindex.
- **`aliases`** — Obsidian quick-switcher (Cmd+O) and link-autocomplete aliases. Each template seeds a sensible default (`id` or a readable label).
- **`cssclasses`** — per-type CSS class for theming (`kb-feature`, `kb-flow`, `kb-schema`, `kb-validation`, `kb-integration`, `kb-decision`, `kb-standard`, `kb-ui`, `kb-data`, `kb-group`). Add a `.obsidian/snippets/kb.css` to activate visual differentiation in the graph view.
- **Callouts** — edge cases, guards, and open questions use Obsidian callout syntax (`> [!warning]`, `> [!important]`, `> [!question]`, `> [!info]`, `> [!caution]`) so they render as styled blocks rather than plain bullet lists.
- **Folder notes** — group files are named after their parent folder (`features/billing/billing.md` instead of `features/billing/_group.md`), matching the Obsidian Folder Notes plugin convention. Legacy `_group.md` files are still detected for backward compatibility.

---

## Requirements

- Node.js 18+
- Git repository
- MCP-compatible agent (Claude Code, Cursor, etc.)
- Windows: Git for Windows (provides sh.exe, awk, sed, grep used by git hooks)
