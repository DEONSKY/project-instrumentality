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

export interface PromptOverrides {
  base_dir?: string
  override_dir?: string
  valid_override_types?: string[]
  suppress_requires_reason?: boolean
  protected?: string[]
  [key: string]: unknown
}

// The raw parsed _rules.md frontmatter. Loose — author-written YAML with more
// optional keys than enumerated here.
export interface RawRules {
  version?: string
  depth_policy?: DepthPolicy
  secret_patterns?: string[]
  code_path_patterns?: Array<Record<string, unknown>>
  prompt_overrides?: PromptOverrides
  working_paths_cap?: number
  standards_threshold?: number
  app_root_patterns?: Record<string, unknown>
  [key: string]: unknown
}

// The rules accessor object returned by loadRules().
export interface Rules {
  getDepthPolicy: () => DepthPolicy
  getSecretPatterns: () => string[]
  getCodePathPatterns: () => Array<Record<string, unknown>>
  getPromptOverrides: () => PromptOverrides
  getWorkingPathsCap: () => number
  getStandardsThreshold: () => number
  getAppRootPatterns: () => Record<string, unknown>
  getRaw: () => RawRules
}
