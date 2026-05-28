# Scenario B Fix Verification — agent prompt

> Targeted re-run of the 14 highest-impact Scenario B fixes (F38–F58). Run against a **fresh empty workspace** with the patched kb-mcp v1.1.1 + VS Code ext v0.3.0 + Obsidian plugin v0.2.0 attached. Takes 20–30 minutes with CONFIRM gates.
>
> This is the delta-runbook for just the fixes — not a full Scenario B re-run.

---

## Pre-flight

1. **Empty workspace**: `mkdir -p ~/kb-mcp-fixverify && cd ~/kb-mcp-fixverify && git init -b main`
2. **MCP client** (Claude Code / Cursor) attached to your patched kb-mcp build.
3. **Both extensions installed and visible** in side-by-side host windows on this workspace.
   - VS Code: install from rebuilt `packages/vscode-extension/dist/` (symlink or copy to `~/.vscode/extensions/instrumentality-0.3.0/`) then `Developer: Reload Window`.
   - Obsidian: copy `packages/obsidian-plugin/dist/{main.js,manifest.json,styles.css}` plus `runner/` and `_templates/` into `<vault>/.obsidian/plugins/instrumentality/`, then toggle the plugin off and on.
4. **node + go on PATH** (for §1 bootstrap).
5. Workspace ALWAYS prefixed `~/kb-mcp-fixverify/` — DO NOT touch the kb-mcp source repo or any other consumer project.

---

## Prompt to paste into the agent

