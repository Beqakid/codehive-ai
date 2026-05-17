/**
 * POST /api/m6/run/[runId]/retry — Retry a specific failed step
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
import { retryFailedStep } from '../../../../../../../lib/retryManager'
import { chainNextStep } from '../../../../../../../lib/chainScheduler'
import type { StepName } from '../../../../../../../lib/asyncPipeline'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    let body: { stepName: string }
    try {
      body = (await req.json()) as { stepName: string }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.stepName) {
      return NextResponse.json({ error: 'stepName is required' }, { status: 400 })
    }

    const payload = await getPayload({ config: configPromise })
    const decision = await retryFailedStep(payload, runId, body.stepName as StepName)

    if (!decision.allowed) {
      return NextResponse.json({
        status: 'rejected',
        reason: decision.reason,
        retryCount: decision.retryCount,
        maxRetries: decision.maxRetries,
      }, { status: 400 })
    }

    // Chain to process endpoint with backoff delay
    chainNextStep(req.url.replace(/\/retry$/, '').replace(/\/[^/]+$/, ''), runId, decision.backoffMs)

    return NextResponse.json({
      status: 'retrying',
      runId,
      stepName: body.stepName,
      retryCount: decision.retryCount,
      maxRetries: decision.maxRetries,
      backoffMs: decision.backoffMs,
      message: `Retrying step ${body.stepName} (attempt ${decision.retryCount}/${decision.maxRetries})`,
    })
  } catch (err) {
    console.error('[M6 POST /retry] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
