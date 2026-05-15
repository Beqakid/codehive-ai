/**
 * GET /api/m3/rollback/[runId]
 *
 * Milestone 3 — Returns the rollback plan for a specific run.
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

    const results = await payload.find({
      collection: 'rollback-plans',
      where: { runId: { equals: runId } },
      limit: 1,
      overrideAccess: true,
    })

    if (results.docs.length === 0) {
      return Response.json({ error: 'Rollback plan not found' }, { status: 404 })
    }

    const doc = results.docs[0]
    return Response.json({
      runId: doc.runId,
      projectId: doc.projectId,
      rollbackComplexity: doc.rollbackComplexity,
      filesTouched: typeof doc.filesTouched === 'string' ? JSON.parse(doc.filesTouched) : doc.filesTouched,
      reversalStrategy: doc.reversalStrategy,
      dependencyRisks: doc.dependencyRisks,
      cleanupConsiderations: doc.cleanupConsiderations,
      migrationRisks: doc.migrationRisks,
      rollbackMarkdown: doc.rollbackMarkdown,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
