/**
 * @module runStateMachine
 * @description Milestone 2 — Agent run state machine.
 * Provides retry-safe state transitions, valid transition guards,
 * timeout handling, and stale run detection.
 * All transitions are deterministic and reversible.
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
  // Happy path
  { from: 'queued', event: 'START', to: 'starting' },
  { from: 'starting', event: 'START', to: 'analyzing_repo' },
  { from: 'analyzing_repo', event: 'REPO_ANALYZED', to: 'building_graph' },
  { from: 'building_graph', event: 'GRAPH_BUILT', to: 'risk_analysis' },
  { from: 'risk_analysis', event: 'RISK_ASSESSED', to: 'planning' },
  { from: 'planning', event: 'PLAN_GENERATED', to: 'creating_pr' },
  { from: 'creating_pr', event: 'PR_CREATED', to: 'completed' },

  // Error transitions — any non-terminal state can fail
  { from: 'starting', event: 'ERROR', to: 'failed' },
  { from: 'analyzing_repo', event: 'ERROR', to: 'failed' },
  { from: 'building_graph', event: 'ERROR', to: 'failed' },
  { from: 'risk_analysis', event: 'ERROR', to: 'failed' },
  { from: 'planning', event: 'ERROR', to: 'failed' },
  { from: 'creating_pr', event: 'ERROR', to: 'failed' },

  // Cancel transitions
  { from: 'queued', event: 'CANCEL', to: 'cancelled' },
  { from: 'starting', event: 'CANCEL', to: 'cancelled' },
  { from: 'analyzing_repo', event: 'CANCEL', to: 'cancelled' },
  { from: 'building_graph', event: 'CANCEL', to: 'cancelled' },
  { from: 'risk_analysis', event: 'CANCEL', to: 'cancelled' },
  { from: 'planning', event: 'CANCEL', to: 'cancelled' },
  { from: 'creating_pr', event: 'CANCEL', to: 'cancelled' },

  // Retry — only from failed, goes back to queued
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
  creating_pr: 'Creating Pull Request',
  completed: 'Completed ✅',
  failed: 'Failed ❌',
  cancelled: 'Cancelled',
}

export const STATE_PROGRESS: Record<RunState, number> = {
  queued: 0,
  starting: 10,
  analyzing_repo: 25,
  building_graph: 40,
  risk_analysis: 55,
  planning: 70,
  creating_pr: 85,
  completed: 100,
  failed: 0,
  cancelled: 0,
}

export function getStateProgress(state: RunState): number {
  return STATE_PROGRESS[state] ?? 0
}
