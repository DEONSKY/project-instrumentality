const { test } = require('node:test')
const assert = require('node:assert/strict')

const { trimDriftLog } = require('../tools/status')

// The agent-facing kb_status payload summarizes the (often 100+ entry) drift
// event log to a count + the most recent few + a pointer. The extension's
// shared getStatus is NOT affected — it never calls this wrapper trim.

function makeSummary(n) {
  return {
    currentHeadShort: 'abc1234',
    driftLogEvents: Array.from({ length: n }, (_, i) => ({ eventType: 'detected', at: `e${i}` })),
    totals: { foo: 1 }
  }
}

test('trimDriftLog replaces driftLogEvents with count + recent + path', () => {
  const out = trimDriftLog(makeSummary(110))
  assert.ok(!('driftLogEvents' in out), 'full array removed from agent payload')
  assert.equal(out.driftLogEventCount, 110)
  assert.equal(out.recentDriftLogEvents.length, 5)
  // Recent should be the LAST five (most recent).
  assert.equal(out.recentDriftLogEvents[4].at, 'e109')
  assert.match(out.driftLogPath, /drift-log/)
  // Unrelated fields pass through untouched.
  assert.equal(out.currentHeadShort, 'abc1234')
  assert.deepEqual(out.totals, { foo: 1 })
})

test('trimDriftLog keeps all events when fewer than the recent cap', () => {
  const out = trimDriftLog(makeSummary(3))
  assert.equal(out.driftLogEventCount, 3)
  assert.equal(out.recentDriftLogEvents.length, 3)
})

test('trimDriftLog is a no-op when driftLogEvents is absent', () => {
  const summary = { currentHeadShort: 'x' }
  assert.deepEqual(trimDriftLog(summary), summary)
})
