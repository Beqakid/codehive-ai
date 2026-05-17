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
    const payload = await getPayload({ config: configPromise })

    const result = await payload.find({
      collection: 'async-runs',
      where: { runId: { equals: runId } },
      limit: 1,
      overrideAccess: true,
    })

    if (!result.docs.length) {
      return Response.json({ error: 'Run not found' }, { status: 404 })
    }

    const run = result.docs[0] as any
    if (!['failed', 'stalled'].includes(run.status)) {
      return Response.json(
        { error: `Cannot resume run with status: ${run.status}. Only failed or stalled runs can be resumed.` },
        { status: 400 }
      )
    }

    // Update by ID
    await payload.update({
      collection: 'async-runs',
      id: run.id,
      data: {
        status: 'processing',
        heartbeatAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    await emitRunEvent(payload, {
      runId,
      eventType: 'run_resumed',
      message: `Run resumed from step: ${run.currentStep || 'beginning'}`,
    })

    // Trigger the next step processing
    chainNextStep(req.url, runId)

    return Response.json({
      runId,
      status: 'processing',
      message: 'Run resumed. Processing will continue from the last incomplete step.',
    })
  } catch (error: any) {
    console.error('Resume run error:', error)
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
