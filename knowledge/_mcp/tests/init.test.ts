const { test } = require('node:test')
const assert = require('node:assert/strict')
const { _internal } = require('../tools/init')
const { generateAppRootPatterns, generateRulesContent } = _internal

// ── F44: app_root_patterns emission on monorepo ───────────────────────────────

test('generateAppRootPatterns emits commented example when no monorepo', () => {
  const out = generateAppRootPatterns({ stack: 'go', submoduleStacks: [] })
  assert.match(out, /^#\s*app_root_patterns:/m, 'should emit commented example for single-stack project')
  // Must NOT emit an uncommented app_root_patterns: line
  assert.equal(/^app_root_patterns:/m.test(out), false, 'no uncommented block for single-stack')
})

test('generateAppRootPatterns emits uncommented block for monorepo with multiple stacks', () => {
  const out = generateAppRootPatterns({
    stack: 'monorepo',
    submoduleStacks: [
      { dir: 'frontend', stack: 'react-vite' },
      { dir: 'backend', stack: 'go' },
    ],
  })
  // Uncommented app_root_patterns: line at column 0
  assert.match(out, /^app_root_patterns:/m, 'uncommented block emitted')
  // Each sub-app dir is mapped to its own app_scope label
  assert.match(out, /"frontend\/\*\*":\s*frontend/, 'frontend dir mapping')
  assert.match(out, /"backend\/\*\*":\s*backend/, 'backend dir mapping')
})

test('generateAppRootPatterns dedups duplicate dirs', () => {
  const out = generateAppRootPatterns({
    stack: 'monorepo',
    submoduleStacks: [
      { dir: 'frontend', stack: 'react-vite' },
      { dir: 'frontend', stack: 'vue' }, // duplicate dir, different stack
    ],
  })
  const lines = out.split('\n').filter(l => l.includes('frontend'))
  // Only one frontend/** line (not two)
  assert.equal(lines.filter(l => l.startsWith('  "frontend/**":')).length, 1, 'frontend dir appears only once')
})

test('generateAppRootPatterns falls back to commented example when no submoduleStacks', () => {
  const out = generateAppRootPatterns({ stack: 'monorepo', submoduleStacks: [] })
  // Even with stack=monorepo, if there are no submodule stacks identified,
  // fall back to the commented example (nothing to derive from)
  assert.match(out, /^#\s*app_root_patterns:/m)
  assert.equal(/^app_root_patterns:/m.test(out), false)
})

// ── F44 integration: generateRulesContent includes the block for monorepo ─────

test('generateRulesContent emits uncommented app_root_patterns when monorepo detected', () => {
  const out = generateRulesContent(
    { projectName: 'Test' },
    {
      stack: 'monorepo',
      submoduleStacks: [
        { dir: 'frontend', stack: 'react-vite' },
        { dir: 'backend', stack: 'go' },
      ],
    }
  )
  assert.match(out, /^app_root_patterns:/m, 'rules content includes uncommented block')
  assert.match(out, /"frontend\/\*\*":\s*frontend/)
  assert.match(out, /"backend\/\*\*":\s*backend/)
})

test('generateRulesContent omits uncommented app_root_patterns for single-stack', () => {
  const out = generateRulesContent(
    { projectName: 'Test' },
    { stack: 'go', submoduleStacks: [] }
  )
  // Must include the commented example for discoverability
  assert.match(out, /^#\s*app_root_patterns:/m)
  // Must NOT include uncommented block
  assert.equal(/^app_root_patterns:/m.test(out), false)
})
