/**
 * @module runStateMachine
 * @description Milestone 2 + 3 + 4 — Agent run state machine.
 * Provides retry-safe state transitions, valid transition guards,
 * timeout handling, and stale run detection.
 * M3 adds: patch_generation, patch_validation, sandbox_execution,
 * test_execution, self_healing, review_gate, pr_ready states.
 * M4 adds: workspace_setup, patch_application, dependency_install,
 * lint_execution, build_execution, artifact_upload, pr_materialization,
 * cleanup states.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RunState =
  | 'queued'
  | 'starting'
  | 'analyzing_repo'
  | 'building_graph'
  | 'risk_analysis'
  | 'planning'
  // M3 additions ↓
  | 'patch_generation'
  | 'patch_validation'
  | 'sandbox_execution'
  | 'test_execution'
  | 'self_healing'
  | 'review_gate'
  | 'pr_ready'
  // ↑ M3 additions
  // M4 additions ↓
  | 'workspace_setup'
  | 'patch_application'
  | 'dependency_install'
  | 'lint_execution'
  | 'build_execution'
  | 'artifact_upload'
  | 'pr_materialization'
  | 'cleanup'
  // ↑ M4 additions
  | 'creating_pr'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RunEvent =
  | 'START'
  | 'REPO_ANALYZED'
  | 'GRAPH_BUILT'
  | 'RISK_ASSESSED'
  | 'PLAN_GENERATED'
  // M3 additions ↓
  | 'PATCHES_GENERATED'
  | 'PATCHES_VALIDATED'
  | 'SANDBOX_PASSED'
  | 'TESTS_PASSED'
  | 'SELF_HEAL_DONE'
  | 'REVIEW_PASSED'
  | 'READY_FOR_PR'
  // ↑ M3 additions
  // M4 additions ↓
  | 'WORKSPACE_READY'
  | 'PATCHES_APPLIED'
  | 'DEPS_INSTALLED'
  | 'LINT_DONE'
  | 'BUILD_DONE'
  | 'ARTIFACTS_UPLOADED'
  | 'PR_MATERIALIZED'
  | 'CLEANUP_DONE'
  // ↑ M4 additions
  | 'PR_CREATED'
  | 'ERROR'
  | 'CANCEL'
  | 'RETRY'

export interface StateTransition {
  from: RunState
  event: RunEvent
  to: RunState
}

export interface RunStateContext {
  state: RunState
  runId: string
  enteredAt: number
  retryCount: number
  errorMessage?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition table
// ─────────────────────────────────────────────────────────────────────────────

const TRANSITIONS: StateTransition[] = [
  // ── Happy path (M1/M2 plan-only flow) ────────────────────────────────────
  { from: 'queued', event: 'START', to: 'starting' },
  { from: 'starting', event: 'START', to: 'analyzing_repo' },
  { from: 'analyzing_repo', event: 'REPO_ANALYZED', to: 'building_graph' },
  { from: 'building_graph', event: 'GRAPH_BUILT', to: 'risk_analysis' },
  { from: 'risk_analysis', event: 'RISK_ASSESSED', to: 'planning' },
  // Plan-only path (M1/M2): planning → creating_pr
  { from: 'planning', event: 'PLAN_GENERATED', to: 'creating_pr' },
  { from: 'creating_pr', event: 'PR_CREATED', to: 'completed' },

  // ── M3 code-generation path (planning → patch pipeline → review) ─────────
  { from: 'planning', event: 'PLAN_GENERATED', to: 'patch_generation' },
  { from: 'patch_generation', event: 'PATCHES_GENERATED', to: 'patch_validation' },
  { from: 'patch_validation', event: 'PATCHES_VALIDATED', to: 'sandbox_execution' },
  { from: 'sandbox_execution', event: 'SANDBOX_PASSED', to: 'test_execution' },
  { from: 'test_execution', event: 'TESTS_PASSED', to: 'review_gate' },
  { from: 'review_gate', event: 'REVIEW_PASSED', to: 'pr_ready' },
  { from: 'pr_ready', event: 'READY_FOR_PR', to: 'creating_pr' },

  // M3 self-heal loop
  { from: 'test_execution', event: 'ERROR', to: 'self_healing' },
  { from: 'sandbox_execution', event: 'ERROR', to: 'self_healing' },
  { from: 'self_healing', event: 'SELF_HEAL_DONE', to: 'sandbox_execution' },

  // ── M4 real execution path (patch_validation → workspace → execute → PR) ─
  { from: 'patch_validation', event: 'PATCHES_VALIDATED', to: 'workspace_setup' },
  { from: 'workspace_setup', event: 'WORKSPACE_READY', to: 'patch_application' },
  { from: 'patch_application', event: 'PATCHES_APPLIED', to: 'dependency_install' },
  { from: 'dependency_install', event: 'DEPS_INSTALLED', to: 'lint_execution' },
  { from: 'lint_execution', event: 'LINT_DONE', to: 'build_execution' },
  { from: 'build_execution', event: 'BUILD_DONE', to: 'test_execution' },
  { from: 'test_execution', event: 'TESTS_PASSED', to: 'artifact_upload' },
  { from: 'artifact_upload', event: 'ARTIFACTS_UPLOADED', to: 'review_gate' },
  { from: 'review_gate', event: 'REVIEW_PASSED', to: 'pr_materialization' },
  { from: 'pr_materialization', event: 'PR_MATERIALIZED', to: 'cleanup' },
  { from: 'cleanup', event: 'CLEANUP_DONE', to: 'completed' },

  // M4 self-heal from execution failures
  { from: 'lint_execution', event: 'ERROR', to: 'self_healing' },
  { from: 'build_execution', event: 'ERROR', to: 'self_healing' },
  { from: 'dependency_install', event: 'ERROR', to: 'self_healing' },
  { from: 'self_healing', event: 'SELF_HEAL_DONE', to: 'dependency_install' },

  // M4 cleanup on failure
  { from: 'patch_application', event: 'ERROR', to: 'cleanup' },
  { from: 'artifact_upload', event: 'ERROR', to: 'cleanup' },
  { from: 'pr_materialization', event: 'ERROR', to: 'cleanup' },

  // ── Error / cancel (any state) ───────────────────────────────────────────
  { from: 'queued', event: 'ERROR', to: 'failed' },
  { from: 'starting', event: 'ERROR', to: 'failed' },
  { from: 'analyzing_repo', event: 'ERROR', to: 'failed' },
  { from: 'building_graph', event: 'ERROR', to: 'failed' },
  { from: 'risk_analysis', event: 'ERROR', to: 'failed' },
  { from: 'planning', event: 'ERROR', to: 'failed' },
  { from: 'patch_generation', event: 'ERROR', to: 'failed' },
  { from: 'patch_validation', event: 'ERROR', to: 'failed' },
  { from: 'creating_pr', event: 'ERROR', to: 'failed' },
  { from: 'workspace_setup', event: 'ERROR', to: 'failed' },
  { from: 'cleanup', event: 'ERROR', to: 'failed' },

  // Cancel
  { from: 'queued', event: 'CANCEL', to: 'cancelled' },
  { from: 'starting', event: 'CANCEL', to: 'cancelled' },
  { from: 'analyzing_repo', event: 'CANCEL', to: 'cancelled' },
  { from: 'planning', event: 'CANCEL', to: 'cancelled' },
  { from: 'patch_generation', event: 'CANCEL', to: 'cancelled' },
  { from: 'workspace_setup', event: 'CANCEL', to: 'cancelled' },
  { from: 'patch_application', event: 'CANCEL', to: 'cancelled' },
  { from: 'dependency_install', event: 'CANCEL', to: 'cancelled' },
  { from: 'lint_execution', event: 'CANCEL', to: 'cancelled' },
  { from: 'build_execution', event: 'CANCEL', to: 'cancelled' },
  { from: 'test_execution', event: 'CANCEL', to: 'cancelled' },

  // ── Retry ────────────────────────────────────────────────────────────────
  { from: 'failed', event: 'RETRY', to: 'queued' },
]

// ─────────────────────────────────────────────────────────────────────────────
// State machine logic
// ─────────────────────────────────────────────────────────────────────────────

export function canTransition(from: RunState, event: RunEvent): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.event === event)
}

export function getNextState(from: RunState, event: RunEvent): RunState | null {
  const transition = TRANSITIONS.find((t) => t.from === from && t.event === event)
  return transition?.to ?? null
}

export function transition(ctx: RunStateContext, event: RunEvent): RunStateContext {
  const next = getNextState(ctx.state, event)
  if (!next) {
    return {
      ...ctx,
      errorMessage: `Invalid transition: ${ctx.state} + ${event}`,
    }
  }
  return {
    ...ctx,
    state: next,
    enteredAt: Date.now(),
    retryCount: event === 'RETRY' ? ctx.retryCount + 1 : ctx.retryCount,
    errorMessage: event === 'ERROR' ? ctx.errorMessage : undefined,
  }
}

export function createInitialContext(runId: string): RunStateContext {
  return {
    state: 'queued',
    runId,
    enteredAt: Date.now(),
    retryCount: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale / timeout detection
// ─────────────────────────────────────────────────────────────────────────────

const STATE_TIMEOUTS_MS: Partial<Record<RunState, number>> = {
  queued: 10 * 60_000,           // 10 min
  starting: 2 * 60_000,         // 2 min
  analyzing_repo: 5 * 60_000,   // 5 min
  building_graph: 5 * 60_000,   // 5 min
  risk_analysis: 3 * 60_000,    // 3 min
  planning: 10 * 60_000,        // 10 min
  patch_generation: 10 * 60_000, // 10 min
  patch_validation: 2 * 60_000,  // 2 min
  workspace_setup: 3 * 60_000,   // 3 min
  patch_application: 3 * 60_000, // 3 min
  dependency_install: 5 * 60_000, // 5 min
  lint_execution: 5 * 60_000,    // 5 min
  build_execution: 10 * 60_000,  // 10 min
  test_execution: 10 * 60_000,   // 10 min
  sandbox_execution: 10 * 60_000, // 10 min
  self_healing: 5 * 60_000,      // 5 min
  review_gate: 2 * 60_000,       // 2 min
  artifact_upload: 3 * 60_000,   // 3 min
  pr_materialization: 3 * 60_000, // 3 min
  pr_ready: 5 * 60_000,         // 5 min
  creating_pr: 5 * 60_000,      // 5 min
  cleanup: 3 * 60_000,          // 3 min
}

export function isStale(ctx: RunStateContext): boolean {
  const timeout = STATE_TIMEOUTS_MS[ctx.state]
  if (!timeout) return false
  return Date.now() - ctx.enteredAt > timeout
}

export const MAX_RETRIES = 3

export function canRetry(ctx: RunStateContext): boolean {
  return ctx.state === 'failed' && ctx.retryCount < MAX_RETRIES
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isTerminal(state: RunState): boolean {
  return ['completed', 'failed', 'cancelled'].includes(state)
}

export function isM4State(state: RunState): boolean {
  return [
    'workspace_setup',
    'patch_application',
    'dependency_install',
    'lint_execution',
    'build_execution',
    'artifact_upload',
    'pr_materialization',
    'cleanup',
  ].includes(state)
}

export function getAllStates(): RunState[] {
  const states = new Set<RunState>()
  for (const t of TRANSITIONS) {
    states.add(t.from)
    states.add(t.to)
  }
  return [...states]
}

export function getValidEvents(state: RunState): RunEvent[] {
  return TRANSITIONS.filter((t) => t.from === state).map((t) => t.event)
}
