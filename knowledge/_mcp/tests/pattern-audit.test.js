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
    kb_target: 'specs/features/{name}.md',
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
    patterns: [{ intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/legacy/**'] }],
    sourceFiles: ['src/new/Foo.ts'],
    kbFiles: ['specs/features/foo.md'],
  })
  const orphan = findings.find(f => f.type === 'orphan_pattern')
  assert.ok(orphan, 'orphan_pattern emitted')
  assert.equal(orphan.kb_target, 'specs/features/{name}.md')
})

test('auditPatterns emits submodule_pattern_unresolved (not orphan_pattern) when paths target a submodule with no matches', () => {
  // F57 — submodule-scoped patterns that resolve to no files deserve a
  // distinct finding type from truly-dead orphan patterns. The agent
  // guidance differs: submodule patterns may be waiting for files to be
  // added, whereas orphan patterns are usually obsolete.
  const { findings } = auditPatterns({
    patterns: [{ intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['sub-a/src/**'] }],
    sourceFiles: ['src/Foo.ts'],
    kbFiles: [],
    submodulePaths: ['sub-a'],
  })
  const orphan = findings.find(f => f.type === 'orphan_pattern')
  assert.equal(orphan, undefined, 'should NOT emit orphan_pattern for submodule-scoped patterns')
  const submodFinding = findings.find(f => f.type === 'submodule_pattern_unresolved')
  assert.ok(submodFinding, 'submodule_pattern_unresolved emitted')
  assert.equal(submodFinding.is_submodule_pattern, true)
})

// ── auditPatterns: ghost_target ─────────────────────────────────────────────

test('auditPatterns flags ghost_target only for hardcoded targets pointing at missing files', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'config', kb_target: 'standards/code/missing.md', paths: ['package.json'] },
      { intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/**'] }, // template — never ghost
    ],
    sourceFiles: ['package.json', 'src/auth.ts'],
    kbFiles: ['specs/features/auth.md'],
  })
  const ghosts = findings.filter(f => f.type === 'ghost_target')
  assert.equal(ghosts.length, 1)
  assert.equal(ghosts[0].resolved_target, 'standards/code/missing.md')
})

// ── auditPatterns: convention_violation ─────────────────────────────────────

test('auditPatterns flags convention_violation when intent does not match folder', () => {
  const { findings } = auditPatterns({
    patterns: [
      { intent: 'form', kb_target: 'specs/flows/login.md', paths: ['src/**Form*'] }, // form should target features/
    ],
    sourceFiles: ['src/LoginForm.tsx'],
    kbFiles: ['specs/flows/login.md'],
  })
  const v = findings.find(f => f.type === 'convention_violation')
  assert.ok(v)
  assert.equal(v.expected_folder, 'specs/features/')
  assert.equal(v.source, 'preset', 'convention_violation must declare preset provenance')
})

test('auditPatterns does not flag convention_violation when intent and folder agree', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'form', kb_target: 'specs/features/login.md', paths: ['src/**Form*'] }],
    sourceFiles: ['src/LoginForm.tsx'],
    kbFiles: ['specs/features/login.md'],
  })
  assert.equal(findings.filter(f => f.type === 'convention_violation').length, 0)
})

// ── auditPatterns: unmapped_kb_group ────────────────────────────────────────

test('auditPatterns aggregates unmapped KB files by folder', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/features/**'] }],
    sourceFiles: ['src/features/auth.ts'],
    kbFiles: [
      'specs/features/auth.md',           // covered by pattern
      'specs/flows/checkout.md',          // not covered
      'specs/flows/onboarding.md',        // not covered, same folder
      'integrations/stripe.md',     // not covered, different folder
    ],
  })
  const groups = findings.filter(f => f.type === 'unmapped_kb_group')
  // One finding per folder
  assert.equal(groups.length, 2)
  const flows = groups.find(g => g.folder === 'specs/flows/')
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
  const r = checkSingleKbFile('specs/features/new-feature.md', [
    { intent: 'config', kb_target: 'standards/code/conventions.md', paths: ['tsconfig.json'] },
  ])
  assert.equal(r.unmapped, true)
  assert.ok(r.suggested_pattern)
  assert.equal(r.suggested_pattern.kb_target, 'specs/features/{name}.md')
  assert.equal(r.suggested_pattern.intent, 'form')  // first conv-table match for features/
})

test('checkSingleKbFile reports not-unmapped when a template pattern covers the file', () => {
  const r = checkSingleKbFile('specs/features/auth.md', [
    { intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/**'] },
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
    kb_target: 'specs/features/{name}.md',
    paths: ['src/auth/**', 'src/profile/**', 'src/settings/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/settings/**', 'src/auth/**', 'src/profile/**'],
  })
  assert.equal(a, b, 'reordering paths must not change fingerprint')
})

test('computePatternFingerprint is stable when a duplicate path is added', () => {
  const a = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/auth/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/auth/**', 'src/auth/**'],
  })
  assert.equal(a, b, 'duplicate paths must not change fingerprint')
})

test('computePatternFingerprint is stable when name_extraction object keys reorder', () => {
  const a = computePatternFingerprint({
    intent: 'form',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/**Form*'],
    name_extraction: { case: 'kebab', strip_suffix: ['Form', 'Page'] },
  })
  const b = computePatternFingerprint({
    intent: 'form',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/**Form*'],
    name_extraction: { strip_suffix: ['Form', 'Page'], case: 'kebab' },
  })
  assert.equal(a, b, 'YAML key reorder must not change fingerprint')
})

test('computePatternFingerprint DOES change when a meaningful field changes', () => {
  const a = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/auth/**'],
  })
  const b = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/authentication/**'],   // semantic change
  })
  assert.notEqual(a, b, 'changing a paths glob must invalidate the fingerprint')
})

test('computePatternFingerprint format matches sha256: prefix', () => {
  const fp = computePatternFingerprint({
    intent: 'feature',
    kb_target: 'specs/features/{name}.md',
    paths: ['src/**'],
  })
  assert.match(fp, /^sha256:[a-f0-9]{16}$/, 'fingerprint shape must be sha256:<16-hex>')
})

// ── findPatternForKbTarget ───────────────────────────────────────────────

test('findPatternForKbTarget matches template patterns by regex shape', () => {
  const patterns = [
    { intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/**'] },
    { intent: 'config', kb_target: 'standards/code/conventions.md', paths: ['tsconfig.json'] },
  ]
  const r = findPatternForKbTarget('specs/features/auth.md', patterns)
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
    { intent: 'feature', kb_target: 'specs/features/{name}.md', paths: ['src/**'] },
  ]
  assert.equal(findPatternForKbTarget('specs/flows/checkout.md', patterns), null)
})

// ── array-form kb_target (alternative-targets fallback) ─────────────────────

test('validateCodePathPattern accepts array kb_target', () => {
  const r = validateCodePathPattern({
    intent: 'feature',
    kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'],
    paths: ['src/**Controller*'],
  })
  assert.equal(r.valid, true, `unexpected errors: ${r.errors.join(', ')}`)
})

test('validateCodePathPattern rejects empty array kb_target', () => {
  const r = validateCodePathPattern({ kb_target: [], paths: ['src/**'] })
  assert.equal(r.valid, false)
  assert.match(r.errors.join(' '), /kb_target array must be non-empty/)
})

test('validateCodePathPattern rejects array with non-string entries', () => {
  const r = validateCodePathPattern({ kb_target: ['ok.md', 42], paths: ['src/**'] })
  assert.equal(r.valid, false)
  assert.match(r.errors.join(' '), /kb_target array entries must be strings/)
})

test('auditPatterns: ghost_target skips array-form with a {name} alternative', () => {
  // Mixed array (one literal missing, one {name} template) — templated overall, no ghost.
  const { findings } = auditPatterns({
    patterns: [{ kb_target: ['legacy/dropped.md', 'specs/features/{name}.md'], paths: ['src/**'] }],
    sourceFiles: ['src/foo.js'],
    kbFiles: [],
  })
  assert.equal(findings.some(f => f.type === 'ghost_target'), false)
})

test('auditPatterns: ghost_target fires when all hardcoded array candidates are missing', () => {
  const { findings } = auditPatterns({
    patterns: [{ kb_target: ['legacy/a.md', 'legacy/b.md'], paths: ['src/**'] }],
    sourceFiles: ['src/foo.js'],
    kbFiles: ['specs/features/other.md'],
  })
  const ghost = findings.find(f => f.type === 'ghost_target')
  assert.ok(ghost)
  // resolved_target should be the first candidate (canonical scaffold path)
  assert.equal(ghost.resolved_target, 'legacy/a.md')
})

test('auditPatterns: ghost_target suppressed when ANY hardcoded array candidate exists', () => {
  const { findings } = auditPatterns({
    patterns: [{ kb_target: ['legacy/missing.md', 'specs/features/buffer-definitions.md'], paths: ['src/**'] }],
    sourceFiles: ['src/foo.js'],
    kbFiles: ['specs/features/buffer-definitions.md'],
  })
  assert.equal(findings.some(f => f.type === 'ghost_target'), false)
})

test('auditPatterns: convention_violation fires when any array candidate is in the wrong folder', () => {
  const { findings } = auditPatterns({
    patterns: [{ intent: 'api-contract', kb_target: ['specs/features/{name}.md', 'data/{name}.md'], paths: ['src/**Controller*'] }],
    sourceFiles: ['src/FooController.java'],
    kbFiles: [],
  })
  assert.ok(findings.some(f => f.type === 'convention_violation'))
})

test('checkSingleKbFile reports not-unmapped when array-form template matches', () => {
  const r = checkSingleKbFile('specs/features/auth.md', [
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], paths: ['src/**'] },
  ])
  assert.equal(r.unmapped, false)
})

test('checkSingleKbFile reports not-unmapped when plural-alias candidate matches', () => {
  // Singular template misses, plural template hits — array form keeps the file mapped.
  const r = checkSingleKbFile('specs/features/buffer-definitions.md', [
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], paths: ['src/**'] },
  ])
  assert.equal(r.unmapped, false)
})

test('findPatternForKbTarget matches when target appears in array-form candidate', () => {
  const patterns = [
    { kb_target: ['specs/features/{name}.md', 'specs/features/{name}s.md'], paths: ['src/**'] },
  ]
  const r = findPatternForKbTarget('specs/features/buffer-definitions.md', patterns)
  assert.ok(r)
})
