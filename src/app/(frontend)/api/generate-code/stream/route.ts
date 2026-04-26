/**
 * POST /api/generate-code/stream
 *
 * SSE streaming endpoint — Phase 3 code generation.
 * Takes an approved plan ID, generates implementation code for each
 * file in the plan, and commits them to the PR branch in real time.
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runCodeOrchestrator, type CodeGenSSEEvent } from '@/agents/codeOrchestrator'

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  // Parse body
  let planId: number
  try {
    const body = (await request.json()) as { planId?: unknown }
    planId = Number(body.planId)
    if (!planId || isNaN(planId)) {
      return new Response(JSON.stringify({ error: 'planId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Auth check
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers: new Headers(request.headers) })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CodeGenSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await runCodeOrchestrator(payload, planId, send)
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
