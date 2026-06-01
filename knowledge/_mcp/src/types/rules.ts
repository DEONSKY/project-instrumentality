// Shared shapes for the kb-mcp rules object (knowledge/_rules.md config).
//
// The full Rules implementation lives in lib/rules.js and converts in Phase 2;
// these interfaces describe the parts that leaf modules consume so they can be
// typed now without depending on the not-yet-converted module. Keep in lockstep
// with lib/rules.js getDefaultRules() when that file is converted.

export interface DepthPolicy {
  default_max?: number
  overrides?: Record<string, number>
  never_group?: string[]
}

// The rules accessor object returned by loadRules(). Only the getters consumed
// by already-converted modules are declared; extend as more callers convert.
export interface Rules {
  getDepthPolicy: () => DepthPolicy
}
