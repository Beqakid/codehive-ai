/**
 * GET /api/m4/healing/[runId]
 * Returns self-healing attempts for a given run.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const payload = await getPayload({ config })

  const attempts = await payload.find({
    collection: 'healing-attempts' as 'users',
    where: { runId: { equals: runId } },
    limit: 20,
    sort: 'createdAt',
    overrideAccess: true,
  })

  if (attempts.docs.length === 0) {
    return Response.json({ error: 'No healing attempts found', runId }, { status: 404 })
  }

  return Response.json({
    runId,
    attempts: attempts.docs,
    totalAttempts: attempts.totalDocs,
  })
}
