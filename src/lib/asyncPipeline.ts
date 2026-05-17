/**
 * M6 Async Pipeline Engine
 *
 * Creates durable async runs that execute agent steps one-at-a-time
 * via self-chaining HTTP requests. Each step gets its own CF Workers
 * CPU budget. State is persisted in D1 for full resumability.
 *
 * Flow:
 *   POST /api/m6/run → createAsyncRun() → enqueue first step
 *     → process endpoint runs step 1 → saves result → chains step 2
 *     → process endpoint runs step 2 → saves result → chains step 3
 *     → ... → all steps done → mark run complete
 */

import type { Payload } from 'payload'
import { emitRunEvent } from './runEventEmitter'

// ─── Types ────────────────────────────────────────────────────────────

export type AsyncRunStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stalled'

export type AsyncStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export const PIPELINE_STEPS = [
  'product',
  'repo_intelligence',
  'architect',
  'risk_gate',
  'code',
  'patch_validation',
  'sandbox',
  'test',
  'fix',
  'reviewer',
  'memory',
  'pr_materialization',
] as const

export type StepName = (typeof PIPELINE_STEPS)[number]

export interface AsyncRunInput {
  projectId: string
  projectName: string
  repoOwner: string
  repoName: string
  title: string
  description: string
  branch?: string
}

export interface AsyncRunRecord {
  runId: string
  projectId: string
  projectName: string
  repoOwner: string
  repoName: string
  title: string
  description: string
  branch: string
  status: AsyncRunStatus
  currentStep: string
  totalSteps: number
  completedSteps: number
  failedSteps: number
  heartbeatAt: string
  startedAt: string
  completedAt: string | null
  durationMs: number
  error: string | null
  metadata: string
}

export interface AsyncStepRecord {
  runId: string
  stepName: StepName
  stepIndex: number
  status: AsyncStepStatus
  model: string | null
  output: string | null
  markdown: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  durationMs: number
  retryCount: number
  maxRetries: number
}

// ─── Generate Run ID ──────────────────────────────────────────────────

