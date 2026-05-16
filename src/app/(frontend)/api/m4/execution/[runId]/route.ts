/**
 * GET /api/m4/execution/[runId]
 * Returns execution step results for a given run.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const payload = await getPayload({ config })

  const steps = await payload.find({
    collection: 'execution-steps' as 'users',
    where: { runId: { equals: runId } },
    limit: 50,
    sort: 'createdAt',
    overrideAccess: true,
  })

  if (steps.docs.length === 0) {
    return Response.json({ error: 'No execution steps found', runId }, { status: 404 })
  }

  return Response.json({
    runId,
    steps: steps.docs,
    totalSteps: steps.totalDocs,
  })
}
