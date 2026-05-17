import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
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
    if (!['queued', 'processing', 'stalled'].includes(run.status)) {
      return Response.json(
        { error: `Cannot cancel run with status: ${run.status}` },
        { status: 400 }
      )
    }

    // Update by ID to avoid locked_documents query issue
    await payload.update({
      collection: 'async-runs',
      id: run.id,
      data: {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    await emitRunEvent(payload, {
      runId,
      eventType: 'run_cancelled',
      message: `Run cancelled by user`,
    })

    return Response.json({
      runId,
      status: 'cancelled',
      message: 'Run cancelled successfully',
    })
  } catch (error: any) {
    console.error('Cancel run error:', error)
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
