/**
 * POST /api/m6/run/[runId]/cancel — Cancel a running or queued pipeline
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
import { getAsyncRunState, updateRunStatus, updateStepStatus } from '../../../../../../../lib/asyncPipeline'
import { emitRunEvent } from '../../../../../../../lib/runEventEmitter'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const payload = await getPayload({ config: configPromise })
    const state = await getAsyncRunState(payload, runId)

    if (!state) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const run = state.run
    if (['completed', 'cancelled'].includes(run.status)) {
      return NextResponse.json(
        { error: `Cannot cancel run with status: ${run.status}` },
        { status: 400 },
      )
    }

    // Cancel all pending/ready/running steps
    for (const step of state.steps) {
      if (['pending', 'ready', 'running'].includes(step.status)) {
        await updateStepStatus(payload, runId, step.stepName, {
          status: 'skipped',
          error: 'Cancelled by user',
        })
      }
    }

    const now = new Date().toISOString()
    await updateRunStatus(payload, runId, {
      status: 'cancelled',
      completedAt: now,
      durationMs: new Date(now).getTime() - new Date(run.startedAt).getTime(),
    } as any)

    await emitRunEvent(payload, {
      runId,
      stepName: null,
      eventType: 'run_cancelled',
      message: 'Pipeline cancelled by user',
      data: JSON.stringify({ cancelledAt: now }),
    })

    return NextResponse.json({
      status: 'cancelled',
      runId,
      message: 'Pipeline cancelled successfully',
    })
  } catch (err) {
    console.error('[M6 POST /cancel] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
