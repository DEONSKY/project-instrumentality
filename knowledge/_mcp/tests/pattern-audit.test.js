const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  auditPatterns,
  validateCodePathPattern,
  checkSingleKbFile,
  computePatternFingerprint,
  findPatternForKbTarget,
} = require('../lib/pattern-audit')

// ── validateCodePathPattern ─────────────────────────────────────────────────

test('validateCodePathPattern accepts a well-formed pattern', () => {
  const r = validateCodePathPattern({
    intent: 'form',
    kb_target: 'features/{name}.md',
    paths: ['src/components/**Form*'],
    name_extraction: { strip_suffix: ['Form'], case: 'kebab' },
  })
  assert.equal(r.valid, true, `unexpected errors: ${r.errors.join(', ')}`)
})

test('validateCodePathPattern rejects missing kb_target', () => {
  const r = validateCodePathPattern({ paths: ['src/**'] })
  assert.equal(r.valid, false)
  assert.match(r.errors.join(' '), /kb_target/)
})

test('validateCodePathPattern rejects missing or empty paths', () => {
  const r1 = validateCodePathPattern({ kb_target: 'x.md' })
  assert.equal(r1.valid, false)
  assert.match(r1.errors.join(' '), /paths required/)
  const r2 = validateCodePathPattern({ kb_target: 'x.md', paths: [] })
  assert.equal(r2.valid, false)
})

test('validateCodePathPattern rejects non-string path entries', () => {
  const r = validateCodePathPattern({ kb_target: 'x.md', paths: [123] })
  assert.equal(r.valid, false)
  assert.match(r.errors.join(' '), /string globs/)
})

test('validateCodePathPattern rejects bad name_extraction.case', () => {
  const r = validateCodePathPattern({
    kb_target: 'x.md',
    paths: ['src/**'],
    name_extraction: { case: 'spongebob' },
  })
  assert.equal(r.valid, false)
  assert.match(r.errors.join(' '), /name_extraction\.case/)
})

// ── auditPatterns: orphan_pattern ───────────────────────────────────────────