export function generateAsyncRunId(): string {
  return `m6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Create Async Run ─────────────────────────────────────────────────

export async function createAsyncRun(
  payload: Payload,
  input: AsyncRunInput
): Promise<{ runId: string; steps: AsyncStepRecord[] }> {
  const runId = generateAsyncRunId()
  const now = new Date().toISOString()

  // Create the run record
  await payload.create({
    collection: 'async-runs' as any,
    data: {
      runId,
      projectId: input.projectId,
      projectName: input.projectName,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      title: input.title,
      description: input.description,
      branch: input.branch || 'main',
      status: 'queued',
      currentStep: PIPELINE_STEPS[0],
      totalSteps: PIPELINE_STEPS.length,
      completedSteps: 0,
      failedSteps: 0,
      heartbeatAt: now,
      startedAt: now,
      completedAt: null,
      durationMs: 0,
      error: null,
      metadata: JSON.stringify({}),
    },
    overrideAccess: true,
  })

  // Create all step records — first step is 'ready', rest are 'pending'
  const steps: AsyncStepRecord[] = []
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const stepName = PIPELINE_STEPS[i]
    const step: AsyncStepRecord = {
      runId,
      stepName,
      stepIndex: i,
      status: i === 0 ? 'ready' : 'pending',
      model: null,
      output: null,
      markdown: null,
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      retryCount: 0,
      maxRetries: 3,
    }

    await payload.create({
      collection: 'async-run-steps' as any,
      data: step,
      overrideAccess: true,
    })

    steps.push(step)
  }

  // Emit run_started event
  await emitRunEvent(payload, {
    runId,
    stepName: null,
    eventType: 'run_started',
    message: `Pipeline started: ${input.title}`,
    data: JSON.stringify({ projectId: input.projectId, totalSteps: PIPELINE_STEPS.length }),
  })

  return { runId, steps }
}

// ─── Get Run State ────────────────────────────────────────────────────

export async function getAsyncRunState(
  payload: Payload,
  runId: string
): Promise<{ run: any; steps: any[] } | null> {
  const runs = await payload.find({
    collection: 'async-runs' as any,
    where: { runId: { equals: runId } },
    limit: 1,
    overrideAccess: true,
  })

  if (runs.docs.length === 0) return null

  const steps = await payload.find({
    collection: 'async-run-steps' as any,
    where: { runId: { equals: runId } },
    sort: 'stepIndex',
    limit: 20,
    overrideAccess: true,
  })

  return { run: runs.docs[0], steps: steps.docs }
}

// ─── Update Run Status ───────────────────────────────────────────────

export async function updateRunStatus(
  payload: Payload,
  runId: string,
  updates: Partial<AsyncRunRecord>
): Promise<void> {
  const runs = await payload.find({
    collection: 'async-runs' as any,
    where: { runId: { equals: runId } },
    limit: 1,
    overrideAccess: true,
  })

  if (runs.docs.length > 0) {
    await payload.update({
      collection: 'async-runs' as any,
      id: runs.docs[0].id,
      data: updates as any,
      overrideAccess: true,
    })
  }
}

// ─── Update Step Status ──────────────────────────────────────────────

export async function updateStepStatus(
  payload: Payload,
  runId: string,
  stepName: string,
  updates: Partial<AsyncStepRecord>
): Promise<void> {
  const steps = await payload.find({
    collection: 'async-run-steps' as any,
    where: {
      and: [
        { runId: { equals: runId } },
        { stepName: { equals: stepName } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  if (steps.docs.length > 0) {
    await payload.update({
      collection: 'async-run-steps' as any,
      id: steps.docs[0].id,
      data: updates as any,
      overrideAccess: true,
    })
  }
}

// ─── Advance to Next Step ────────────────────────────────────────────

export async function advanceToNextStep(
  payload: Payload,
  runId: string,
  currentStepName: string
): Promise<StepName | null> {
  const currentIndex = PIPELINE_STEPS.indexOf(currentStepName as StepName)
  if (currentIndex < 0 || currentIndex >= PIPELINE_STEPS.length - 1) {
    return null // no next step
  }

  const nextStep = PIPELINE_STEPS[currentIndex + 1]

  // Mark next step as ready
  await updateStepStatus(payload, runId, nextStep, { status: 'ready' })

  // Update run's current step and heartbeat
  await updateRunStatus(payload, runId, {
    currentStep: nextStep,
    heartbeatAt: new Date().toISOString(),
    completedSteps: currentIndex + 1,
  } as any)

  return nextStep
}

// ─── Mark Run Complete ───────────────────────────────────────────────

export async function markRunComplete(
  payload: Payload,
  runId: string,
  startedAt: string
): Promise<void> {
  const now = new Date().toISOString()
  await updateRunStatus(payload, runId, {
    status: 'completed',
    completedAt: now,
    durationMs: new Date(now).getTime() - new Date(startedAt).getTime(),
    completedSteps: PIPELINE_STEPS.length,
  } as any)

  await emitRunEvent(payload, {
    runId,
    stepName: null,
    eventType: 'run_completed',
    message: 'Pipeline completed successfully',
    data: JSON.stringify({ completedAt: now }),
  })
}

// ─── Mark Run Failed ─────────────────────────────────────────────────

export async function markRunFailed(
  payload: Payload,
  runId: string,
  error: string,
  failedStep: string
): Promise<void> {
  const now = new Date().toISOString()
  await updateRunStatus(payload, runId, {
    status: 'failed',
    completedAt: now,
    error,
  } as any)

  // Skip remaining pending steps
  const state = await getAsyncRunState(payload, runId)
  if (state) {
    for (const step of state.steps) {
      if (step.status === 'pending' || step.status === 'ready') {
        await updateStepStatus(payload, runId, step.stepName, { status: 'skipped' })
      }
    }
  }

  await emitRunEvent(payload, {
    runId,
    stepName: failedStep,
    eventType: 'run_failed',
    message: `Pipeline failed at step: ${failedStep}`,
    data: JSON.stringify({ error, failedStep }),
  })
}
