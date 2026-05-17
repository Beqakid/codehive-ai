/**
 * M6 Run Event Emitter
 *
 * Logs pipeline events to D1 for real-time streaming and audit trail.
 * Events are polled or streamed via SSE to the UI.
 */

import type { Payload } from 'payload'

export interface RunEventInput {
  runId: string
  stepName: string | null
  eventType: string
  message: string
  data: string
}

export async function emitRunEvent(
  payload: Payload,
  event: RunEventInput
): Promise<void> {
  try {
    await payload.create({
      collection: 'run-events' as any,
      data: {
        runId: event.runId,
        stepName: event.stepName || '',
        eventType: event.eventType,
        message: event.message,
        data: event.data,
        emittedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  } catch (e) {
    // Non-fatal — don't break pipeline for event logging
    console.error('[M6] Event emit failed:', e)
  }
}

export async function getRunEvents(
  payload: Payload,
  runId: string,
  since?: string,
  limit?: number
): Promise<any[]> {
  const where: any = { runId: { equals: runId } }

  if (since) {
    where.emittedAt = { greater_than: since }
  }

  const result = await payload.find({
    collection: 'run-events' as any,
    where,
    sort: 'emittedAt',
    limit: limit || 100,
    overrideAccess: true,
  })

  return result.docs
}
