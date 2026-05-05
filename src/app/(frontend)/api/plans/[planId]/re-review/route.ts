/**
 * @module re-review-route
 * @description POST /api/plans/[planId]/re-review
 * Allows re-running the Reviewer agent on edited agent outputs.
 * Streams SSE: reviewer chunks + final verdict event.
 * Updates the AgentPlan in DB with new review feedback and verdict.
 * @note Uses overrideAccess: true — no payload.auth() (throws in CF Workers streaming routes)
 * @note params must be awaited — Next.js 15 makes route params a Promise
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runReviewerAgent } from '@/agents/reviewerAgent'
import { parseReviewVerdict } from '@/agents/orchestrator'

interface ReReviewBody {
  productSpec?: string
  architectureDesign?: string
  uiuxDesign?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId: planIdStr } = await params
  const encoder = new TextEncoder()
  const planId = parseInt(planIdStr, 10)

  if (isNaN(planId)) {
    return Response.json({ error: 'Invalid plan ID' }, { status: 400 })
  }

  // Init Payload
  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  } catch (err) {
    return Response.json({ error: `Payload init failed: ${String(err)}` }, { status: 500 })
  }

  // Parse body
  let body: ReReviewBody = {}
  try {
    body = (await request.json()) as ReReviewBody
  } catch { /* empty body is fine */ }

  // Load the existing plan
  let plan: Record<string, unknown>
  try {
    plan = await payload.findByID({
      collection: 'agent-plans',
      id: planId,
      overrideAccess: true,
    }) as Record<string, unknown>
  } catch (err) {
    return Response.json({ error: `Plan not found: ${String(err)}` }, { status: 404 })
  }

  // Extract existing content (fallback to DB values if not provided in body)
  const existingProductSpec =
    (plan.productSpec as { markdown?: string } | null)?.markdown ?? ''
  const existingArchitecture =
    (plan.architectureDesign as { markdown?: string } | null)?.markdown ?? ''

  const productSpec = body.productSpec ?? existingProductSpec
  const architectureDesign = body.architectureDesign ?? existingArchitecture
  const planTitle =
    (plan.finalPlan as { title?: string } | null)?.title ?? `Plan #${planId}`

  // SSE stream
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  const send = (event: Record<string, unknown>) => {
    try {
      void writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch { /* writer closed */ }
  }

  void (async () => {
    try {
      send({ type: 'start', message: '🔎 Re-running Reviewer on updated plan...' })

      let reviewFeedback = ''
      await runReviewerAgent(
        { title: planTitle, productSpec, architectureDesign },
        (text) => {
          reviewFeedback += text
          send({ type: 'chunk', agent: 'reviewer', text })
        },
      )

      send({ type: 'agent_done', agent: 'reviewer' })
      send({ type: 'agent_output', agent: 'reviewer', content: reviewFeedback })

      // Parse verdict
      const verdict = await parseReviewVerdict(reviewFeedback)

      // Update plan in DB with new review + verdict
      const existingFinalPlan = (plan.finalPlan as Record<string, unknown> | null) ?? {}
      await payload.update({
        collection: 'agent-plans',
        id: planId,
        overrideAccess: true,
        data: {
          ...(body.productSpec ? { productSpec: { markdown: body.productSpec } } : {}),
          ...(body.architectureDesign ? { architectureDesign: { markdown: body.architectureDesign } } : {}),
          reviewFeedback: { markdown: reviewFeedback },
          finalPlan: {
            ...existingFinalPlan,
            ...(body.uiuxDesign ? { uiuxDesign: body.uiuxDesign } : {}),
          },
          verdictReason: verdict.reason.slice(0, 2000),
          reviewScore: verdict.score,
          status: verdict.approved ? 'approved' : 'needs_revision',
        },
      })

      send({
        type: 'verdict',
        approved: verdict.approved,
        score: verdict.score,
        reason: verdict.reason,
      })
      send({ type: 'done', approved: verdict.approved, score: verdict.score })
    } catch (err) {
      send({ type: 'error', message: String(err) })
    } finally {
      try { await writer.close() } catch { /* already closed */ }
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