```
You are running the SCENARIO_B_FIX_VERIFICATION runbook at ~/kb-mcp-fixverify. The
kb-mcp build under test has fixes for findings F38–F58 from TEST_RUN_RESULTS.md.
Both extensions are open on this workspace.

PROTOCOL
- After every action that should change extension state, emit a line starting
  with "🛑 CONFIRM <id>" describing what the user should see in BOTH panels,
  then STOP and wait for "ok" / "next" / "fail: <note>" before continuing.
- Read-only checks are "FYI: <description>" — no stop.
- Do not write outside ~/kb-mcp-fixverify/.
- Final line MUST be exactly: "Scenario B fix verification complete."

EXECUTE in order:

§1 — Bootstrap (minimal monorepo for stack detection)
---
mkdir -p backend frontend
touch backend/go.mod
cat > frontend/package.json <<'JSON'
{ "name": "fe", "dependencies": { "react": "^18", "vite": "^5" }, "devDependencies": { "typescript": "^5" } }
JSON
mkdir -p backend/handlers backend/services backend/models backend/validators frontend/src
echo 'package handlers' > backend/handlers/appointment.go
echo 'package services' > backend/services/appointmentService.go
echo 'package models'   > backend/models/appointment.go
echo 'package validators' > backend/validators/v.go
git add -A && git commit -m "initial bootstrap"

§2 — F44 (app_root_patterns) + F43 (Go flat-layout patterns)
- Call kb_init({interactive:false}).
- Open knowledge/_rules.md.
🛑 CONFIRM F44 — _rules.md contains an UNCOMMENTED `app_root_patterns:` block
  with both `"backend/**": backend` and `"frontend/**": frontend` (NOT just
  commented examples). Detected_stacks (plural) lists both go:backend and
  react-vite:frontend.
- Edit backend/handlers/appointment.go (add a comment line); commit.
- Run kb_drift({mode:"current"}).
🛑 CONFIRM F43 — kb_drift surfaces a code-drift entry referencing
  backend/handlers/appointment.go (matched by a flat-layout pattern, no
  manual _rules.md tweaks needed). Visible in both panels.

§3 — F39 (kb_init idempotent rewrite)
- Capture stat -c %Y on .cursor/mcp.json AND .git/hooks/pre-commit.
- Run kb_init({interactive:false}) a SECOND time.
- Re-stat the same files. The mtimes should be IDENTICAL (writeIfChanged
  short-circuits when content is byte-equal).
🛑 CONFIRM F39 — mtimes unchanged for .cursor/mcp.json and pre-commit hook
  across consecutive idempotent kb_init calls. _rules.md byte-identical.

§4 — F51 (kb_import frontmatter) + F54 (suggested_group routing) + F52 (lint sentinel)
---
cat > /tmp/retention.md <<'EOF'
# Clinic data retention

We keep appointment records for 7 years per HIPAA.
Soft-deleted records purge from warm store after 90 days.
Audit logs retain 10 years, never delete.
EOF
- Run kb_import({source:"/tmp/retention.md", auto_classify:true}) — Phase 1.
- Submit Phase 2 classification with type:"standard", suggested_id:"data-retention",
  suggested_group:"process", confidence:0.9.
- Run kb_import with approve:true — Phase 3 (writes the file).
🛑 CONFIRM F54 — file lands at knowledge/standards/process/data-retention.md
  (NOT knowledge/standards/data-retention.md at root).
- Open that file. Inspect frontmatter.
🛑 CONFIRM F51 — frontmatter contains NO "[object Object]" substring anywhere.
  Top-level id is "data-retention". Unfilled placeholders like {{rule_id}}
  appear as literal quoted strings (for agent fill-in later) — that's expected.
- Call kb_lint or kb_status to refresh lint state.
🛑 CONFIRM F52 — Lint section is clean for this file (no [object Object]
  sentinel violations). If the file had been written with the old broken
  template, lint would now flag it explicitly — that path is exercised by
  the lint.test.js fixture, no manual repro needed.

§5 — F42 + F41 (clean scaffold output) + F40 (YAML quote auto-fix)
- Call kb_scaffold({type:"standard", group:"code", id:"frontend-conv"}) — Phase 1.
🛑 CONFIRM F41 — knowledge/standards/code/code.md was NOT auto-created (P1
  should not pollute the FS with a half-filled group descriptor).
- Submit Phase 2 with content that includes a rule whose hint contains `{`:
  e.g. hint: "useForm({ resolver: yupResolver(schema) })".
🛑 CONFIRM F40 — write succeeds; no "expected yaml.parse to be a function"
  error. The file persists with the hint intact.
🛑 CONFIRM F42 — kb_lint on the new file returns 0 errors and 0 warnings.
  Frontmatter has no `status: draft` field (that hardcoded line was removed).

§6 — F49 (kb_issue plan path sanitization)
- Run kb_issue({command:"plan", scope:"specs/features", content:"items: []\n"}).
🛑 CONFIRM F49 — output file_path is something like
  knowledge/sync/outbound/YYYY-MM-DD-specs-features.yaml (NOTE the hyphen).
  NOT outbound/YYYY-MM-DD-specs/features.yaml (no nested directory).
  Run `ls knowledge/sync/outbound/` to confirm — no subdirs present.

§7 — F47 (app_scope in standards-drift detail panel)
- Edit knowledge/standards/code/frontend-conv.md to add a rule under
  app_scope: frontend that the frontend code currently violates (e.g. forbid
  console.log in any TS file). Add `console.log('x')` to a fixture .tsx
  in frontend/src/. Commit both.
- Run kb_conform({mode:"current"}) and submit a fail judgment for the
  console.log rule.
🛑 CONFIRM F47 — In BOTH panels, expand the resulting standards-drift entry.
  Detail block shows an "App scope" row with value `frontend`. (Previously
  app_scope was only visible by opening the standard file.)

§8 — F46 (Obsidian accordion under non-Section group-by)  [Obsidian only]
- In Obsidian panel: change group-by from "Section" to "Standard".
🛑 CONFIRM F46 — Accordion cards in non-Section mode now EXPAND when their
  headers are clicked (previously they stayed collapsed). The first card
  defaults to open.
- Switch group-by back to "Section".

§9 — F58 (kb_sub merge_plan uses submodule branch)
---
# Need an actual submodule for both F58 and F57. Create one first:
cd /tmp && rm -rf fixverify-shared && mkdir fixverify-shared && cd fixverify-shared
git init -b main && mkdir types && echo 'export type X = number' > types/x.ts
git add -A && git commit -m "init"
cd ~/kb-mcp-fixverify
git submodule add /tmp/fixverify-shared shared
git commit -m "add shared submodule"
# Diverge submodule branch from parent:
git -C shared checkout -b feature/shared-only
echo 'export type Y = string' > shared/types/y.ts
git -C shared add -A && git -C shared commit -m "add y"
git checkout -b feature/parent-only
git add shared && git commit -m "bump shared pointer"
- Run kb_sub({command:"merge_plan", target_branch:"main"}).
🛑 CONFIRM F58 — In the returned steps[] array, the submodule merge step
  has from:"feature/shared-only" (the submodule's actual branch),
  NOT from:"feature/parent-only" (the parent's branch). This was the
  F58 bug — merge_plan now correctly queries each repo's actual branch.

§10 — F57 (submodule_pattern_unresolved type)
- Edit knowledge/_rules.md to add a NEW code_path_patterns entry whose paths
  glob targets the REGISTERED `shared/` submodule from §9, at a path that
  has no actual matching files:
    - intent: shared-test
      kb_target: specs/features/shared-{name}.md
      paths: ["shared/missing-dir/**/*.ts"]
  Why a registered submodule is required: detection is gated on .gitmodules
  to avoid false-positive submodule guesses on typoed patterns. Without §9's
  `git submodule add`, this entry would (correctly) classify as orphan_pattern.
- Run kb_drift({mode:"current", include_pattern_audit:true}).
🛑 CONFIRM F57 — Mapping Diagnostics section shows the new pattern under a
  finding with type `submodule_pattern_unresolved` (NOT `orphan_pattern`).
  The badge reads "submodule" and the body text mentions "targets submodule
  scope but matched no files". Click Copy audit fix prompt — the prompt
  text references "submodule" guidance, not generic orphan guidance.

§11 — F55 (PURGE classified as system event)
- Run kb_drift({force_baseline:true, purge:true}) to write a PURGE drift-log
  entry. Then refresh panels.
- Switch to Activity tab. By default "Show system events" is OFF.
🛑 CONFIRM F55 — PURGE entries are HIDDEN by default (system event filter).
  Toggle "Show system events" ON. PURGE rows now appear with badge label
  "Baseline reset" (NOT "Unknown" — the F55 fix). Toggle back OFF.

§12 — F38 (plan-doc wording, no agent action)
- FYI: The plan §B.1 now correctly references `detected_stacks` (plural)
  for the array, with `detected_stack` as the scalar monorepo label.
  Confirmed during §2 above.

§13 — F45 (plan-doc wording, no agent action)
- FYI: Plan §B.3.3 now notes that kb_conform current mode requires both a
  rule edit AND a matching file change in the same commit. Confirmed during
  §7 above (we changed both the rule and AppointmentForm.tsx).

§14 — Cleanup
- rm -rf ~/kb-mcp-fixverify /tmp/fixverify-shared
- Final line MUST be: "Scenario B fix verification complete."
```

---

## Manual UI spot-checks (after §14, do these by hand in Obsidian / VS Code)

These don't fit the agent runbook — they're visual fixes:

1. **F46 (Obsidian)** — verified live in §8 but also try group-by `File` and `Lifecycle`. All modes should expand cards on click.
2. **F47 panel parity** — the "App scope" row should appear in both VS Code's webview detail panel AND Obsidian's expanded entry. Mismatch = panel-side regression.
3. **F55 system-events toggle** — try a few clicks; PURGE rows should disappear/reappear smoothly.
4. **F56 live-overlay** — write a brand-new KB file under `knowledge/decisions/` (no matching `code_path_patterns` entry). Wait for the live overlay to fire. It should NOT appear in the kb-drift preview bucket as a "0 code area(s)" row. (Still appears under Mapping Diagnostics' "Unmapped KB folder" finding — that's expected.)

---

## What's NOT covered by this prompt

- F39 hooks-only path (touched by §3 via mtimes, but if you want to deeply verify, run `kb_init` 10 times and confirm hooks `.git/hooks/*` mtimes never advance).
- F48 (kb_migrate `.obsidian` skip) — requires having an `.obsidian/` dir with `.md` files inside `knowledge/`. Skip unless your sandbox vault accumulated Obsidian plugin docs there.
- F50 — deferred to follow-up plan (tag-only matching is acknowledged limitation, not bug).

---

## Rollback

If any 🛑 CONFIRM fails, capture the divergent behavior in a note and revert the relevant commit from the fix branch. The fixes are committed per-finding-where-possible, so `git revert <sha>` targets a single finding without dragging others.
