---
version: "1.0"
project_name: "My Project"
app_names: [app]
_detected_stack: "unknown"

depth_policy:
  default_max: 3
  group_trigger: 5
  group_warn: 8
  overrides:
    features: 3
    flows: 2
    ui: 2
    integrations: 2
    data: 2
    validation: 1
    decisions: 1
    foundation: 1
    sync: 1
  never_group:
    - data
    - validation
    - decisions
    - foundation
    - sync

secret_patterns:
  - sk_live_
  - "Bearer "
  - private_key
  - "password:"
  - "api_key:"
  - "secret:"

cross_app_refs:
  always_shared:
    - data
    - validation
    - integrations
    - decisions
    - foundation

code_path_patterns:
  # No stack auto-detected. Copy source patterns from knowledge/_mcp/presets/<stack>.yaml
  # and paste them here. The dependency and config intents below work for all stacks.
  - intent: dependency
    kb_target: "foundation/tech-stack.md"
    paths:
      - "package.json"
      - "package-lock.json"
      - "yarn.lock"
      - "pnpm-lock.yaml"
      - "go.mod"
      - "go.sum"
      - "pom.xml"
      - "build.gradle"
      - "build.gradle.kts"
      - "requirements.txt"
      - "pyproject.toml"
      - "Gemfile"
      - "Cargo.toml"
  - intent: config
    kb_target: "foundation/conventions.md"
    paths:
      - "tsconfig.json"
      - "tsconfig.*.json"
      - ".eslintrc*"
      - "eslint.config.*"
      - ".prettierrc*"

prompt_overrides:
  base_dir: "knowledge/_templates/prompts"
  override_dir: "knowledge/_prompt-overrides"
  valid_override_types:
    - replace
    - extend-before
    - extend-after
    - suppress
    - section-replace
  suppress_requires_reason: true
  protected:
    - drift-summary
    - ask-sync
---

# Knowledge Base Rules

This file configures the KB-MCP system. Edit the YAML front-matter above to configure:
- Folder depth limits
- Secret patterns to block
- Code path patterns for drift detection
- Prompt override settings

See knowledge/_mcp/presets/ for stack-specific code_path_patterns presets.
