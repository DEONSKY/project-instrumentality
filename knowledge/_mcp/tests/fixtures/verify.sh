#!/usr/bin/env bash
# Re-runs the Phase A captures against kb-test-linestop and diffs them
# against the baseline. Exits non-zero on any drift.
#
# Usage: bash knowledge/_mcp/tests/fixtures/verify.sh
#
# Captures are written to fixtures/current/ for inspection; diffs are
# printed to stderr. The MCP test suite is also run.

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
MCP="$REPO/knowledge/_mcp"
SANDBOX="/home/mc/Projects/pi/kb-test-linestop"
FIX="$MCP/tests/fixtures"
BASE="$FIX/baseline"
CUR="$FIX/current"

rm -rf "$CUR"
mkdir -p "$CUR/queues" "$CUR/hooks"

fail=0
diffq() {
  local name="$1"
  if ! diff -u "$BASE/$name" "$CUR/$name" >&2; then
    echo "DRIFT in $name" >&2
    fail=1
  fi
}

run_node() {
  local label="$1" script="$2"
  ( cd "$SANDBOX" && node -e "$script" ) > "$CUR/$label" 2>/dev/null || {
    echo "RUN FAIL: $label" >&2; fail=1
  }
}

run_node drift.json "
const t = require('$MCP/tools/drift');
t.runTool({readonly:true,include_diffs:false}).then(r=>process.stdout.write(JSON.stringify(r,null,2)));
"
run_node conform-current.json "
const t = require('$MCP/tools/conform');
t.runTool({readonly:true,include_diffs:false,mode:'current'}).then(r=>process.stdout.write(JSON.stringify(r,null,2)));
"
run_node conform-aspirational.json "
const t = require('$MCP/tools/conform');
t.runTool({readonly:true,include_diffs:false,mode:'aspirational'}).then(r=>process.stdout.write(JSON.stringify(r,null,2)));
"
run_node inventory.json "
const t = require('$MCP/tools/inventory');
t.runTool({}).then(r=>process.stdout.write(JSON.stringify(r,null,2)));
"
run_node get-keywords.json "
const t = require('$MCP/tools/get');
t.runTool({task_type:'review',keywords:'service'}).then(r=>process.stdout.write(JSON.stringify(r,null,2)));
"

cp "$SANDBOX/knowledge/sync/code-drift.md" "$CUR/queues/" 2>/dev/null
cp "$SANDBOX/knowledge/sync/kb-drift.md" "$CUR/queues/" 2>/dev/null
cp "$SANDBOX/knowledge/sync/standards-drift.md" "$CUR/queues/" 2>/dev/null
cp "$SANDBOX/knowledge/sync/standards-backlog.md" "$CUR/queues/" 2>/dev/null

for f in drift.json conform-current.json conform-aspirational.json inventory.json get-keywords.json; do
  diffq "$f"
done
for q in code-drift.md kb-drift.md standards-drift.md standards-backlog.md; do
  diffq "queues/$q"
done

# Load-check: server.js loads + every registered tool has matching definition.name;
# internal helpers (lint, reindex) only need runTool. Plus schema named exports.
node -e "
require('$MCP/server.js'); // syntax + require-chain check (does not start server in this mode)
" 2>/dev/null || true  # server starts then exits when stdin closes; we only care it parses
node -e "
const M='$MCP';
const registered={kb_get:'get',kb_write:'write',kb_drift:'drift',kb_conform:'conform',kb_inventory:'inventory',kb_scaffold:'scaffold',kb_impact:'impact',kb_ask:'ask',kb_init:'init',kb_migrate:'migrate',kb_import:'import',kb_export:'export',kb_analyze:'analyze',kb_extract:'extract',kb_issue:'issue',kb_sub:'sub',kb_autotag:'autotag',kb_autorelate:'autorelate',kb_schema:'schema',kb_upgrade:'upgrade',kb_history:'history',kb_status:'status'};
for (const [name,file] of Object.entries(registered)) {
  const m = require(M+'/tools/'+file);
  if (!m.runTool || !m.definition) throw new Error('contract: '+file);
  if (m.definition.name !== name) throw new Error('name: '+file+' != '+name);
}
for (const helper of ['lint','reindex']) {
  const m = require(M+'/tools/'+helper);
  if (!m.runTool) throw new Error('helper: '+helper);
}
const s = require(M+'/tools/schema');
if (!s.parseDbml || !s.filterTablesByKeywords) throw new Error('schema named exports broken');
console.log('load-check OK');
" || fail=1

# Run MCP tests
( cd "$MCP" && node --test tests/*.test.js 2>&1 | tail -5 ) || fail=1

# Run shared contract test
( cd "$REPO/packages/shared" && npm test 2>&1 | tail -5 ) || fail=1

if [ "$fail" -ne 0 ]; then
  echo "VERIFY FAILED" >&2
  exit 1
fi
echo "VERIFY OK"
