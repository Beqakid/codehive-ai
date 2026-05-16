/**
 * GET /api/m4/replay/[runId]
 * Returns replay session and timeline for a given run.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { deserializeSession, buildTimeline } from '../../../../../../lib/executionReplay'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const payload = await getPayload({ config })

  const sessions = await payload.find({
    collection: 'replay-sessions' as 'users',
    where: { runId: { equals: runId } },
    limit: 1,
    sort: '-createdAt',
    overrideAccess: true,
  })

  if (sessions.docs.length === 0) {
    return Response.json({ error: 'No replay session found', runId }, { status: 404 })
  }

  const raw = sessions.docs[0] as unknown as Record<string, unknown>
  const session = deserializeSession(raw)
  const timeline = buildTimeline(session)

  return Response.json({
    runId,
    session: {
      sessionId: session.sessionId,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      totalSteps: session.totalSteps,
      failedSteps: session.failedSteps,
      healAttempts: session.healAttempts,
    },
    timeline,
    events: session.events,
  })
}
