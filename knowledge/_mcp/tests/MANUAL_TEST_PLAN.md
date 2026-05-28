# KB-MCP Manual Test Plan

> End-to-end user-driven runbook for KB-MCP **v1.1.1** with `Instrumentality` VS Code extension **v0.3.0** and Obsidian plugin **v0.2.0**. Covers all 22 MCP tools, MCP-installed git hooks, lint and drift workflows, **and** the full extension UI for both hosts. Two complete scenarios; both extensions are intentionally near-identical, so the UI walkthrough is shared and divergences are noted inline.
>
> Companion to [TEST_PROMPTS.md](TEST_PROMPTS.md) (stack-detection / agent-only prompts) and [TEST_CASES.md](TEST_CASES.md) (unit-level cases).

## Where this plan runs

This plan is designed to run against **any project that consumes kb-mcp**. The kb-mcp source code is **not required** — your project only needs:

- a working MCP client (Claude Code, Cursor, Claude Desktop, etc.) with kb-mcp v1.1.1 configured
- the VS Code extension v0.3.0 and the Obsidian plugin v0.2.0 installed (one or both)
- for Scenario A: a project that already has `knowledge/_rules.md`
- for Scenario B: an empty directory plus `node`, `npm`, `go` on `PATH`

All file paths the runbook touches at runtime are **inside the target project**. Cross-reference links pointing to `packages/...` or `knowledge/_mcp/lib/...` are **informational pointers to kb-mcp source** for readers who happen to have it; the plan never depends on those paths existing.

If you're a kb-mcp developer testing local changes, see **Appendix A** for the rebuild-from-source workflow.

## How to use this document

1. **Copy this single file** into your target project (any path is fine — repo root, `docs/`, `tests/`, etc.). The agent will be told where to read it.
2. Do §0 once (lightweight version check).
3. Pick the scenario that matches the target project:
   - `knowledge/_rules.md` exists → **Scenario A** (existing project).
   - Empty directory → **Scenario B** (fresh project, bootstraps from zero).
4. Open the matching prompt in §5, replace `<PLAN_FILE>` with the path you placed this file at, and paste the whole block into Claude Code / Cursor.

### CONFIRM gates

When you see **🛑 CONFIRM** the agent (or human runner) stops and waits for you to verify what both extensions show. Reply `ok` / `next` to continue or `fail: <note>` to flag a regression. Read-only operations are flagged `FYI:` and do not stop.

A gate fires whenever the agent's action should change extension state:

- writes to `knowledge/sync/*.md`
- writes to `knowledge/_index.yaml` (every `kb_write`)
- KB file create/edit/delete
- git HEAD change (commit, checkout, merge, branch switch)
- submodule state change
- `_rules.md` change
- settings toggle that changes runtime behaviour
- first interaction with a lazy-loaded disclosure (Show diff, Show prompt, Capabilities panel)

---

## §0 — Pre-flight: Version Check

Run once before any scenario. No source code or rebuild required.

1. **MCP version:** in your MCP client, confirm the connected `kb-mcp` server reports **v1.1.1**. If your client doesn't surface server version, run `kb_status` from the agent and read the `server_version` field if present, or check the package manifest of your kb-mcp install (`npm ls -g kb-mcp` or wherever your client launches it).
2. **VS Code extension version:** Extensions pane → Instrumentality → confirm **v0.3.0**.
3. **Obsidian plugin version:** Settings → Community plugins → Instrumentality → confirm **v0.2.0**.
4. **Git sanity** (if running Scenario A): `git rev-parse --short HEAD` succeeds; `git status` is clean or you have a throwaway branch.
5. **Scenario B prerequisites:** `node --version`, `npm --version`, `go version` on `PATH`.

🛑 **CONFIRM 0** — Both extension panels open and show the expected versions; `kb_status` returns a HEAD short SHA matching `git rev-parse --short HEAD` (Scenario A) or is ready to bootstrap (Scenario B).

> Rebuilding kb-mcp / extensions from source is **not part of §0** — see **Appendix A** if you're testing local changes to kb-mcp itself.

---

## §1 — Extension UI Reference (shared across both extensions)

Extensions render the same data using the same shared prompt generators (kb-mcp source path `packages/shared/src/prompts/` — informational only, not required to run this plan). The walkthrough is shared; the only differences are listed in §1.3.

### §1.1 Layout & elements

1. **Open the panel.** VS Code: activity-bar Instrumentality icon. Obsidian: ribbon Instrumentality icon. Both open a panel titled "Instrumentality".
2. **Header:** title · `HEAD: <short-sha>` · hooks badge (`managed` / `partial` / `missing`) · Refresh. VS Code adds "Rerun Phase 1" and "Open Ledger". Obsidian adds "Publish" and "?" toggle.
3. **Pipeline strip:** `drift → conform → promotion → lint` counts (dim at zero).
4. **Tabs:** `Pending` (default), `Activity`. Obsidian additionally has `Info` (mirror of VS Code Capabilities panel).
5. **Filter bar — Pending:** search · severity chips `error/warn/info` · group-by `Section / File / Standard / Lifecycle` · Clear.
6. **Filter bar — Activity:** group-by `Date / Queue key / Event type` · "Show system events" toggle.
7. **Section accordion** (one open at a time): Code Drift · KB Drift · Standards Drift · Standards Backlog · Conform Pending · Promotions · Lint · Mapping Diagnostics · Submodules (pinned).
8. **Bucket headers inside Drift sections:** "Uncommitted preview" vs "Published" — keyed on queue-file persistence, not git-commit state:
   - **Uncommitted preview**: drift detected by the live-compute overlay (`kb_drift({readonly: true, includeWorkingTree: true})`) but NOT yet persisted to `knowledge/sync/code-drift.md` or `knowledge/sync/kb-drift.md`.
   - **Published**: an entry exists in the queue file (regardless of whether the queue file itself is committed to git).
   - A plain `git commit` of a KB or code file does NOT transition a preview entry to Published. Only `kb_drift` Phase 1 in write mode — invoked explicitly, by the pre-push hook on a protected branch, or by the Publish action — writes to the queue file and creates the transition.
9. **Entry row:** title + badges (`shared`, `preview`, `missing`, `stale`, `acknowledged`) + meta + chevron.
10. **Expanded entry:** detail, code files list with author badges, sync/branch info for submodule entries, **Show diff** disclosure, **Show prompt** disclosure.
11. **Education banner** + "Got it" + header "?" re-show.

### §1.2 Entry actions

| Entry kind | Buttons |
|---|---|
| Code Drift (target exists) | Copy Prompt · Open Source · Acknowledge… |
| Code Drift (target missing) | Copy Prompt · **Scaffold KB doc** · Acknowledge… |
| KB Drift | Copy Prompt · Open Source · Acknowledge… |
| Standards Drift | Copy Prompt · Open Standard · Edit Rule · **Refine with Agent** · Apply · Exempt… · Promote… · Dismiss… · Acknowledge… |
| Standards Backlog | Copy Prompt · Open Standard · Apply · Exempt… · Dismiss… |
| Conform Pending | Copy Prompt · Open Standard |
| Promotion | Copy Prompt · Open Standard · Close promotion |
| Lint | Copy Prompt · Open Source |
| Mapping Diagnostic | Copy audit fix prompt |
| Submodule | Sync (both) · Push (VS Code only) |

**Verdict form fields:** file checkboxes (where applicable) · Reason (required) · Note (optional) · Send to agent (disabled until valid) · Cancel.

