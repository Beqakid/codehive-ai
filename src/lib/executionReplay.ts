/**
 * @module executionReplay
 * @description Milestone 4 — Execution replay and debugging system.
 * Records every step of an execution for later replay/debugging.
 * Stores step sequence, execution order, retry attempts, repair attempts,
 * and failure snapshots.
 *
 * Enables:
 *   - Timeline viewer for debugging failed runs
 *   - Step-by-step execution replay
 *   - Failure analysis across runs
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ReplayEventType =
  | 'workspace_created'
  | 'workspace_ready'
  | 'patches_received'
  | 'patch_applied'
  | 'patch_rejected'
  | 'execution_started'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'self_heal_started'
  | 'self_heal_applied'
  | 'self_heal_failed'
  | 'validation_passed'
  | 'validation_failed'
  | 'review_gate_checked'
  | 'pr_created'
  | 'cleanup_started'
  | 'cleanup_completed'
  | 'error'

export interface ReplayEvent {
  eventId: string
  timestamp: number
  type: ReplayEventType
  stepIndex: number
  data: Record<string, unknown>
  durationMs?: number
  error?: string
}

export interface ReplaySession {
  sessionId: string
  runId: string
  projectId: string
  workspaceId: string
  startedAt: number
  completedAt: number | null
  status: 'recording' | 'completed' | 'failed'
  events: ReplayEvent[]
  totalSteps: number
  failedSteps: number
  healAttempts: number
  metadata: Record<string, unknown>
}

export interface ReplayTimeline {
  runId: string
  totalDurationMs: number
  phases: ReplayPhase[]
  failurePoints: ReplayEvent[]
  healingAttempts: ReplayEvent[]
}

export interface ReplayPhase {
  name: string
  startedAt: number
  completedAt: number | null
  durationMs: number
  status: 'completed' | 'failed' | 'skipped'
  eventCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────

export function createReplaySession(
  runId: string,
  projectId: string,
  workspaceId: string,
): ReplaySession {
  return {
    sessionId: generateSessionId(),
    runId,
    projectId,
    workspaceId,
    startedAt: Date.now(),
    completedAt: null,
    status: 'recording',
    events: [],
    totalSteps: 0,
    failedSteps: 0,
    healAttempts: 0,
    metadata: {},
  }
}

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `replay-${timestamp}-${random}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Event recording
// ─────────────────────────────────────────────────────────────────────────────

export function recordEvent(
  session: ReplaySession,
  type: ReplayEventType,
  data: Record<string, unknown> = {},
  error?: string,
): ReplaySession {
  const event: ReplayEvent = {
    eventId: `evt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type,
    stepIndex: session.events.length,
    data,
    error,
  }

  const updatedEvents = [...session.events, event]
  const failedSteps = type.includes('failed') ? session.failedSteps + 1 : session.failedSteps
  const healAttempts = type === 'self_heal_started' ? session.healAttempts + 1 : session.healAttempts

  return {
    ...session,
    events: updatedEvents,
    totalSteps: updatedEvents.length,
    failedSteps,
    healAttempts,
  }
}

export function completeSession(
  session: ReplaySession,
  success: boolean,
): ReplaySession {
  return {
    ...session,
    completedAt: Date.now(),
    status: success ? 'completed' : 'failed',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline generation
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_NAMES: Record<string, string> = {
  workspace: 'Workspace Setup',
  patch: 'Patch Application',
  execution: 'Execution Pipeline',
  step: 'Execution Step',
  self_heal: 'Self-Healing',
  validation: 'Validation',
  review_gate: 'Review Gate',
  pr: 'PR Creation',
  cleanup: 'Cleanup',
}

export function buildTimeline(session: ReplaySession): ReplayTimeline {
  const phases: ReplayPhase[] = []
  const failurePoints: ReplayEvent[] = []
  const healingAttempts: ReplayEvent[] = []

  // Group events into phases
  const phaseGroups = new Map<string, ReplayEvent[]>()
  for (const event of session.events) {
    const phaseKey = event.type.split('_')[0]
    const existing = phaseGroups.get(phaseKey) || []
    existing.push(event)
    phaseGroups.set(phaseKey, existing)

    if (event.type.includes('failed') || event.error) {
      failurePoints.push(event)
    }
    if (event.type.startsWith('self_heal')) {
      healingAttempts.push(event)
    }
  }

  for (const [key, events] of phaseGroups) {
    const sorted = events.sort((a, b) => a.timestamp - b.timestamp)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const hasFailed = sorted.some((e) => e.type.includes('failed') || e.error)

    phases.push({
      name: PHASE_NAMES[key] || key,
      startedAt: first.timestamp,
      completedAt: last.timestamp,
      durationMs: last.timestamp - first.timestamp,
      status: hasFailed ? 'failed' : 'completed',
      eventCount: sorted.length,
    })
  }

  const totalDurationMs = session.completedAt
    ? session.completedAt - session.startedAt
    : Date.now() - session.startedAt

  return {
    runId: session.runId,
    totalDurationMs,
    phases: phases.sort((a, b) => a.startedAt - b.startedAt),
    failurePoints,
    healingAttempts,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization for D1 storage
// ─────────────────────────────────────────────────────────────────────────────

export function serializeSession(session: ReplaySession): Record<string, unknown> {
  return {
    sessionId: session.sessionId,
    runId: session.runId,
    projectId: session.projectId,
    workspaceId: session.workspaceId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    status: session.status,
    events: JSON.stringify(session.events),
    totalSteps: session.totalSteps,
    failedSteps: session.failedSteps,
    healAttempts: session.healAttempts,
    metadata: JSON.stringify(session.metadata),
  }
}

export function deserializeSession(data: Record<string, unknown>): ReplaySession {
  return {
    sessionId: data.sessionId as string,
    runId: data.runId as string,
    projectId: data.projectId as string,
    workspaceId: data.workspaceId as string,
    startedAt: data.startedAt as number,
    completedAt: (data.completedAt as number) || null,
    status: data.status as ReplaySession['status'],
    events: typeof data.events === 'string' ? JSON.parse(data.events) : (data.events as ReplayEvent[]) || [],
    totalSteps: (data.totalSteps as number) || 0,
    failedSteps: (data.failedSteps as number) || 0,
    healAttempts: (data.healAttempts as number) || 0,
    metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata as Record<string, unknown>) || {},
  }
}
