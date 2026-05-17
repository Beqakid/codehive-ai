/**
 * M6 Heartbeat Manager
 *
 * Detects stalled runs by checking heartbeat timestamps.
 * A run is stalled if it has been in 'processing' state
 * with no heartbeat update for >5 minutes.
 */

import type { Payload } from 'payload'
import { updateRunStatus, updateStepStatus } from './asyncPipeline'
import { emitRunEvent } from './runEventEmitter'

export interface HeartbeatStatus {
  runId: string
  status: string
  lastHeartbeat: string
  ageMs: number
  isStalled: boolean
  stalledStep?: string
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

// ─── Check Single Run ────────────────────────────────────────────────

export async function checkRunHeartbeat(
  payload: Payload,
  runId: string
): Promise<HeartbeatStatus> {
  const runs = await payload.find({
    collection: 'async-runs' as any,
    where: { runId: { equals: runId } },
    limit: 1,
    overrideAccess: true,
  })

  if (runs.docs.length === 0) {
    return { runId, status: 'not_found', lastHeartbeat: '', ageMs: 0, isStalled: false }
  }

  const run = runs.docs[0] as any
  const lastHeartbeat = run.heartbeatAt || run.startedAt
  const ageMs = Date.now() - new Date(lastHeartbeat).getTime()
  const isStalled = run.status === 'processing' && ageMs > STALE_THRESHOLD_MS

  let stalledStep: string | undefined
  if (isStalled) {
    // Find the running step
    const steps = await payload.find({
      collection: 'async-run-steps' as any,
      where: {
        and: [
          { runId: { equals: runId } },
          { status: { equals: 'running' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (steps.docs.length > 0) {
      stalledStep = (steps.docs[0] as any).stepName
    }
  }

  return {
    runId,
    status: run.status,
    lastHeartbeat,
    ageMs,
    isStalled,
    stalledStep,
  }
}

// ─── Mark Run as Stalled ─────────────────────────────────────────────

export async function markRunStalled(
  payload: Payload,
  runId: string,
  stalledStep?: string
): Promise<void> {
  await updateRunStatus(payload, runId, {
    status: 'stalled',
  } as any)

  if (stalledStep) {
    await updateStepStatus(payload, runId, stalledStep, {
      status: 'failed',
      error: 'Step stalled — no heartbeat for >5 minutes',
    })
  }

  await emitRunEvent(payload, {
    runId,
    stepName: stalledStep || null,
    eventType: 'run_stalled',
    message: `Run stalled at step: ${stalledStep || 'unknown'}`,
    data: JSON.stringify({ stalledStep }),
  })
}

// ─── Scan All Processing Runs ────────────────────────────────────────

export async function scanForStalledRuns(
  payload: Payload
): Promise<HeartbeatStatus[]> {
  const runs = await payload.find({
    collection: 'async-runs' as any,
    where: { status: { equals: 'processing' } },
    limit: 50,
    overrideAccess: true,
  })

  const results: HeartbeatStatus[] = []
  for (const run of runs.docs) {
    const status = await checkRunHeartbeat(payload, (run as any).runId)
    results.push(status)

    if (status.isStalled) {
      await markRunStalled(payload, status.runId, status.stalledStep)
    }
  }

  return results
}

// ─── Update Heartbeat ────────────────────────────────────────────────

export async function updateHeartbeat(
  payload: Payload,
  runId: string
): Promise<void> {
  await updateRunStatus(payload, runId, {
    heartbeatAt: new Date().toISOString(),
  } as any)
}
