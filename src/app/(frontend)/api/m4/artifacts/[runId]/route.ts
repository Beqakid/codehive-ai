/**
 * GET /api/m4/artifacts/[runId]
 * Returns artifact records for a given run.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const payload = await getPayload({ config })

  const artifacts = await payload.find({
    collection: 'artifact-records' as 'users',
    where: { runId: { equals: runId } },
    limit: 100,
    sort: '-createdAt',
    overrideAccess: true,
  })

  return Response.json({
    runId,
    artifacts: artifacts.docs,
    totalCount: artifacts.totalDocs,
  })
}
