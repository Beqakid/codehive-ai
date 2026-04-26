/**
 * POST /api/agent-plan
 *
 * Non-streaming endpoint — runs the full agent pipeline and returns
 * the collected events as JSON. Use /api/agent-plan/stream for live SSE.
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator, type SSEEvent } from '@/agents/orchestrator'

export async function POST(request: Request) {
  let codingRequestId: number
  try {
    const body = (await request.json()) as { codingRequestId?: unknown }
    codingRequestId = Number(body.codingRequestId)
    if (!codingRequestId || isNaN(codingRequestId)) {
      return Response.json({ error: 'codingRequestId is required' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers: new Headers(request.headers) })

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const events: SSEEvent[] = []

  try {
    await runOrchestrator(payload, codingRequestId, (event) => events.push(event))
    return Response.json({ success: true, events })
  } catch (err) {
    return Response.json({ error: String(err), events }, { status: 500 })
  }
}
