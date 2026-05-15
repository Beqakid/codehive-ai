/**
 * GET /api/m1/runs/[runId]/logs
 * Returns all persisted log entries for a run (historical, not streaming).
 * For live logs during an active run, connect to POST /api/m1/plan directly.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> => {
  try {
    const { runId } = await params
    const payload = await getPayload({ config })

    const logs = await payload.find({
      collection: 'agent-logs',
      where: { runId: { equals: runId } },
      sort: 'createdAt',
      limit: 500,
      overrideAccess: true,
    })

    return Response.json({
      logs: logs.docs.map((l) => {
        const lAny = l as Record<string, unknown>
        return {
          id: l.id,
          runId: lAny.runId,
          level: lAny.level,
          event: lAny.event,
          message: lAny.message,
          metadata: lAny.metadata,
          createdAt: lAny.createdAt,
        }
      }),
      total: logs.totalDocs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
