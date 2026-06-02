const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')

const tracker = require('../lib/fs-tracker')
tracker.install()

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fs-tracker-test-'))
}

test('writeFileSync is tracked as written', () => {
  const dir = mkTempDir()
  try {
    tracker.beginCall()
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello')
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { written: ['a.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('appendFileSync is tracked as written', () => {
  const dir = mkTempDir()
  try {
    fs.writeFileSync(path.join(dir, 'log.txt'), '')
    tracker.beginCall()
    fs.appendFileSync(path.join(dir, 'log.txt'), 'line\n')
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { written: ['log.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('copyFileSync records the destination as written', () => {
  const dir = mkTempDir()
  try {
    fs.writeFileSync(path.join(dir, 'src.txt'), 'x')
    tracker.beginCall()
    fs.copyFileSync(path.join(dir, 'src.txt'), path.join(dir, 'dst.txt'))
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { written: ['dst.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('unlinkSync is tracked as deleted', () => {
  const dir = mkTempDir()
  try {
    fs.writeFileSync(path.join(dir, 'gone.txt'), 'x')
    tracker.beginCall()
    fs.unlinkSync(path.join(dir, 'gone.txt'))
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { deleted: ['gone.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('renameSync is tracked as renamed', () => {
  const dir = mkTempDir()
  try {
    fs.writeFileSync(path.join(dir, 'old.txt'), 'x')
    tracker.beginCall()
    fs.renameSync(path.join(dir, 'old.txt'), path.join(dir, 'new.txt'))
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { renamed: [{ from: 'old.txt', to: 'new.txt' }] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('multiple writes deduplicate and sort', () => {
  const dir = mkTempDir()
  try {
    tracker.beginCall()
    fs.writeFileSync(path.join(dir, 'b.txt'), '1')
    fs.writeFileSync(path.join(dir, 'a.txt'), '1')
    fs.writeFileSync(path.join(dir, 'b.txt'), '2')
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { written: ['a.txt', 'b.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('writes outside cwd surface with a relative path back up the tree', () => {
  const root = mkTempDir()
  try {
    const sub = path.join(root, 'sub')
    fs.mkdirSync(sub)
    tracker.beginCall()
    fs.writeFileSync(path.join(root, 'outside.txt'), 'x')
    const out = tracker.endCall(sub)
    assert.deepEqual(out, { written: [path.join('..', 'outside.txt')] })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('no tracked operations returns null', () => {
  const dir = mkTempDir()
  try {
    tracker.beginCall()
    const out = tracker.endCall(dir)
    assert.equal(out, null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('writes outside an active scope are ignored', () => {
  const dir = mkTempDir()
  try {
    // No beginCall — writes should not be captured into any leaked state.
    fs.writeFileSync(path.join(dir, 'leaked.txt'), 'x')
    // Now open a scope; the previous write must not appear.
    tracker.beginCall()
    fs.writeFileSync(path.join(dir, 'inside.txt'), 'x')
    const out = tracker.endCall(dir)
    assert.deepEqual(out, { written: ['inside.txt'] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('combined writes, deletes, and renames in one scope', () => {
  const dir = mkTempDir()
  try {
    fs.writeFileSync(path.join(dir, 'old.txt'), 'x')
    fs.writeFileSync(path.join(dir, 'doomed.txt'), 'x')
    tracker.beginCall()
    fs.writeFileSync(path.join(dir, 'fresh.txt'), 'x')
    fs.unlinkSync(path.join(dir, 'doomed.txt'))
    fs.renameSync(path.join(dir, 'old.txt'), path.join(dir, 'renamed.txt'))
    const out = tracker.endCall(dir)
    assert.deepEqual(out, {
      written: ['fresh.txt'],
      deleted: ['doomed.txt'],
      renamed: [{ from: 'old.txt', to: 'renamed.txt' }]
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
