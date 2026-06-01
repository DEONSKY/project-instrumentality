// Shapes for the KB graph index (knowledge/_index.yaml), loaded by lib/graph.
//
// The index is hand-and-tool-maintained YAML; entries are loosely structured
// and tools read many optional fields. These interfaces capture the fields the
// code actually touches and allow extra keys via the index signature, so we get
// real typing on the hot paths without over-constraining the on-disk format.

export type AppScope = string | string[]

export interface GraphEntry {
  id?: string
  type?: string
  app_scope?: AppScope
  depends_on?: string[]
  affects_flows?: string[]
  always_load?: boolean
  rules?: unknown[]
  // The on-disk index carries more optional fields than are enumerated here.
  [key: string]: unknown
}

export interface GraphGroup {
  [key: string]: unknown
}

export interface Graph {
  version: string
  files: Record<string, GraphEntry>
  groups: Record<string, GraphGroup>
}

// One edge-type invariant for validateEdges(). Ships empty in lib/graph.
export interface EdgeRule {
  edge: string
  targetType?: string
  targetTypeNot?: string
  message: string
}