### §1.3 Settings, commands, divergences

**VS Code-only**
- Status bar `KB: N` with tooltip; click → Dashboard.
- Commands: `instrumentality.refresh / openDashboard / openCapabilities / publishDrift`.
- Capabilities panel — tool cards grouped Sync / Authoring / Governance / Introspection with copy buttons on example prompts and MCP config snippets.
- Settings: `instrumentality.agent.backend` (`clipboard / terminal / command`), `agent.commandId`, `notifications.enabled`, `refreshIntervalSeconds`, `lint.command`.
- Lint diagnostics in the Problems pane.

**Obsidian-only**
- Ribbon icon, vault file-event subscription, Info tab, clipboard-only delivery, "Publish" button in header.

### §1.4 Prompt catalog

Sources (kb-mcp source paths — informational): `packages/shared/src/prompts/` and `packages/shared/src/prompts/verdicts/`.

- `code-drift` (target exists) → `kb_drift summaries`
- `code-drift` (target missing) → `kb_scaffold`
- `kb-drift` → `kb_drift summaries`
- `standards-drift` → `kb_conform` fix
- `standards-backlog` → `kb_conform` aspirational resolve
- `promotion` → `kb_conform promoted`
- `conform-pending` → `kb_conform` resolve
- `lint` → fix prompt
- `standard-author refine` → `kb_write` on `standards/`
- **kb_conform verdicts:** `applied · exempted · promoted · dismissed · acknowledged · closed_promotion`
- **kb_drift Phase 2 verdicts:** `summaries · reverted · kb_confirmed · dismissed`

---

## §2 — Scenario A: Existing project (this repo)

**Pre-condition:** clean working tree on a non-master branch (e.g. a throwaway `__test/extension-plan`); §0 done; both extensions open on this repo.

🛑 **CONFIRM A.0** — Pre-flight done; clean tree; both panels open; baseline state captured.

### §A.1 Sanity (read-only)

- `FYI:` agent calls `kb_status` and asserts the response contains all of: `currentHeadShort`, `hooks.health` (one of `managed/partial/missing`), `codeDrift.entries[]`, `kbDrift.entries[]`, `standardsDrift.entries[]`, `conformPending.{current,aspirational}`, `promotions[]`, `lint.violations[]`, `lint.ran`, `totals.{lintErrors,lintWarnings,drifts,conformPending,promotions,grand}`, `patternAudit`.
  - **Note:** `patternAudit` is `null` unless the caller passed `live: true` (extensions do this automatically via the live-status runner) or `kb_drift` has populated the on-disk queue since the last commit. Both behaviors are expected — `kb_status` is a queue-state aggregator, not a live drift detector. To see fresh mapping diagnostics from a standalone `kb_status` call, run `kb_drift` first or have the watcher fire.
