/**
 * GET /api/m6/run/[runId]/events — Stream pipeline events via SSE
 *
 * Supports two modes:
 * 1. Polling: ?since=<ISO timestamp> returns new events since that time
 * 2. SSE: Accept: text/event-stream for real-time streaming
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../../payload.config'
import { getRunEvents } from '../../../../../../../lib/runEventEmitter'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const payload = await getPayload({ config: configPromise })
    const url = new URL(req.url)
    const since = url.searchParams.get('since') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)

    const accept = req.headers.get('accept') || ''

    if (accept.includes('text/event-stream')) {
      // SSE mode: stream events
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()

      const streamEvents = async () => {
        try {
          let lastSince = since
          let attempts = 0
          const maxAttempts = 60 // ~60 seconds max

          while (attempts < maxAttempts) {
            const events = await getRunEvents(payload, runId, lastSince, 20)

            for (const event of events) {
              const data = JSON.stringify({
                id: event.id,
                eventType: event.eventType,
                stepName: event.stepName,
                message: event.message,
                data: event.data ? JSON.parse(event.data) : null,
                emittedAt: event.emittedAt,
              })
              await writer.write(encoder.encode(`data: ${data}\n\n`))
              lastSince = event.emittedAt
            }

            // Check if run is finished
            const runs = await payload.find({
              collection: 'async-runs' as any,
              where: { runId: { equals: runId } },
              limit: 1,
              overrideAccess: true,
            })

            const runStatus = (runs.docs[0] as any)?.status
            if (['completed', 'failed', 'cancelled'].includes(runStatus)) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ eventType: 'stream_end', status: runStatus })}\n\n`))
              break
            }

            // Wait 1 second before next poll
            await new Promise((resolve) => setTimeout(resolve, 1000))
            attempts++
          }
        } catch (e) {
          console.error('[M6 SSE] Error:', e)
        } finally {
          await writer.close()
        }
      }

      streamEvents()

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Polling mode: return events as JSON
    const events = await getRunEvents(payload, runId, since, Math.min(limit, 100))

    return NextResponse.json({
      runId,
      events: events.map((e: any) => ({
        id: e.id,
        eventType: e.eventType,
        stepName: e.stepName,
        message: e.message,
        data: e.data ? JSON.parse(e.data) : null,
        emittedAt: e.emittedAt,
      })),
      count: events.length,
    })
  } catch (err) {
    console.error('[M6 GET /api/m6/run/[runId]/events] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
