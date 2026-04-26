/**
 * POST /api/agent-plan/stream
 *
 * SSE streaming endpoint — runs the full agent pipeline and streams
 * events to the client in real time so you can watch agents think live.
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator, type SSEEvent } from '@/agents/orchestrator'

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  // Parse body
  let codingRequestId: number
  try {
    const body = (await request.json()) as { codingRequestId?: unknown }
    codingRequestId = Number(body.codingRequestId)
    if (!codingRequestId || isNaN(codingRequestId)) {
      return new Response(JSON.stringify({ error: 'codingRequestId is required' }), {
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

  // Auth check using request headers directly
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
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await runOrchestrator(payload, codingRequestId, send)
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
