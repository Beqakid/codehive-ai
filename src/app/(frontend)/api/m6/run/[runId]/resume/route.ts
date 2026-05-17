/**
 * POST /api/m6/run/[runId]/resume — Resume a stalled or failed run
 *
 * Finds the last incomplete step and restarts processing from there.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
import { getAsyncRunState, updateRunStatus, updateStepStatus } from '../../../../../../../lib/asyncPipeline'
import { emitRunEvent } from '../../../../../../../lib/runEventEmitter'
import { chainNextStep } from '../../../../../../../lib/chainScheduler'

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
    if (!['failed', 'stalled'].includes(run.status)) {
      return NextResponse.json(
        { error: `Cannot resume run with status: ${run.status}. Only failed or stalled runs can be resumed.` },
        { status: 400 },
      )
    }

    // Find the step to resume from
    // Priority: running (stalled) → failed → first ready → first pending after last completed
    let resumeStep: any = null
    const sortedSteps = [...state.steps].sort((a: any, b: any) => a.stepIndex - b.stepIndex)

    // Check for running/stalled step
    resumeStep = sortedSteps.find((s: any) => s.status === 'running')
    if (resumeStep) {
      // Reset to ready
      await updateStepStatus(payload, runId, resumeStep.stepName, {
        status: 'ready',
        error: null,
        startedAt: null,
      })
    }

    if (!resumeStep) {
      // Check for failed step
      resumeStep = sortedSteps.find((s: any) => s.status === 'failed')
      if (resumeStep) {
        await updateStepStatus(payload, runId, resumeStep.stepName, {
          status: 'ready',
          error: null,
          retryCount: (resumeStep.retryCount || 0) + 1,
        })
      }
    }

    if (!resumeStep) {
      // Find first pending step after last completed
      resumeStep = sortedSteps.find((s: any) => s.status === 'pending' || s.status === 'ready')
      if (resumeStep && resumeStep.status === 'pending') {
        await updateStepStatus(payload, runId, resumeStep.stepName, { status: 'ready' })
      }
    }

    if (!resumeStep) {
      return NextResponse.json(
        { error: 'No step to resume from — all steps are completed or skipped' },
        { status: 400 },
      )
    }

    // Update run status
    await updateRunStatus(payload, runId, {
      status: 'processing',
      currentStep: resumeStep.stepName,
      heartbeatAt: new Date().toISOString(),
      error: null,
    } as any)

    await emitRunEvent(payload, {
      runId,
      stepName: resumeStep.stepName,
      eventType: 'run_resumed',
      message: `Run resumed at step: ${resumeStep.stepName}`,
      data: JSON.stringify({ resumedAt: new Date().toISOString() }),
    })

    // Chain to process endpoint
    chainNextStep(req.url.replace(/\/resume$/, '').replace(/\/[^/]+$/, ''), runId)

    return NextResponse.json({
      status: 'resumed',
      runId,
      resumeStep: resumeStep.stepName,
      message: `Resuming from step: ${resumeStep.stepName}`,
    })
  } catch (err) {
    console.error('[M6 POST /resume] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