- `FYI:` `kb_inventory` returns `stale_rules`, `uncovered_files`, `pending_promotions`.
- `FYI:` `kb_get({ keywords: ["drift"], working_paths: ["<PICK_A_TARGET>"] })` — `<PICK_A_TARGET>` is a **file path** that matches the `applies_to.paths` of at least one standard's rule (not just a `code_path_patterns` glob target). Open `knowledge/_index.yaml` and find a rule's `applies_to.paths`; pick any file under one of those globs. Assert `rules_in_scope` is a non-empty array. (Passing a *directory* that's only covered by a `code_path_patterns` glob — e.g. `**/controller/**` — typically returns `[]`; `rules_in_scope` matches rule-level `applies_to`, not pattern coverage.)
- `FYI:` `kb_get({ keywords: ["glossary"] })` — if `knowledge/glossary.md` exists, assert it is returned; otherwise assert the response is non-empty (typically `global.md`). The glossary is optional.
- `FYI:` `kb_get({ keywords: ["agent"] })` — if `knowledge/agent-rules.md` or repo-root `CLAUDE.md` exist, assert they are returned where applicable. Both are optional. `CLAUDE.md` lives at repo root, structurally outside `kb_get`'s `knowledge/` scope — for repos that keep it there it WILL NOT appear in `kb_get` output even though agents read it directly.

### §A.2 MCP tool coverage

For each row: agent prints the call and the (truncated) response. CONFIRM only on disk writes.

| # | Tool | Action | CONFIRM? |
|---|---|---|---|
| 1 | `kb_get` | covered in §A.1 | no |
| 2 | `kb_status` | covered in §A.1 (shape asserted) | no |
| 3 | `kb_inventory` | covered in §A.1 | no |
| 4 | `kb_history` | one KB file — assert response contains **both** git commits **and** drift-log entries from `drift-log/YYYY-MM.md` | no |
| 5 | `kb_schema` | query one DBML table from `knowledge/data/schema/` | no |
| 6 | `kb_ask` | `query`, `brainstorm`, `challenge`, `onboard`, `generate` intents | no |
| 7 | `kb_ask sync` | resolve one drift entry via sync intent | **CONFIRM** |
| 8 | `kb_impact` | impact of one KB file | no |
| 9 | `kb_analyze` | analyze any source-code subtree of your project (e.g. `src/` or `backend/`) | no |
| 10 | `kb_extract` P1 | phase 1 prompt only — also exercise the `paths` filter | no |
| 11 | `kb_extract` P2 | phase 2 write to a scratch `standards/code/__test-extract.md` | **CONFIRM** |
| 12 | `kb_scaffold` | create `specs/features/__test-only.md` | **CONFIRM** |
| 13 | `kb_write` | edit the file from #12 | **CONFIRM** |
| 14 | `kb_autotag fast` | regex mode on scratch file (no write) | no |
| 15 | `kb_autotag review` | LLM-validated candidates returned (no write) | no |
| 16 | `kb_autotag apply` | write tags to scratch file | **CONFIRM** |
| 17 | `kb_autorelate` dry_run | proposals returned | no |
| 18 | `kb_autorelate` apply | write proposed relations to scratch file | **CONFIRM** |
| 19 | `kb_export` outside | phase 2 write to `/tmp/kb-export.md` | no |
| 20 | `kb_export` to KB | phase 2 write inside `knowledge/` (then revert) | **CONFIRM** |
| 21 | Intentional code edit | append a comment line to **any code file matching a pattern in your `_rules.md`** (call this `<TARGET_CODE>`); commit | **CONFIRM** (code-drift entry appears) |
| 22 | Intentional KB edit | append a sentence to **any KB file under `knowledge/specs/`** (call this `<TARGET_KB>`); commit | **CONFIRM** (kb-drift entry appears) |
| 23 | `kb_drift` P1 | explicit run | no (reads only) |
| 24 | `kb_conform` P1 | current mode | **CONFIRM** (standards-drift may refresh) |
| 25 | `kb_conform` P1.5+P2 | submit judgments + Apply one entry | **CONFIRM** |
| 26 | `kb_sub status` | empty if no submodules | no |
| 27 | `kb_upgrade` | expect no-op on current version | **CONFIRM** if writes occur |

(`kb_issue consult` and `kb_init` idempotency are covered in §B.6 and §B.1.3 respectively — not duplicated here.)

> **Submodule note for rows 21–23:** If `<TARGET_CODE>` lives inside a git submodule, `kb_drift` in write mode (the publish path) only surfaces the change at the parent level once you also bump the parent's submodule pointer (i.e. commit the parent so `git submodule status` reports a new SHA for that path). The extensions' live overlay uses `kb_drift({readonly: true, includeWorkingTree: true})` and **will** show the in-submodule edit even when the pointer hasn't moved — so the panel may show a code-drift entry that an explicit `kb_drift` Phase 1 call does not. This is expected; pick a non-submodule `<TARGET_CODE>` if you want the published-queue path to also surface the change.

### §A.3 Git hooks lifecycle (all four hooks)

1. **Hooks exist:** verify `.git/hooks/{pre-commit,pre-push,post-merge,post-checkout}` each contain `# kb-mcp managed`. Header badge `managed`.

2. **pre-commit:** stage a KB file with malformed frontmatter (delete a required field) → `git commit` → observe hook output. The pre-commit hook is primarily a reindex/lint trigger — it may emit warnings rather than blocking outright.
   🛑 **CONFIRM A.3.1** — hook fired (observable in commit stdout); whatever the policy is (block / warn / silent reindex), note actual behaviour; if commit succeeded, fix frontmatter and re-commit so the working tree is clean before §A.3.3.

3. **pre-push:** make a tracked code change without KB update → commit → push to a sandbox branch (or `git push --dry-run` if the hook supports it).
   🛑 **CONFIRM A.3.2** — pre-push runs `kb_drift` P1, writes to `sync/code-drift.md`, auto-commits `chore(kb): update drift queue`; new entry visible in both extensions; HEAD short SHA updated in header.

   > **Preconditions for the full auto-commit chain:**
   > 1. **Protected branch only.** The auto-commit step (writing to `sync/*.md` then committing `chore(kb): update drift queue`) fires only on protected branches (defaults to `main` / `master`). On feature branches, pre-push runs `kb_drift` in **readonly** mode — no filesystem writes, no auto-commit. If your sandbox branch isn't protected, expect detection output without the queue write.
   > 2. **Submodule branch alignment.** If your repo has submodules that don't follow the parent branch, pre-push's submodule branch guard runs FIRST and may block the push with "Submodule branch mismatch — push blocked" before reaching `kb_drift`. Align the submodule branches with the parent (or disable the guard for this test) to exercise the full chain.

4. **post-merge:** `git checkout -b __merge-test`, edit a KB file, commit; `git checkout -` ; `git merge __merge-test`.
   🛑 **CONFIRM A.3.3** — post-merge fires; extensions refresh; if KB changed, kb-drift recomputed.

5. **post-checkout:** `git checkout -b __test-branch` then `git checkout -`.
   🛑 **CONFIRM A.3.4** — post-checkout fires on each switch; header HEAD short SHA updates; queue contents recomputed.

6. **Badge transitions:** `rm .git/hooks/pre-push` → click Refresh.
   🛑 **CONFIRM A.3.5** — badge flips to `partial` (or `missing`).

7. Run `kb_init` (or `kb_upgrade`) to restore.
   🛑 **CONFIRM A.3.6** — badge returns to `managed`.

### §A.4 Live state transitions

> **Note on fan-out:** when a code file matches multiple `_rules.md` patterns mapping to *different* `kb_target`s, `kb_drift` Phase 1 creates one code-drift entry **per distinct kb_target** (intentional — covered by the `P0 fan-out` tests in `drift.test.js`). Two patterns resolving to the same kb_target dedup to one entry. If the extension panel UI shows the entry under a different kb_target than `kb_drift`'s raw response surfaces, that's a separate report-shape question — not a precedence bug.

> **Submodule variant:** if `<TARGET_CODE>` lives inside a git submodule, the simple two-step "edit → commit" flow expands to three git operations:
> 1. Edit the file inside the submodule (working tree of the submodule).
> 2. Commit inside the submodule (`git -C <submodule> commit -am "…"`).
> 3. Commit the parent's submodule-pointer bump (`git commit -am "bump <submodule>"`).
>
> Per the bucket semantics in §1.1, the live-overlay preview entry appears after step 1 (working-tree change). The Published transition only follows once `kb_drift` Phase 1 runs in write mode AGAINST the parent's new state — which requires step 3 (pointer bump). Skipping step 3 leaves the entry in Uncommitted preview indefinitely.

1. Edit `<TARGET_CODE>` (same file you used in §A.2 row 21, or any other code file under a `_rules.md` pattern; add another comment line; do **not** commit yet). If `<TARGET_CODE>` is in a submodule, this is step 1 of the three-step variant above.
   🛑 **CONFIRM A.4.1** — Code Drift section gains an entry under "Uncommitted preview" within ~500 ms; entry shows `preview` badge.

2. Commit the change. For submodule-resident targets, also commit the pointer bump in the parent.
   🛑 **CONFIRM A.4.2** — same entry moves to "Published" after the next `kb_drift` Phase 1 (write mode) runs. Per §1.1: a plain `git commit` alone does NOT transition buckets; the queue file has to be written. Run `kb_drift` explicitly to force the transition if needed.

(Branch-switch refresh is already exercised in §A.3.4–5.)

### §A.5 Aspirational sweep

> **Note on committed-vs-working-tree evaluation:** `kb_conform` Phase 1 evaluates **committed** files by default. To also evaluate uncommitted files (your in-progress working-tree edits) against the standard, pass `include_working_tree: true` (defaults to `false`). Without this flag, a brand-new scratch file you just wrote will NOT appear in the Phase 1 evaluations even if it matches the rule's `applies_to.paths`.

1. VS Code: click "Rerun Phase 1" → choose **Aspirational**. Obsidian: copy the equivalent prompt from the "?" / Info area and paste into the agent.
2. Agent runs `kb_conform` aspirational pass.
   🛑 **CONFIRM A.5.1** — Standards Backlog populates; entries carry `direction: standards_aspirational` in their detail block.
3. Apply / Exempt / Dismiss one backlog entry via verdict picker.
   🛑 **CONFIRM A.5.2** — entry resolves; corresponding event appears in drift-log + Activity tab.

### §A.6 Filter & Activity tab exercises

1. Pending tab — type a substring of a known entry in search.
   🛑 **CONFIRM A.6.1** — only matching entries remain; Clear restores.
2. Click severity chip `warn`.
   🛑 **CONFIRM A.6.2** — non-warn entries hide.
3. Group-by → `Standard`.
   🛑 **CONFIRM A.6.3** — entries regroup under standard headings; switch back to `Section`.
4. Activity tab — group-by `Date`.
   🛑 **CONFIRM A.6.4** — events grouped by date.
5. Toggle "Show system events".
   🛑 **CONFIRM A.6.5** — system rows appear/hide.
6. Group-by `Event type`.
   🛑 **CONFIRM A.6.6** — events grouped by `applied / exempted / promoted / …`.

### §A.7 Education banners + state persistence

1. Open a section header on first run; education banner with lifecycle diagram appears.
2. Click "Got it".
   🛑 **CONFIRM A.7.1** — banner dismissed; "?" appears in header.
3. Click header "?".
   🛑 **CONFIRM A.7.2** — transient banner reappears.
4. **State persistence:** set search filter `drift`, group-by `Standard`, open Standards Drift section, open a verdict form and half-type a reason. Reload window (VS Code: `Developer: Reload Window`; Obsidian: toggle plugin off+on).
   🛑 **CONFIRM A.7.4** — on reload, filter + group-by + open section persist; banners stay dismissed. Verdict-form draft persistence is best-effort — note observed behaviour.

### §A.8 Mapping diagnostics trigger

> **Note on counts:** The `pattern_audit.unmapped_kb_group.count` and `unmapped_code_group.count` values reflect whatever happens to live in `.obsidian/`, `node_modules/`, or other unmapped directories at the moment `kb_drift` ran. The **number of findings** (e.g. 9 categories) is stable across runs in a given project, but the per-entry counts shift with environmental state. Treat the shape as stable, the numbers as informational.

1. Edit `knowledge/_rules.md` to add a code pattern matching no files (e.g. `src/nonexistent/**.js`).
   🛑 **CONFIRM A.8.1** — Mapping Diagnostics section gains an `orphan_pattern` entry.
2. Click "Copy audit fix prompt" on that entry → paste into agent → agent removes the pattern.
   🛑 **CONFIRM A.8.2** — Mapping Diagnostics empties.

### §A.9 kb_conform verdict round-trip (six paths)

Recreate a fresh standards-drift entry between paths as needed.

1. **Apply** (direct submit, no form) → 🛑 entry disappears; ledger appended.
2. **Exempt…** → form opens; Send disabled until reason filled; submit → 🛑 entry disappears; exception written to the standard file's frontmatter.
3. **Promote…** → form; originating files required; submit → 🛑 entry disappears; `standards-promotions.md` updated.
4. **Dismiss…** → form; reason required; submit → 🛑 entry disappears; audit log has reason.
5. **Acknowledge…** (on a code-drift entry) → form; reason required; submit → 🛑 entry stays but shows `acknowledged` badge.
6. **Close promotion** (on the promotion created in step 3) → 🛑 promotion section empties; ledger reflects closure.
7. After all six paths: switch to Activity tab.
   🛑 **CONFIRM A.9.7** — all six events present.

### §A.10 kb_drift Phase 2 verdict round-trip (four paths)

Recreate fresh code-drift / kb-drift entries between paths as needed.

1. **summaries** — edit KB to match the code change that triggered the entry; Copy Prompt → agent runs `kb_drift({ summaries: [{ kb_target, summary }] })`.
   🛑 **CONFIRM A.10.1** — entry disappears; drift-log row `event_type: SUMMARIES`.
2. **reverted** — revert the code change that triggered the entry; Copy Prompt → agent runs `kb_drift({ reverted: [{ code_file }] })`.
   🛑 **CONFIRM A.10.2** — entry disappears; drift-log row `event_type: REVERTED`.
3. **kb_confirmed** (on a kb-drift entry) — KB reviewed, code already matches; agent runs `kb_drift({ kb_confirmed: [{ kb_file }] })`.
   🛑 **CONFIRM A.10.3** — entry disappears; drift-log row `event_type: KB_CONFIRMED`.
4. **dismissed** — intentional drift; agent runs `kb_drift({ dismissed: [{ file, reason }] })`.
   🛑 **CONFIRM A.10.4** — entry disappears; drift-log row `event_type: DISMISSED` with reason.
5. After all four: Activity tab.
   🛑 **CONFIRM A.10.5** — all four events present.

### §A.11 Entry-button walkthrough

Recreate entries as needed; each button kind clicked at least once.

1. **Open Source** (code-drift / kb-drift / lint) → 🛑 file opens at the expected location (line/section).
2. **Open Standard** (standards-drift) → 🛑 standard file opens.
3. **Edit Rule** → 🛑 standard file opens **and** scroll target lands on the specific rule block; rule_id visible.
4. **Refine with Agent** (standards-drift) → 🛑 clipboard contains a `kb_write` prompt targeting that standard under `standards/`.
5. **Scaffold KB doc** (force: create a code change matching a pattern whose KB target file does not exist — e.g. add a file under a pattern, but remove the matching KB target if it exists, or pick a never-targeted pattern from `_rules.md`) → 🛑 button replaces "Open Source"; click → clipboard contains a `kb_scaffold` prompt for the missing target.
6. **Show diff** disclosure → expand → 🛑 diff content loads on first expand; content matches `git diff <since>..HEAD`.
7. **Show prompt** disclosure → expand → 🛑 content matches what Copy Prompt copies (byte-identical).

### §A.12 Copy-Prompt parity check

For each entry kind present (Code Drift target-exists, Code Drift target-missing, KB Drift, Standards Drift, Standards Backlog, Promotion, Lint, Mapping Diagnostic):

```bash
# VS Code: click Copy Prompt → paste here
cat > /tmp/parity-vscode-<kind>.txt <<'EOF'
<paste>
EOF

# Obsidian: click Copy Prompt on same entry → paste here
cat > /tmp/parity-obsidian-<kind>.txt <<'EOF'
<paste>
EOF

diff /tmp/parity-vscode-<kind>.txt /tmp/parity-obsidian-<kind>.txt
```

🛑 **CONFIRM A.12** — `diff` returns no output for every entry kind.

### §A.13 VS Code Capabilities panel + Publish commands

1. Command palette → "Instrumentality: Show Capabilities".
   🛑 **CONFIRM A.13.1** — panel opens; four category groups visible (Sync / Authoring / Governance / Introspection).
2. Click Copy on one example prompt in each category (four clicks).
   🛑 **CONFIRM A.13.2** — clipboard contains the prompt after each click.
3. Scroll to MCP config snippets section → Copy a Claude Code / Cursor snippet.
   🛑 **CONFIRM A.13.3** — clipboard contains the snippet.
4. **Obsidian Info tab parity:** switch to Obsidian's Info tab.
   🛑 **CONFIRM A.13.4** — same four category groups visible; copy one prompt → clipboard receives it.
5. Command palette → "Instrumentality: Publish Drift Queue" (with at least one dirty queue from earlier sections).
   🛑 **CONFIRM A.13.5** — publish pipeline runs; auto-commit appears in `git log`.
6. Obsidian: click header "Publish" button.
   🛑 **CONFIRM A.13.6** — same publish behaviour observed.

### §A.14 VS Code Send-Prompt backends

1. Default `clipboard`: click Send Prompt on an entry.
   🛑 **CONFIRM A.14.1** — clipboard contains the prompt.
2. Settings → `instrumentality.agent.backend` = `terminal`. Open a terminal panel. Click Send Prompt.
   🛑 **CONFIRM A.14.2** — prompt is typed into the active terminal verbatim.
3. Settings → `agent.backend` = `command`, `agent.commandId` = `workbench.action.terminal.sendSequence`. Click Send Prompt.
   🛑 **CONFIRM A.14.3** — command fires with the prompt as argument.
4. Revert backend to `clipboard`.

### §A.15 Settings toggles

1. `instrumentality.notifications.enabled` = true. Create a new drift entry.
   🛑 **CONFIRM A.15.1** — toast notification appears; "View" button focuses sidebar. Revert.
2. `FYI:` `refreshIntervalSeconds` (file-watch is default) and `lint.command` override are documented; both covered by unit tests.

### §A.16 Failure paths

1. **Lint frontmatter** — `kb_write` a KB file missing a required frontmatter field.
   🛑 **CONFIRM A.16.1** — Lint section populates; VS Code Problems pane shows diagnostic.
2. Fix the frontmatter via another `kb_write`.
   🛑 **CONFIRM A.16.2** — Lint section clears.
3. **Depth policy violation** — attempt `kb_write` at a path deeper than `_rules.md` allows (e.g. `specs/features/a/b/c/d/too-deep.md`).
   🛑 **CONFIRM A.16.3** — write does NOT need to hard-reject; depth violations surface as **lint warnings** on the written file (accepted behavior). Confirm the file is created AND a lint entry appears in both extensions citing the depth rule. If you'd prefer a hard reject for your project, that's a server-side policy change, not a UI gap.
4. `FYI:` secret detection covered by `lint.test.js` (not retested via UI).
5. `FYI:` `kb_extract` Phase 2 returns `lint_errors: N` on its response (it lints the file it just wrote). This is a tool-response signal only — it does **not** propagate to the extension's Lint section. The Lint section is fed by the `kb_status.lint.violations` pipeline (which runs `lint-standalone.js`). If you want a `kb_extract`-written file's violations to appear in the Lint section, run `kb_status` (or wait for the next watcher tick) after the write.

### §A.17 MCP-down panel resilience

1. Stop the MCP server process (kill it from your MCP client; or if running as a subprocess, terminate the node process).
2. Click Refresh in both panels.
   🛑 **CONFIRM A.17.1** — panels still render queue contents from disk; Send Prompt (clipboard) still works; tool-execution attempts from the agent fail clearly without crashing the panel.
3. Restart MCP.

### §A.18 Cleanup

> **Submodule note:** If your `_rules.md` code patterns target paths inside a submodule (common in monorepo-style consumer projects), the parent's `git checkout -- <TARGET_CODE>` only restores the submodule **pointer**, not the in-submodule edits or commits. Before §A.4, capture each affected submodule's SHA with `git -C <submodule> rev-parse HEAD`. During cleanup, run `git -C <submodule> reset --hard <captured-sha>` for each, plus `git -C <submodule> stash drop` if §A.2 row 21 left stashed edits inside the submodule, plus `git -C <submodule> clean -fd` if untracked scratch files were created there.

```bash
# Revert intentional edits (substitute the actual paths you picked earlier)
git checkout -- <TARGET_CODE>          # from §A.2 row 21 / §A.4
git checkout -- <TARGET_KB>            # from §A.2 row 22
git checkout -- knowledge/_rules.md    # if §A.8 left changes

# Submodule cleanup (only if TARGET_CODE was inside a submodule).
# Substitute <SUBMODULE_PATH> with the actual path (e.g. ms-linestop-admin-be)
# and <CAPTURED_SHA> with the SHA you captured in §A.0 before testing.
# git -C <SUBMODULE_PATH> reset --hard <CAPTURED_SHA>
# git -C <SUBMODULE_PATH> stash drop     # if §A.2 row 21 stashed inside submodule
# git -C <SUBMODULE_PATH> clean -fd      # if scratch files were created there
# git checkout -- <SUBMODULE_PATH>       # restore parent's submodule pointer

# Remove scratch files created during the run
rm -f knowledge/specs/features/__test-only.md
rm -f knowledge/standards/code/__test-extract.md

# Remove temp branches
git branch -D __test-branch __merge-test 2>/dev/null

git status                              # parent must be clean
# git -C <SUBMODULE_PATH> status        # each touched submodule must be clean too
```

🛑 **CONFIRM A.18** — both panels return to baseline; `git status` is clean.

---

## §3 — Scenario B: Fresh full-stack project from zero

Target stack: React (+ MUI + Axios + Yup + React Hook Form) frontend, Go (+ Fiber) backend, shared submodule for cross-app types.

### §B.0 Bootstrap

```bash
mkdir -p ~/kb-mcp-test/clinic-suite && cd ~/kb-mcp-test/clinic-suite
git init -b main

# ---------- Backend ----------
mkdir backend && cd backend
go mod init clinic/backend

cat > main.go <<'EOF'
package main

import (
	"clinic/backend/handlers"
	"github.com/gofiber/fiber/v2"
)

func main() {
	app := fiber.New()
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.SendString("ok") })
	handlers.RegisterAppointmentRoutes(app)
	app.Listen(":8080")
}
EOF

mkdir -p handlers services models validators

cat > handlers/appointment.go <<'EOF'
package handlers

import (
	"clinic/backend/services"
	"github.com/gofiber/fiber/v2"
)

func RegisterAppointmentRoutes(app *fiber.App) {
	app.Get("/appointments", listAppointments)
	app.Post("/appointments", createAppointment)
}

func listAppointments(c *fiber.Ctx) error {
	return c.JSON(services.ListAppointments())
}

func createAppointment(c *fiber.Ctx) error {
	var req services.CreateAppointmentRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	appt, err := services.CreateAppointment(req)
	if err != nil {
		return fiber.NewError(fiber.StatusUnprocessableEntity, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(appt)
}
EOF

cat > services/appointmentService.go <<'EOF'
package services

import "clinic/backend/models"

type CreateAppointmentRequest struct {
	PatientID string `json:"patientId" validate:"required,uuid"`
	StartsAt  string `json:"startsAt"  validate:"required"`
	Notes     string `json:"notes"`
}

func ListAppointments() []models.Appointment { return []models.Appointment{} }

func CreateAppointment(req CreateAppointmentRequest) (models.Appointment, error) {
	return models.Appointment{ID: "stub", PatientID: req.PatientID, StartsAt: req.StartsAt}, nil
}
EOF

cat > models/appointment.go <<'EOF'
package models

type Appointment struct {
	ID        string `json:"id"`
	PatientID string `json:"patientId"`
	StartsAt  string `json:"startsAt"`
	Notes     string `json:"notes,omitempty"`
}
EOF

cat > validators/appointment.go <<'EOF'
package validators

import "github.com/go-playground/validator/v10"

var V = validator.New()
EOF

go get github.com/gofiber/fiber/v2 github.com/go-playground/validator/v10
cd ..

# ---------- Frontend ----------
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @mui/material @emotion/react @emotion/styled axios yup react-hook-form @hookform/resolvers
mkdir -p src/{components,services,validators,api,hooks,models}

cat > src/models/appointment.ts <<'EOF'
export interface Appointment {
  id: string
  patientId: string
  startsAt: string
  notes?: string
}
EOF

cat > src/api/endpoints.ts <<'EOF'
export const endpoints = {
  appointments: '/appointments',
  appointment: (id: string) => `/appointments/${id}`,
}
EOF

cat > src/services/appointmentService.ts <<'EOF'
import axios from 'axios'
import { endpoints } from '../api/endpoints'
import type { Appointment } from '../models/appointment'

const client = axios.create({ baseURL: '/api' })

export async function listAppointments(): Promise<Appointment[]> {
  const { data } = await client.get(endpoints.appointments)
  return data
}

export async function createAppointment(input: Omit<Appointment, 'id'>): Promise<Appointment> {
  const { data } = await client.post(endpoints.appointments, input)
  return data
}
EOF

cat > src/validators/appointmentSchema.ts <<'EOF'
import * as yup from 'yup'

export const appointmentSchema = yup.object({
  patientId: yup.string().uuid().required(),
  startsAt:  yup.string().required(),
  notes:     yup.string().max(500),
})

export type AppointmentInput = yup.InferType<typeof appointmentSchema>
EOF

cat > src/components/AppointmentForm.tsx <<'EOF'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { Button, TextField, Stack } from '@mui/material'
import { appointmentSchema, AppointmentInput } from '../validators/appointmentSchema'
import { createAppointment } from '../services/appointmentService'

export function AppointmentForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<AppointmentInput>({
    resolver: yupResolver(appointmentSchema),
  })
  return (
    <form onSubmit={handleSubmit(createAppointment)}>
      <Stack spacing={2}>
        <TextField label="Patient ID" {...register('patientId')} error={!!errors.patientId} helperText={errors.patientId?.message} />
        <TextField label="Starts at"  {...register('startsAt')}  error={!!errors.startsAt}  helperText={errors.startsAt?.message} />
        <TextField label="Notes"      {...register('notes')}     error={!!errors.notes}     helperText={errors.notes?.message} multiline />
        <Button type="submit" variant="contained">Book</Button>
      </Stack>
    </form>
  )
}
EOF

cd ..
git add -A && git commit -m "initial monorepo bootstrap"
```

🛑 **CONFIRM B.0** — Both extensions open this repo; activation may need manual command since `knowledge/` is not yet present; HEAD matches.

### §B.1 kb_init multi-stack detection + idempotency

1. Agent calls `kb_init`. Expected: `detected_stacks` array (note: pluralised — `detected_stack` is the scalar monorepo label, `"monorepo"`) includes both `react-vite:frontend` and `go:backend`; `_rules.md` contains both stacks' pattern blocks AND an uncommented `app_root_patterns:` block keyed by monorepo sub-app dirs (e.g. `"frontend/**": frontend`, `"backend/**": backend`); all four git hooks installed.
   🛑 **CONFIRM B.1.1** — extensions reload; sections become available; hooks badge `managed`.
   🛑 **CONFIRM B.1.2** — open `knowledge/_rules.md` in your editor; it shows both stacks' pattern blocks AND the `app_root_patterns:` block.
2. Run `kb_init` again. Diff `_rules.md` before/after.
   🛑 **CONFIRM B.1.3** — idempotent (diff empty); no duplicate pattern blocks; no duplicate hook entries; no errors.

### §B.2 Populate KB via kb_scaffold chain

Agent runs `kb_scaffold` (two-phase per file: phase 1 returns prompt, phase 2 writes content):

- `standards/code/tech-stack.md` (app_scope: both)
- `standards/code/frontend-conventions.md` (app_scope: frontend) — MUI + Axios + Yup + RHF patterns
- `standards/code/backend-conventions.md` (app_scope: backend) — Fiber handler/service/model split, go-playground/validator usage
- `specs/features/appointments.md`
- `specs/flows/book-appointment.md`
- `data/schema/appointment.md` (DBML)
- `data/validation/appointment.md`

🛑 **CONFIRM B.2** — All seven files listed in both extensions under their respective sections; no drift entries yet (standards just written, code already exists).

### §B.3 Drift triggers

1. Edit `backend/handlers/appointment.go` — add a new endpoint (`app.Delete("/appointments/:id", ...)`); commit.
   🛑 **CONFIRM B.3.1** — code-drift entry appears with `app_scope: backend`.
2. Edit `frontend/src/validators/appointmentSchema.ts` — tighten a Yup rule (e.g. `notes: yup.string().max(280)`); commit.
   🛑 **CONFIRM B.3.2** — code-drift entry appears with `app_scope: frontend`.
3. Edit `standards/code/frontend-conventions.md` adding a rule the frontend currently violates (e.g. forbid `console.log` in components) → run `kb_conform`.
   > **Note (F45):** `kb_conform` current mode only evaluates files changed since the queue baseline. A rule edit alone won't surface a standards-drift entry unless a code file matching the rule's `applies_to.paths` has also changed in the same commit (or working tree, with `include_working_tree: true`). Either edit a matching code file in the same commit as the rule edit (the plan's `console.log` example fits — add a `console.log(...)` to `AppointmentForm.tsx`), or use aspirational mode (which evaluates against the full tree but lands in Standards Backlog, not Standards Drift).
   🛑 **CONFIRM B.3.3** — standards-drift section populates; entry's rule_id matches the new rule.

### §B.4 app_scope verification

The extensions don't expose `app_scope` as a top-level filter; verify scoping via group-by + entry detail.

1. Group-by → `Standard`. Entries regroup under their owning standard. Each backend-scoped entry sits under `backend-conventions`; each frontend-scoped entry sits under `frontend-conventions`.
   🛑 **CONFIRM B.4.1** — entries cluster correctly by owning standard.
2. Expand one backend entry; the detail block contains `app_scope: backend`. Expand one frontend entry; detail contains `app_scope: frontend`.
   🛑 **CONFIRM B.4.2** — `app_scope` field matches the file's location (backend/ vs frontend/).
3. Group-by → `Section` to revert.

### §B.5 kb_migrate after rules change

1. Edit `_rules.md` (tighten a path glob — e.g. narrow a frontend pattern from `frontend/src/**` to `frontend/src/components/**`).
2. Agent runs `kb_migrate` → receives per-file migration prompts → applies via `kb_write`.
   🛑 **CONFIRM B.5** — affected files updated; `_index.yaml` refreshed; no new lint violations.

### §B.6 kb_issue triage + plan + consult

Synthetic issue text (paste into agent as `issue.body`):

> "Patients are getting double-booked when two clinicians submit the same slot within 200 ms of each other. Needs an idempotency key on POST /appointments and a UI 'last action' indicator."

1. `kb_issue consult` (read-only) → no CONFIRM.
2. `kb_issue triage` → writes `knowledge/sync/inbound/<id>.md`.
   🛑 **CONFIRM B.6.1** — inbound entry visible in extensions or via direct file inspection.
3. `kb_issue plan` for the same issue → writes `knowledge/sync/outbound/<id>.md`.
   🛑 **CONFIRM B.6.2** — outbound entry visible.

### §B.7 kb_import 3-phase auto-classify

```bash
cat > /tmp/import-doc.md <<'EOF'
# Clinic data retention

We keep appointment records for 7 years per HIPAA.
Soft-deleted records are purged from the warm store after 90 days.
Audit logs are retained 10 years and never deleted.
EOF
```

1. Phase 1 extraction — no write.
2. Phase 2 planning — agent reviews proposed targets.
3. Phase 3 approval — writes to KB. Standards land at `standards/<group>/<id>.md` (where `<group>` comes from the classification's `suggested_group`), not `standards/<id>.md` at the root. Decisions land at `decisions/<id>.md`.
   🛑 **CONFIRM B.7** — the new files appear in the editor's KB folder tree (VS Code Explorer / Obsidian vault tree) under `knowledge/decisions/` and `knowledge/standards/<group>/`. They will NOT surface in the Instrumentality panel unless they later enter drift/conform/lint state — the panel renders queue state, not the KB folder tree. Open each written file and confirm the YAML frontmatter is well-formed (no `[object Object]` literals — F51/F52 guard against this).

### §B.8 Verdict round-trip

Run all six kb_conform paths from §A.9 and all four kb_drift paths from §A.10 against the entries from §B.3.

> **Note (F55):** if you triggered any `kb_drift` baseline reset (`force_baseline + purge`) during this scenario, the resulting `## DATE · PURGE` drift-log headings are now classified as **system events** (`baseline-purge`) and are hidden by default in the Activity tab. Toggle "Show system events" to see them. Previously they rendered as "Unknown".

### §B.9 Submodule lifecycle (kb_sub)

```bash
cd .. && mkdir shared-types && cd shared-types && git init -b main
mkdir -p shared/types

cat > shared/types/appointment.ts <<'EOF'
export interface SharedAppointment {
  id: string
  patientId: string
  startsAt: string
}
EOF

cat > shared/types/appointment.go <<'EOF'
package types

type SharedAppointment struct {
	ID        string `json:"id"`
	PatientID string `json:"patientId"`
	StartsAt  string `json:"startsAt"`
}
EOF

git add -A && git commit -m "shared types v1"
cd ../clinic-suite
git submodule add ../shared-types shared
git commit -am "add shared submodule"
```

Exercise the two highest-value alignment states:
- **aligned** (default after add) → 🛑 **CONFIRM B.9.1** Submodule card shows the aligned colour.
- **blocking** (parent on main, submodule checked out to a different branch on an owned submodule): in `shared/`, run `git checkout -b __other-branch && git commit --allow-empty -m "diverge" && cd ..`. Refresh panel.
  🛑 **CONFIRM B.9.2** — colour changes to blocking.

`FYI:` `advisory` and `detached` states covered by `kb_sub` unit tests.

Then:
- Update `_rules.md` to add **parent-relative** patterns spanning the submodule root (e.g. `shared/**/*.go`, `shared/**/*.ts`) mapping to KB targets. Edit files in `shared/` — to get the spec's "frontend + backend drift from one shared edit", edit both a `.ts` file (frontend KB target) and a `.go` file (backend KB target).
  > **Note (F57):** patterns scoped INSIDE the submodule (e.g. `shared/types/**` without the `shared/` prefix when the submodule mount-point is `shared/`) match nothing because the drift engine evaluates from the parent's root. As of F57, such patterns now surface as `submodule_pattern_unresolved` in Mapping Diagnostics (distinct from generic `orphan_pattern`) so you can tell a "needs path fix" from a "truly dead pattern". To get drift detection on submodule files, the pattern must start with the parent-relative submodule path prefix.
  > A single shared file edit fans out to multiple KB targets only when that file matches multiple patterns mapping to DIFFERENT `kb_target`s. To see frontend+backend drift simultaneously from one change set, edit one file per stack inside the submodule (e.g. one `.ts` and one `.go`).
  🛑 **CONFIRM B.9.3** — simultaneous frontend + backend drift entries materialise from the shared edit set (one entry per `.ts` edit, one per `.go` edit).
- VS Code: click the submodule card's **Push** button.
  🛑 **CONFIRM B.9.4** — push runs in the printed order (parent + submodule sequence).
- Agent runs `kb_sub merge_plan` against a feature branch.
  🛑 **CONFIRM B.9.5** — merge sequence shown matches what the extension surfaces.

### §B.10 Cleanup

```bash
rm -rf ~/kb-mcp-test/clinic-suite ~/kb-mcp-test/shared-types
```

No effect on the main project repo.

---

## §4 — Out-of-scope (acknowledged, covered by unit tests or low-risk)

These were considered and intentionally not retested via the UI. Where "unit tests" are cited, they live in the kb-mcp source tree (`knowledge/_mcp/tests/*.test.js`) — not in your project; run them in the kb-mcp source checkout if you need regression coverage.

- **`kb_get` deep ranking / token-budget assertions** — covered by `get.test.js` in kb-mcp source.
- **`_prompt-overrides/` precedence** — covered by kb-mcp unit tests; only relevant if your project actually uses an override directory.
- **`lint.command` override behaviour** — FYI in §A.15; unit-tested.
- **Verdict form server-side rejection** — form-side validation tested here; server-side covered by `conform.test.js` in kb-mcp source.
- **Host-level activation** (VS Code activationEvents, Obsidian isDesktopOnly) — covered implicitly by §0 (panel opens and shows version).
- **Prompt fingerprint invalidation on rule change** — covered by `kb_conform` unit tests.
- **Secret detection in lint** — covered by `pattern-audit.test.js` and lint regex tests in kb-mcp source.
- **`advisory` and `detached` submodule alignment** — covered by `kb_sub` unit tests; UI rendering uses identical mechanism to `aligned`/`blocking`.

---

## §5 — Two ready-to-paste agent prompts

Paste exactly one of these into a Claude Code / Cursor / Claude Desktop session that has `kb-mcp` v1.1.1 attached, with both extensions open in side-by-side host windows.

### Prompt A — Existing-project runbook

```
You are running MANUAL_TEST_PLAN Scenario A against the project at $PWD.
KB-MCP version expected: 1.1.1. VS Code extension v0.3.0 and Obsidian plugin v0.2.0
are open in side-by-side windows on this project.

PROTOCOL
- After every action that should change what the extensions display, output a line
  starting with "🛑 CONFIRM <id>" describing what the user should see in BOTH
  extensions, then STOP and wait for the user to reply "ok" / "next" /
  "fail: <note>" before continuing.
- Pure read-only actions are reported as "FYI: <description>" without stopping.
- Do not modify files outside knowledge/sync/, the scratch files this runbook
  creates, or the intentional drift edits — all reverted in §A.18.
- Before starting, verify knowledge/_rules.md exists. If it does NOT, abort and
  tell the user to use Prompt B instead.
- The kb-mcp source code is not required. Do not attempt to `npm install` or
  `npm test` against kb-mcp itself — those steps belong in Appendix A.

EXECUTE in order:

§0 Pre-flight (lightweight)
- Confirm kb-mcp v1.1.1 is connected (call kb_status; if a server_version field
  is present, assert it equals "1.1.1"; otherwise ask the user to confirm).
- Confirm the user has both extension panels open with v0.3.0 / v0.2.0.
- Run `git rev-parse --short HEAD` and compare to kb_status head_sha.
- Print "🛑 CONFIRM 0" and stop.

§A.0 Setup
- Ask the user for two paths and use them throughout:
    <TARGET_CODE> — any code file under a pattern in knowledge/_rules.md
    <TARGET_KB>   — any KB file under knowledge/specs/
  Echo both choices back and proceed.

§A.1 Sanity
- Call kb_status; assert shape (head_sha, hooks_state, code_drift.count,
  kb_drift.count, standards_drift.count, conform_pending.count,
  promotions.count, lint.errors, lint.warnings). Print as FYI.
- Call kb_inventory; print stale_rules / uncovered_files / pending_promotions
  as FYI.
- Ask the user for <PICK_A_TARGET> — a **file path** (NOT a directory) that
  matches the applies_to.paths of at least one standard's rule in
  knowledge/_index.yaml. A directory covered only by a _rules.md
  code_path_patterns glob (e.g. **/controller/**) typically returns
  rules_in_scope: [] — rules_in_scope matches rule-level applies_to, not
  pattern coverage. Call
    kb_get({keywords:["drift"], working_paths:["<PICK_A_TARGET>"]}).
  Assert non-empty rules_in_scope. FYI.
- Call kb_get({keywords:["glossary"]}); if knowledge/glossary.md exists
  assert it is returned, otherwise assert the response is non-empty
  (typically global.md). FYI.
- Call kb_get({keywords:["agent"]}); if knowledge/agent-rules.md exists
  assert it is returned. CLAUDE.md lives at repo root, structurally outside
  kb_get's knowledge/ scope and WILL NOT appear in kb_get output. FYI.

§A.2 MCP tool coverage
- Walk rows 1–27 of the §A.2 table in <PLAN_FILE>. For each disk
  write, emit "🛑 CONFIRM A.2.<n>" and stop. For read-only, FYI.

§A.3 Git hooks lifecycle
- Verify hooks exist; emit CONFIRM only on transitions (A.3.1–A.3.6).
- Restore any deleted hook at the end of this section.

§A.4 Live state transitions
- Edit-without-commit then commit; CONFIRM A.4.1, A.4.2.

§A.5 Aspirational sweep
- Run kb_conform aspirational; resolve one backlog entry; CONFIRM A.5.1, A.5.2.

§A.6 Filter & Activity exercises
- Six sub-confirms A.6.1–A.6.6.

§A.7 Education banners + state persistence
- A.7.1 (dismiss), A.7.2 (re-show), A.7.4 (persistence after reload).

§A.8 Mapping diagnostics
- A.8.1 (orphan_pattern appears), A.8.2 (clears).

§A.9 kb_conform verdicts
- Walk all six paths; final CONFIRM A.9.7 covers Activity tab event presence.

§A.10 kb_drift Phase 2 verdicts
- Walk all four paths; final CONFIRM A.10.5 covers Activity tab.

§A.11 Entry-button walkthrough
- Seven sub-confirms A.11.1–A.11.7.

§A.12 Copy-Prompt parity
- One CONFIRM after diffing all entry kinds.

§A.13 Capabilities + Publish
- Six sub-confirms A.13.1–A.13.6 including Obsidian Info tab parity.

§A.14 Send-Prompt backends
- Three sub-confirms A.14.1–A.14.3.

§A.15 Settings toggles
- One CONFIRM A.15.1; refresh interval + lint.command are FYI.

§A.16 Failure paths
- A.16.1, A.16.2 (lint frontmatter cycle); A.16.3 (depth violation).

§A.17 MCP-down resilience
- A.17.1.

§A.18 Cleanup
- Revert all intentional edits, remove scratch files, delete temp branches.
- Final line MUST be exactly: "Scenario A complete. git status clean."
```

### Prompt B — Fresh-project runbook

```
You are running MANUAL_TEST_PLAN Scenario B. Bootstrap a fresh monorepo at
~/kb-mcp-test/clinic-suite using the bash blocks in §B.0 of
<PLAN_FILE>.

TARGET STACK
- Frontend: React + Vite + TypeScript + MUI + Axios + Yup + React Hook Form
- Backend:  Go + Fiber + go-playground/validator
- Shared:   shared-types submodule containing cross-app types

KB-MCP version expected: 1.1.1. Both extensions are open on the new repo in
side-by-side windows.

PROTOCOL
- Same CONFIRM-gate protocol as Prompt A.
- After every disk write or git-state change, emit "🛑 CONFIRM <id>" and stop.
- Read-only operations are "FYI:" lines.
- Do not write outside ~/kb-mcp-test/.
- Before starting, verify the target directory is empty / has NO knowledge/_rules.md.
  If knowledge/_rules.md already exists, abort and tell the user to use Prompt A.
- The kb-mcp source code is not required for this run.

EXECUTE in order:

§0 Pre-flight (lightweight)
- Confirm kb-mcp v1.1.1 is connected; both extensions show v0.3.0 / v0.2.0.
- Confirm node, npm, go are on PATH.

§B.0 Bootstrap
- Run the §B.0 bash blocks exactly. Commit. Open extensions on the new repo.
- CONFIRM B.0.

§B.1 kb_init multi-stack + idempotency
- Call kb_init. Assert detected_stacks (plural — detected_stack is the scalar
  monorepo label) contains both "react-vite:frontend" and "go:backend".
  Also assert _rules.md emits an uncommented app_root_patterns block.
  CONFIRM B.1.1, B.1.2.
- Call kb_init again. Diff _rules.md before/after; assert empty. CONFIRM B.1.3.

§B.2 kb_scaffold chain
- Two-phase scaffold for each of the seven files in §B.2. CONFIRM B.2.

§B.3 Drift triggers
- Backend edit → CONFIRM B.3.1 (app_scope: backend).
- Frontend edit → CONFIRM B.3.2 (app_scope: frontend).
- Standards-rule edit + kb_conform → CONFIRM B.3.3.

§B.4 app_scope verification
- Group-by Standard → CONFIRM B.4.1 (entries cluster by owning standard).
- Expand entries; assert app_scope field matches file location → CONFIRM B.4.2.
- Revert group-by to Section.

§B.5 kb_migrate after rules change
- CONFIRM B.5.

§B.6 kb_issue triage + plan + consult
- consult (FYI), triage → CONFIRM B.6.1, plan → CONFIRM B.6.2.

§B.7 kb_import 3-phase
- CONFIRM B.7.

§B.8 Verdict round-trip
- Run all six kb_conform paths AND all four kb_drift paths against B.3 entries.
- One Activity-tab CONFIRM at the end of each verdict set.

§B.9 Submodule lifecycle
- Bootstrap shared-types submodule; CONFIRM B.9.1 (aligned), B.9.2 (blocking).
- Add shared/** patterns + edit shared file → CONFIRM B.9.3.
- Click VS Code Push → CONFIRM B.9.4.
- kb_sub merge_plan → CONFIRM B.9.5.

§B.10 Cleanup
- rm -rf ~/kb-mcp-test/clinic-suite ~/kb-mcp-test/shared-types
- Final line MUST be exactly: "Scenario B complete. ~/kb-mcp-test removed."
```

---

## Verification of this document

After authoring or editing (these checks run from the kb-mcp source checkout, not from a consumer project):

1. `node knowledge/_mcp/scripts/lint-standalone.js knowledge/_mcp/tests/MANUAL_TEST_PLAN.md`
2. Every relative link resolves to an existing file or directory (within kb-mcp source).
3. CONFIRM-count audit: Prompt A's CONFIRM directives match the §A sub-section count; same for Prompt B vs §B.
4. Dry-run Prompt A on a project that has `knowledge/_rules.md` — agent pauses at every CONFIRM gate; §A.18 leaves `git status` clean.
5. Dry-run Prompt B in an empty dir — bootstrap completes; `kb_init` reports both stacks; idempotent on re-run; cleanup removes temp dir.
6. §A.12 parity diff returns zero across all entry kinds.

---

## Appendix A — Rebuilding kb-mcp from source (kb-mcp developers only)

Skip this appendix unless you are testing **local changes to kb-mcp itself**. Consumers of kb-mcp do not need to run any of these steps.

All commands assume you are inside the kb-mcp source checkout (the `project-instrumentality` repo).

```bash
# A.1 MCP server
cd knowledge/_mcp
node -e "console.log(require('./package.json').version)"   # expect: 1.1.1
npm install
npm test                                                    # all *.test.js must pass

# A.2 Shared package
cd ../../packages/shared
npm install && npm run build

# A.3 VS Code extension
cd ../vscode-extension
node -e "console.log(require('./package.json').version)"   # expect: 0.3.0
npm install && npm run build
ls -la dist/extension.js                                    # newer than src/*.ts

# A.4 Obsidian plugin
cd ../obsidian-plugin
node -e "console.log(require('./manifest.json').version)"  # expect: 0.2.0
npm install && node esbuild.config.mjs
ls -la dist/main.js                                         # newer than src/*.ts

# A.5 Reinstall freshly built artifacts
# VS Code:  vsce package, then `code --install-extension instrumentality-0.3.0.vsix`
#           — or for dev: symlink/copy dist/ into ~/.vscode/extensions/instrumentality-0.3.0/
#             and run "Developer: Reload Window"
# Obsidian: copy the contents of dist/ (main.js + manifest.json + styles.css + runner/ + _templates/)
#           into <vault>/.obsidian/plugins/instrumentality/,
#           then Settings → Community plugins → toggle Instrumentality off + on
```

After Appendix A completes, your MCP client must be pointed at this freshly built kb-mcp (typically by setting `command`/`args` in your MCP config to the local `server.js` path). Once that's done, return to §0 and proceed normally.