test('auditPatterns flags orphan_pattern when paths match no source files', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/legacy/**'] }],
    sourceFiles: ['src/new/Foo.ts'],
    kbFiles: ['features/foo.md'],
  })
  const orphan = findings.find(f => f.type === 'orphan_pattern')
  assert.ok(orphan, 'orphan_pattern emitted')
  assert.equal(orphan.kb_target, 'features/{name}.md')
})

test('auditPatterns marks orphan_pattern with is_submodule_pattern when paths target a submodule', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'feature', kb_target: 'features/{name}.md', paths: ['sub-a/src/**'] }],
    sourceFiles: ['src/Foo.ts'],
    kbFiles: [],
    submodulePaths: ['sub-a'],
  })
  const orphan = findings.find(f => f.type === 'orphan_pattern')
  assert.ok(orphan)
  assert.equal(orphan.is_submodule_pattern, true)
})

// ── auditPatterns: ghost_target ─────────────────────────────────────────────

test('auditPatterns flags ghost_target only for hardcoded targets pointing at missing files', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'config', kb_target: 'standards/code/missing.md', paths: ['package.json'] },
      { intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/**'] }, // template — never ghost
    ],
    sourceFiles: ['package.json', 'src/auth.ts'],
    kbFiles: ['features/auth.md'],
  })
  const ghosts = findings.filter(f => f.type === 'ghost_target')
  assert.equal(ghosts.length, 1)
  assert.equal(ghosts[0].resolved_target, 'standards/code/missing.md')
})

// ── auditPatterns: convention_violation ─────────────────────────────────────

test('auditPatterns flags convention_violation when intent does not match folder', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'form', kb_target: 'flows/login.md', paths: ['src/**Form*'] }, // form should target features/
    ],
    sourceFiles: ['src/LoginForm.tsx'],
    kbFiles: ['flows/login.md'],
  })
  const v = findings.find(f => f.type === 'convention_violation')
  assert.ok(v)
  assert.equal(v.expected_folder, 'features/')
  assert.equal(v.source, 'preset', 'convention_violation must declare preset provenance')
})

test('auditPatterns does not flag convention_violation when intent and folder agree', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'form', kb_target: 'features/login.md', paths: ['src/**Form*'] }],
    sourceFiles: ['src/LoginForm.tsx'],
    kbFiles: ['features/login.md'],
  })
  assert.equal(findings.filter(f => f.type === 'convention_violation').length, 0)
})

// ── auditPatterns: unmapped_kb_group ────────────────────────────────────────

test('auditPatterns aggregates unmapped KB files by folder', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/features/**'] }],
    sourceFiles: ['src/features/auth.ts'],
    kbFiles: [
      'features/auth.md',           // covered by pattern
      'flows/checkout.md',          // not covered
      'flows/onboarding.md',        // not covered, same folder
      'integrations/stripe.md',     // not covered, different folder
    ],
  })
  const groups = findings.filter(f => f.type === 'unmapped_kb_group')
  // One finding per folder
  assert.equal(groups.length, 2)
  const flows = groups.find(g => g.folder === 'flows/')
  assert.ok(flows)
  assert.equal(flows.count, 2)
})

// ── auditPatterns: fanout_with_hardcoded ────────────────────────────────────

test('auditPatterns flags fanout_with_hardcoded when one hardcoded target catches many distinct concepts', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'component', kb_target: 'components/all.md', paths: ['src/components/**'] },
    ],
    sourceFiles: [
      'src/components/Auth.tsx',
      'src/components/Profile.tsx',
      'src/components/Settings.tsx',
      'src/components/Dashboard.tsx',
      'src/components/Header.tsx',
    ],
    kbFiles: ['components/all.md'],
  })
  const f = findings.find(x => x.type === 'fanout_with_hardcoded')
  assert.ok(f)
  assert.equal(f.kb_target, 'components/all.md')
  assert.ok(f.distinct_concepts >= 5)
})

test('auditPatterns does not flag fanout_with_hardcoded for template targets', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'component', kb_target: 'components/{name}.md', paths: ['src/components/**'] },
    ],
    sourceFiles: [
      'src/components/Auth.tsx', 'src/components/Profile.tsx',
      'src/components/Settings.tsx', 'src/components/Dashboard.tsx',
      'src/components/Header.tsx', 'src/components/Footer.tsx',
    ],
    kbFiles: [],
  })
  assert.equal(findings.filter(f => f.type === 'fanout_with_hardcoded').length, 0)
})

// ── checkSingleKbFile ───────────────────────────────────────────────────────

test('checkSingleKbFile reports unmapped when no pattern targets the file', () => {
  const r = checkSingleKbFile('features/new-feature.md', [
    { intent: 'config', kb_target: 'standards/code/conventions.md', paths: ['tsconfig.json'] },
  ])
  assert.equal(r.unmapped, true)
  assert.ok(r.suggested_pattern)
  assert.equal(r.suggested_pattern.kb_target, 'features/{name}.md')
  assert.equal(r.suggested_pattern.intent, 'form')  // first conv-table match for features/
})

test('checkSingleKbFile reports not-unmapped when a template pattern covers the file', () => {
  const r = checkSingleKbFile('features/auth.md', [
    { intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/**'] },
  ])
  assert.equal(r.unmapped, false)
})

test('checkSingleKbFile reports not-unmapped when a hardcoded pattern matches exactly', () => {
  const r = checkSingleKbFile('standards/code/tech-stack.md', [
    { intent: 'dependency', kb_target: 'standards/code/tech-stack.md', paths: ['package.json'] },
  ])
  assert.equal(r.unmapped, false)
})

// ── computePatternFingerprint — round-trip stability under cosmetic edits ──

test('computePatternFingerprint is stable when paths are reordered', () => {
  const a = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/auth/**', 'src/profile/**', 'src/settings/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/settings/**', 'src/auth/**', 'src/profile/**'],
  })
  assert.equal(a, b, 'reordering paths must not change fingerprint')
})

test('computePatternFingerprint is stable when a duplicate path is added', () => {
  const a = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/auth/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/auth/**', 'src/auth/**'],
  })
  assert.equal(a, b, 'duplicate paths must not change fingerprint')
})

test('computePatternFingerprint is stable when name_extraction object keys reorder', () => {
  const a = computePatternFingerprint({
    intent: 'form',
    kb_target: 'features/{name}.md',
    paths: ['src/**Form*'],
    name_extraction: { case: 'kebab', strip_suffix: ['Form', 'Page'] },
  })
  const b = computePatternFingerprint({
    intent: 'form',
    kb_target: 'features/{name}.md',
    paths: ['src/**Form*'],
    name_extraction: { strip_suffix: ['Form', 'Page'], case: 'kebab' },
  })
  assert.equal(a, b, 'YAML key reorder must not change fingerprint')
})

test('computePatternFingerprint DOES change when a meaningful field changes', () => {
  const a = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/auth/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/authentication/**'],   // semantic change
  })
  assert.notEqual(a, b, 'changing a paths glob must invalidate the fingerprint')
})

test('computePatternFingerprint format matches sha256: prefix', () => {
  const fp = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'features/{name}.md',
    paths: ['src/**'],
  })
  assert.match(fp, /^sha256:[a-f0-9]{16}$/, 'fingerprint shape must be sha256:<16-hex>')
})

// ── findPatternForKbTarget ───────────────────────────────────────────────

test('findPatternForKbTarget matches template patterns by regex shape', () => {
  const patterns = [
    { intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/**'] },
    { intent: 'config', kb_target: 'standards/code/conventions.md', paths: ['tsconfig.json'] },
  ]
  const r = findPatternForKbTarget('features/auth.md', patterns)
  assert.ok(r)
  assert.equal(r.intent, 'feature')
})

test('findPatternForKbTarget matches hardcoded patterns by exact equality', () => {
  const patterns = [
    { intent: 'config', kb_target: 'standards/code/conventions.md', paths: ['tsconfig.json'] },
  ]
  const r = findPatternForKbTarget('standards/code/conventions.md', patterns)
  assert.ok(r)
  assert.equal(r.intent, 'config')
})

test('findPatternForKbTarget returns null when no pattern matches', () => {
  const patterns = [
    { intent: 'feature', kb_target: 'features/{name}.md', paths: ['src/**'] },
  ]
  assert.equal(findPatternForKbTarget('flows/checkout.md', patterns), null)
})
