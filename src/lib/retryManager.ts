/**
 * M6 Retry Manager
 *
 * Handles retry logic with exponential backoff for failed pipeline steps.
 */

import type { Payload } from 'payload'
import { updateStepStatus, getAsyncRunState, updateRunStatus } from './asyncPipeline'
import { emitRunEvent } from './runEventEmitter'
import type { StepName } from './asyncPipeline'

export interface RetryDecision {
  allowed: boolean
  reason: string
  retryCount: number
  maxRetries: number
  backoffMs: number
}

// ─── Evaluate Retry ──────────────────────────────────────────────────

export function evaluateRetry(
  retryCount: number,
  maxRetries: number
): RetryDecision {
  if (retryCount >= maxRetries) {
    return {
      allowed: false,
      reason: `Max retries reached (${retryCount}/${maxRetries})`,
      retryCount,
      maxRetries,
      backoffMs: 0,
    }
  }

  // Exponential backoff: 1s, 2s, 4s, 8s...
  const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000)

  return {
    allowed: true,
    reason: `Retry ${retryCount + 1}/${maxRetries}`,
    retryCount: retryCount + 1,
    maxRetries,
    backoffMs,
  }
}

// ─── Retry a Failed Step ─────────────────────────────────────────────

export async function retryFailedStep(
  payload: Payload,
  runId: string,
  stepName: StepName
): Promise<RetryDecision> {
  const state = await getAsyncRunState(payload, runId)
  if (!state) {
    return { allowed: false, reason: 'Run not found', retryCount: 0, maxRetries: 0, backoffMs: 0 }
  }

  const step = state.steps.find((s: any) => s.stepName === stepName)
  if (!step) {
    return { allowed: false, reason: 'Step not found', retryCount: 0, maxRetries: 0, backoffMs: 0 }
  }

  if (step.status !== 'failed') {
    return {
      allowed: false,
      reason: `Step is not in failed state (current: ${step.status})`,
      retryCount: step.retryCount || 0,
      maxRetries: step.maxRetries || 3,
      backoffMs: 0,
    }
  }

  const decision = evaluateRetry(step.retryCount || 0, step.maxRetries || 3)

  if (decision.allowed) {
    // Reset step to 'ready' for re-execution
    await updateStepStatus(payload, runId, stepName, {
      status: 'ready',
      error: null,
      output: null,
      markdown: null,
      retryCount: decision.retryCount,
    })

    // Reset run status if it was failed
    if (state.run.status === 'failed') {
      await updateRunStatus(payload, runId, {
        status: 'processing',
        error: null,
      } as any)
    }

    await emitRunEvent(payload, {
      runId,
      stepName,
      eventType: 'step_retry',
      message: `Retrying step: ${stepName} (attempt ${decision.retryCount})`,
      data: JSON.stringify({ backoffMs: decision.backoffMs }),
    })
  }

  return decision
}
