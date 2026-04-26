const fs = require('fs')
const { execSync } = require('child_process')
const { globMatch } = require('./patterns')

/**
 * Cheap mechanical detectors used by kb_conform Phase 1 to filter out files
 * that don't need LLM evaluation. Each function returns a result describing
 * whether the rule excludes the file (n/a) or passes the filter (continue).
 *
 * No LLM dispatch lives here — that happens in the agent via the conform-check
 * prompt. Phase 1.5 receives judgments back and MCP queues the failures.
 */

/**
 * Path filter — checks file against the rule's applies_to.paths globs.
 * Returns { matches: boolean }. If matches is false, the rule is n/a for this file.
 */
function applyPathFilter(rule, filePath) {
  const paths = (rule.applies_to && rule.applies_to.paths) || []
  if (paths.length === 0) return { matches: true } // no filter = applies to all
  for (const p of paths) {
    if (globMatch(filePath, p)) return { matches: true }
  }
  return { matches: false }
}

/**
 * Exceptions filter — checks file against rule.exceptions[].paths globs.
 * Returns { excluded: boolean, exceptionEntry?: object }. The matching entry's
 * reason is recorded in the n/a audit so the resolution stays visible.
 *
 * Phase 2 `exempted` adds an entry here, so subsequent runs short-circuit
 * without ever invoking the LLM judge — that's the whole point of exempted.
 */
function applyExceptions(rule, filePath) {
  const exceptions = Array.isArray(rule.exceptions) ? rule.exceptions : []
  for (const ex of exceptions) {
    const paths = Array.isArray(ex.paths) ? ex.paths : []
    for (const p of paths) {
      if (globMatch(filePath, p)) {
        return { excluded: true, exceptionEntry: ex }
      }
    }
  }
  return { excluded: false }
}

/**
 * Min-lines pre-filter. Used for size-dependent rules ("complex screen needs
 * routing" → fire only on files >200 lines). Reads the file lazily — caller
 * passes already-read content when available to avoid double-read.
 */
function applyMinLines(rule, fileContentOrPath) {
  const min = rule.applies_to && rule.applies_to.min_lines
  if (!Number.isInteger(min) || min <= 0) return { passes: true }
  let content
  if (typeof fileContentOrPath === 'string' && fileContentOrPath.includes('\n')) {
    content = fileContentOrPath
  } else if (typeof fileContentOrPath === 'string') {
    try { content = fs.readFileSync(fileContentOrPath, 'utf8') } catch { return { passes: false } }
  }
  if (!content) return { passes: false }
  const lineCount = content.split('\n').length
  return { passes: lineCount >= min, lineCount }
}

/**
 * Regex detector. The rule's detect.pattern is compiled and tested against the
 * file content. Polarity convention: a match means the rule fires (violation),
 * so the caller treats `matched: true` as a deterministic FAIL and `false` as
 * a deterministic PASS — no LLM round-trip needed.
 *
 * Returns { kind: 'regex', verdict: 'fail'|'pass'|'error', error?, matchCount? }.
 */
function runRegex(rule, fileContent) {
  const pattern = rule.detect && rule.detect.pattern
  if (!pattern) return { kind: 'regex', verdict: 'error', error: 'detect.pattern missing for kind: regex' }
  let re
  try { re = new RegExp(pattern, 'gm') } catch (e) {
    return { kind: 'regex', verdict: 'error', error: `invalid regex: ${e.message}` }
  }
  const matches = fileContent.match(re)
  return matches && matches.length > 0
    ? { kind: 'regex', verdict: 'fail', matchCount: matches.length }
    : { kind: 'regex', verdict: 'pass' }
}

/**
 * ast-grep detector. Shells out to `ast-grep run -p <pattern> <file>`. If the
 * binary isn't installed, degrades to a regex hint with a one-time warning so
 * the rule still produces a verdict (best-effort) rather than blocking the
 * whole conform run.
 *
 * Returns { kind: 'ast-grep', verdict: 'fail'|'pass'|'error'|'unavailable', error? }.
 */
let _astGrepAvailable = null
function isAstGrepAvailable() {
  if (_astGrepAvailable !== null) return _astGrepAvailable
  try {
    execSync('ast-grep --version', { stdio: 'ignore' })
    _astGrepAvailable = true
  } catch {
    _astGrepAvailable = false
  }
  return _astGrepAvailable
}

function runAstGrep(rule, filePath) {
  const pattern = rule.detect && rule.detect.pattern
  if (!pattern) return { kind: 'ast-grep', verdict: 'error', error: 'detect.pattern missing for kind: ast-grep' }
  if (!isAstGrepAvailable()) {
    return { kind: 'ast-grep', verdict: 'unavailable', error: 'ast-grep binary not installed; rule will fall back to LLM judgment' }
  }
  try {
    const out = execSync(`ast-grep run -p ${JSON.stringify(pattern)} ${JSON.stringify(filePath)}`, {
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString().trim()
    return out ? { kind: 'ast-grep', verdict: 'fail' } : { kind: 'ast-grep', verdict: 'pass' }
  } catch (e) {
    return { kind: 'ast-grep', verdict: 'error', error: e.message }
  }
}

/**
 * Run the full pre-filter cascade for a single rule against a file. Encodes the
 * documented order so callers don't have to: path → exceptions → min_lines →
 * regex/ast-grep. Returns one of:
 *
 *   { decision: 'na', reason }            — rule does not apply (recorded as n/a)
 *   { decision: 'fail', verdict }         — deterministic failure (no LLM needed)
 *   { decision: 'pass', verdict }         — deterministic pass (no LLM needed)
 *   { decision: 'llm', verdict? }         — survivor; agent must judge via prompt
 *
 * `verdict` carries the underlying detector result so the caller can surface
 * errors (e.g. ast-grep unavailable) in the audit log.
 */
function preFilter(rule, filePath, fileContent) {
  const path = applyPathFilter(rule, filePath)
  if (!path.matches) return { decision: 'na', reason: 'applies_to.paths did not match' }

  const ex = applyExceptions(rule, filePath)
  if (ex.excluded) {
    return {
      decision: 'na',
      reason: `exempted: ${ex.exceptionEntry && ex.exceptionEntry.reason ? ex.exceptionEntry.reason : 'matched exception entry'}`
    }
  }

  const lines = applyMinLines(rule, fileContent || filePath)
  if (!lines.passes) {
    return { decision: 'na', reason: `applies_to.min_lines (${rule.applies_to.min_lines}) not met (${lines.lineCount || 'unknown'} lines)` }
  }

  const detectKind = rule.detect && rule.detect.kind
  if (detectKind === 'regex') {
    const v = runRegex(rule, fileContent || '')
    if (v.verdict === 'fail') return { decision: 'fail', verdict: v }
    if (v.verdict === 'pass') return { decision: 'pass', verdict: v }
    // error → fall through to LLM so the rule isn't silently dropped
    return { decision: 'llm', verdict: v }
  }
  if (detectKind === 'ast-grep') {
    const v = runAstGrep(rule, filePath)
    if (v.verdict === 'fail') return { decision: 'fail', verdict: v }
    if (v.verdict === 'pass') return { decision: 'pass', verdict: v }
    if (v.verdict === 'unavailable') return { decision: 'llm', verdict: v }
    return { decision: 'llm', verdict: v }
  }

  // detect.kind: llm (or unset) → caller must invoke LLM via conform-check
  return { decision: 'llm' }
}

module.exports = {
  applyPathFilter,
  applyExceptions,
  applyMinLines,
  runRegex,
  runAstGrep,
  isAstGrepAvailable,
  preFilter
}
