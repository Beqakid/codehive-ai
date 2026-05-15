/**
 * Feature flags for CodeHive AI
 * Set env vars to override defaults.
 */
export const FEATURE_FLAGS = {
  /** Milestone 1 — Repo-aware planning agent with PR creation. Default: ON */
  M1_PLANNING: process.env.M1_PLANNING_ENABLED !== 'false',
}
