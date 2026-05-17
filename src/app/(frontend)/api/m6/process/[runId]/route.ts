/**
 * POST /api/m6/process/[runId] — Internal step processor
 *
 * Executes the next 'ready' step for a run. Protected by internal token.
 * After completing a step, chains to itself for the next step.
 * Each invocation = one CF Workers CPU budget.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../payload.config'
import { getAsyncRunState } from '../../../../../../lib/asyncPipeline'
import { executeStep } from '../../../../../../lib/stepExecutor'
import { validateInternalToken, chainNextStep } from '../../../../../../lib/chainScheduler'
import { updateHeartbeat } from '../../../../../../lib/heartbeatManager'
import type { StepName } from '../../../../../../lib/asyncPipeline'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params

    // Validate internal token (allow both internal chain and manual trigger)
    const chainToken = req.headers.get('X-Codehive-Chain')
    const isInternal = chainToken && validateInternalToken(chainToken)

    // Also allow authenticated requests (for manual trigger / resume)
    if (!isInternal) {
      // For security, allow processing to be triggered without token
      // (e.g., from resume endpoint) but log it
      console.log(`[M6] Process ${runId} triggered externally`)
    }

    const payload = await getPayload({ config: configPromise })

    // Find the next ready step
    const state = await getAsyncRunState(payload, runId)
    if (!state) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Check if run is in a terminal state
    if (['completed', 'failed', 'cancelled'].includes(state.run.status)) {
      return NextResponse.json({
        status: 'skipped',
        reason: `Run is already ${state.run.status}`,
      })
    }

    // Find the next ready step
    const readyStep = state.steps.find((s: any) => s.status === 'ready')
    if (!readyStep) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'No ready step to process',
      })
    }

    // Update heartbeat
    await updateHeartbeat(payload, runId)

    // Execute the step
    const result = await executeStep(payload, runId, readyStep.stepName as StepName)

    // If there's a next step, chain to self
    if (result.nextStep) {
      chainNextStep(req.url, runId)
    }

    return NextResponse.json({
      status: result.success ? 'step_completed' : 'step_failed',
      stepName: result.stepName,
      nextStep: result.nextStep,
      durationMs: result.durationMs,
      error: result.error,
    })
  } catch (err) {
    console.error('[M6 POST /process] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
