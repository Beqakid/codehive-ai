/**
 * Feature flags for CodeHive AI
 * Set env vars to override defaults.
 * All new features are individually toggleable.
 */
export const FEATURE_FLAGS = {
  /** Milestone 1 — Repo-aware planning agent with PR creation. Default: ON */
  M1_PLANNING: process.env.M1_PLANNING_ENABLED !== 'false',

  /** Milestone 2 — Repo intelligence scanning + persistence */
  M2_REPO_INTELLIGENCE: process.env.M2_REPO_INTELLIGENCE_ENABLED !== 'false',

  /** Milestone 2 — Dependency graph analysis */
  M2_DEPENDENCY_GRAPH: process.env.M2_DEPENDENCY_GRAPH_ENABLED !== 'false',

  /** Milestone 2 — Protected file detection */
  M2_PROTECTED_FILES: process.env.M2_PROTECTED_FILES_ENABLED !== 'false',

  /** Milestone 2 — Risk scoring engine */
  M2_RISK_ENGINE: process.env.M2_RISK_ENGINE_ENABLED !== 'false',

  /** Milestone 2 — Run state machine (extended statuses) */
  M2_STATE_MACHINE: process.env.M2_STATE_MACHINE_ENABLED !== 'false',

  /** Milestone 2 — Enriched planner context (passes intelligence + risk to AI) */
  M2_ENRICHED_PLANNER: process.env.M2_ENRICHED_PLANNER_ENABLED !== 'false',

  /** Milestone 3 — Safe patch generation via AI */
  M3_PATCH_GENERATION: process.env.M3_PATCH_GENERATION_ENABLED !== 'false',

  /** Milestone 3 — Edit scope restrictions */
  M3_EDIT_SCOPE: process.env.M3_EDIT_SCOPE_ENABLED !== 'false',

  /** Milestone 3 — Patch validation pipeline */
  M3_PATCH_VALIDATION: process.env.M3_PATCH_VALIDATION_ENABLED !== 'false',

  /** Milestone 3 — Sandbox execution (test/lint/build) */
  M3_SANDBOX: process.env.M3_SANDBOX_ENABLED !== 'false',

  /** Milestone 3 — Self-healing loop (limited auto-repair) */
  M3_SELF_HEALING: process.env.M3_SELF_HEALING_ENABLED !== 'false',

  /** Milestone 3 — Review gates (approval enforcement) */
  M3_REVIEW_GATES: process.env.M3_REVIEW_GATES_ENABLED !== 'false',

  /** Milestone 3 — Diff review UI */
  M3_DIFF_REVIEW: process.env.M3_DIFF_REVIEW_ENABLED !== 'false',

  /** Milestone 3 — Rollback planning */
  M3_ROLLBACK_PLANNING: process.env.M3_ROLLBACK_PLANNING_ENABLED !== 'false',
}
