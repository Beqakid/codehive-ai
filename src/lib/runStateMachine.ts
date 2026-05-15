/**
 * @module runStateMachine
 * @description Milestone 2 + 3 — Agent run state machine.
 * Provides retry-safe state transitions, valid transition guards,
 * timeout handling, and stale run detection.
 * M3 adds: patch_generation, patch_validation, sandbox_execution,
 * test_execution, self_healing, review_gate, pr_ready states.
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

  // ── M3 patch generation flow ─────────────────────────────────────────────
  // After planning, if patch mode: planning → patch_generation
  { from: 'planning', event: 'PATCHES_GENERATED', to: 'patch_generation' },
  { from: 'patch_generation', event: 'PATCHES_VALIDATED', to: 'patch_validation' },
  { from: 'patch_validation', event: 'SANDBOX_PASSED', to: 'sandbox_execution' },
  { from: 'sandbox_execution', event: 'TESTS_PASSED', to: 'test_execution' },
  // From test_execution: either self-heal or go to review
  { from: 'test_execution', event: 'REVIEW_PASSED', to: 'review_gate' },
  { from: 'test_execution', event: 'SELF_HEAL_DONE', to: 'self_healing' },
  // Self-healing goes back to patch_validation for re-check
  { from: 'self_healing', event: 'PATCHES_VALIDATED', to: 'patch_validation' },
  // Review gate leads to PR-ready
  { from: 'review_gate', event: 'READY_FOR_PR', to: 'pr_ready' },
  // PR-ready creates the PR
  { from: 'pr_ready', event: 'PR_CREATED', to: 'completed' },

  // ── Error transitions — any non-terminal state can fail ──────────────────
  { from: 'starting', event: 'ERROR', to: 'failed' },
  { from: 'analyzing_repo', event: 'ERROR', to: 'failed' },
  { from: 'building_graph', event: 'ERROR', to: 'failed' },
  { from: 'risk_analysis', event: 'ERROR', to: 'failed' },
  { from: 'planning', event: 'ERROR', to: 'failed' },
  { from: 'patch_generation', event: 'ERROR', to: 'failed' },
  { from: 'patch_validation', event: 'ERROR', to: 'failed' },
  { from: 'sandbox_execution', event: 'ERROR', to: 'failed' },
  { from: 'test_execution', event: 'ERROR', to: 'failed' },
  { from: 'self_healing', event: 'ERROR', to: 'failed' },
  { from: 'review_gate', event: 'ERROR', to: 'failed' },
  { from: 'pr_ready', event: 'ERROR', to: 'failed' },
  { from: 'creating_pr', event: 'ERROR', to: 'failed' },

  // ── Cancel transitions ──────────────────────────────────────────────────
  { from: 'queued', event: 'CANCEL', to: 'cancelled' },
  { from: 'starting', event: 'CANCEL', to: 'cancelled' },
  { from: 'analyzing_repo', event: 'CANCEL', to: 'cancelled' },
  { from: 'building_graph', event: 'CANCEL', to: 'cancelled' },
  { from: 'risk_analysis', event: 'CANCEL', to: 'cancelled' },
  { from: 'planning', event: 'CANCEL', to: 'cancelled' },
  { from: 'patch_generation', event: 'CANCEL', to: 'cancelled' },
  { from: 'patch_validation', event: 'CANCEL', to: 'cancelled' },
  { from: 'sandbox_execution', event: 'CANCEL', to: 'cancelled' },
  { from: 'test_execution', event: 'CANCEL', to: 'cancelled' },
  { from: 'self_healing', event: 'CANCEL', to: 'cancelled' },
  { from: 'review_gate', event: 'CANCEL', to: 'cancelled' },
  { from: 'pr_ready', event: 'CANCEL', to: 'cancelled' },
  { from: 'creating_pr', event: 'CANCEL', to: 'cancelled' },

  // ── Retry — only from failed, goes back to queued ───────────────────────
  { from: 'failed', event: 'RETRY', to: 'queued' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Terminal states
// ─────────────────────────────────────────────────────────────────────────────

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set(['completed', 'failed', 'cancelled'])

export function isTerminal(state: RunState): boolean {
  return TERMINAL_STATES.has(state)
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt a state transition. Returns the new state or throws if invalid.
 */
export function transition(currentState: RunState, event: RunEvent): RunState {
  if (isTerminal(currentState) && event !== 'RETRY') {
    throw new Error(
      `Cannot transition from terminal state "${currentState}" with event "${event}"`,
    )
  }

  const match = TRANSITIONS.find((t) => t.from === currentState && t.event === event)
  if (!match) {
    throw new Error(
      `Invalid transition: "${currentState}" + "${event}" has no valid target state`,
    )
  }

  return match.to
}

