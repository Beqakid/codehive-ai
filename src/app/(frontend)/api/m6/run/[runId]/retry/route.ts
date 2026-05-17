import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
import { chainNextStep } from '../../../../../../../lib/chainScheduler'
import { emitRunEvent } from '../../../../../../../lib/runEventEmitter'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const body = await req.json().catch(() => ({}))
    const stepName = body.stepName
    const payload = await getPayload({ config: configPromise })

    // Find the run
    const runResult = await payload.find({
      collection: 'async-runs',
      where: { runId: { equals: runId } },
      limit: 1,
      overrideAccess: true,
    })

    if (!runResult.docs.length) {
      return Response.json({ error: 'Run not found' }, { status: 404 })
    }

    const run = runResult.docs[0] as any
    if (!['failed', 'stalled'].includes(run.status)) {
      return Response.json(
        { error: `Cannot retry steps on run with status: ${run.status}` },
        { status: 400 }
      )
    }

    // Find the step to retry
    const stepWhere: any = { runId: { equals: runId } }
    if (stepName) {
      stepWhere.stepName = { equals: stepName }
    } else {
      stepWhere.status = { equals: 'failed' }
    }

    const stepResult = await payload.find({
      collection: 'async-run-steps',
      where: stepWhere,
      limit: 1,
      sort: 'stepIndex',
      overrideAccess: true,
    })

    if (!stepResult.docs.length) {
      return Response.json(
        { error: stepName ? `Step "${stepName}" not found` : 'No failed steps found' },
        { status: 404 }
      )
    }

    const step = stepResult.docs[0] as any
    if (step.retryCount >= step.maxRetries) {
      return Response.json(
        { error: `Step "${step.stepName}" has exceeded max retries (${step.maxRetries})` },
        { status: 400 }
      )
    }

    // Reset step by ID
    await payload.update({
      collection: 'async-run-steps',
      id: step.id,
      data: {
        status: 'ready',
        error: null,
        retryCount: (step.retryCount || 0) + 1,
      },
      overrideAccess: true,
    })

    // Reset run status by ID
    await payload.update({
      collection: 'async-runs',
      id: run.id,
      data: {
        status: 'processing',
        currentStep: step.stepName,
        heartbeatAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    await emitRunEvent(payload, {
      runId,
      stepName: step.stepName,
      eventType: 'step_retry',
      message: `Retrying step: ${step.stepName} (attempt ${step.retryCount + 1}/${step.maxRetries})`,
    })

    chainNextStep(req.url, runId)

    return Response.json({
      runId,
      stepName: step.stepName,
      retryCount: step.retryCount + 1,
      maxRetries: step.maxRetries,
      message: `Step "${step.stepName}" queued for retry`,
    })
  } catch (error: any) {
    console.error('Retry step error:', error)
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
