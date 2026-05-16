/**
 * GET /api/m4/workspace/[runId]
 * Returns workspace run info and snapshots for a given run.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const payload = await getPayload({ config })

  const workspaces = await payload.find({
    collection: 'workspace-runs' as 'users',
    where: { runId: { equals: runId } },
    limit: 5,
    sort: '-createdAt',
    overrideAccess: true,
  })

  if (workspaces.docs.length === 0) {
    return Response.json({ error: 'No workspace found', runId }, { status: 404 })
  }

  const snapshots = await payload.find({
    collection: 'workspace-snapshots' as 'users',
    where: { runId: { equals: runId } },
    limit: 20,
    sort: 'createdAt',
    overrideAccess: true,
  })

  return Response.json({
    runId,
    workspace: workspaces.docs[0],
    snapshots: snapshots.docs,
  })
}