/**
 * Safe transition — returns null instead of throwing on invalid input.
 */
export function safeTransition(currentState: RunState, event: RunEvent): RunState | null {
  try {
    return transition(currentState, event)
  } catch {
    return null
  }
}

/**
 * Returns all valid events from a given state.
 */
export function validEventsFrom(state: RunState): RunEvent[] {
  return TRANSITIONS.filter((t) => t.from === state).map((t) => t.event)
}

/**
 * Returns all valid target states from a given state.
 */
export function validNextStates(state: RunState): RunState[] {
  return TRANSITIONS.filter((t) => t.from === state).map((t) => t.to)
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout detection
// ─────────────────────────────────────────────────────────────────────────────

/** Max time in ms a run can spend in each non-terminal state before considered stale */
const STATE_TIMEOUTS_MS: Record<RunState, number> = {
  queued: 5 * 60 * 1000,           // 5 minutes
  starting: 2 * 60 * 1000,         // 2 minutes
  analyzing_repo: 3 * 60 * 1000,   // 3 minutes
  building_graph: 2 * 60 * 1000,   // 2 minutes
  risk_analysis: 2 * 60 * 1000,    // 2 minutes
  planning: 5 * 60 * 1000,         // 5 minutes
  patch_generation: 5 * 60 * 1000, // 5 minutes (M3)
  patch_validation: 2 * 60 * 1000, // 2 minutes (M3)
  sandbox_execution: 10 * 60 * 1000, // 10 minutes (M3 — sandbox can be slow)
  test_execution: 10 * 60 * 1000,  // 10 minutes (M3)
  self_healing: 5 * 60 * 1000,     // 5 minutes (M3)
  review_gate: 30 * 60 * 1000,     // 30 minutes (M3 — human may need to approve)
  pr_ready: 3 * 60 * 1000,         // 3 minutes (M3)
  creating_pr: 3 * 60 * 1000,      // 3 minutes
  completed: Infinity,
  failed: Infinity,
  cancelled: Infinity,
}

export function isRunStale(context: RunStateContext, nowMs = Date.now()): boolean {
  if (isTerminal(context.state)) return false
  const maxAge = STATE_TIMEOUTS_MS[context.state] ?? 5 * 60 * 1000
  return nowMs - context.enteredAt > maxAge
}

// ─────────────────────────────────────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────────────────────────────────────

export function createRunContext(runId: string): RunStateContext {
  return {
    state: 'queued',
    runId,
    enteredAt: Date.now(),
    retryCount: 0,
  }
}

export function applyEvent(
  context: RunStateContext,
  event: RunEvent,
  errorMessage?: string,
): RunStateContext {
  const newState = transition(context.state, event)
  return {
    ...context,
    state: newState,
    enteredAt: Date.now(),
    retryCount: event === 'RETRY' ? context.retryCount + 1 : context.retryCount,
    errorMessage: event === 'ERROR' ? errorMessage : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable labels
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_LABELS: Record<RunState, string> = {
  queued: 'Queued',
  starting: 'Starting…',
  analyzing_repo: 'Analyzing Repository',
  building_graph: 'Building Dependency Graph',
  risk_analysis: 'Assessing Risk',
  planning: 'Generating Plan',
  patch_generation: 'Generating Code Patches',
  patch_validation: 'Validating Patches',
  sandbox_execution: 'Running Sandbox',
  test_execution: 'Running Tests',
  self_healing: 'Self-Healing',
  review_gate: 'Awaiting Review',
  pr_ready: 'Preparing PR',
  creating_pr: 'Creating Pull Request',
  completed: 'Completed ✅',
  failed: 'Failed ❌',
  cancelled: 'Cancelled',
}

export const STATE_PROGRESS: Record<RunState, number> = {
  queued: 0,
  starting: 5,
  analyzing_repo: 12,
  building_graph: 20,
  risk_analysis: 28,
  planning: 35,
  patch_generation: 45,
  patch_validation: 55,
  sandbox_execution: 65,
  test_execution: 72,
  self_healing: 75,
  review_gate: 82,
  pr_ready: 90,
  creating_pr: 95,
  completed: 100,
  failed: 0,
  cancelled: 0,
}

export function getStateProgress(state: RunState): number {
  return STATE_PROGRESS[state] ?? 0
}
