/**
 * GET /api/m3/review-gates/[runId]
 *
 * Milestone 3 — Returns review gate evaluation results for a run.
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
      collection: 'review-gate-events',
      where: { runId: { equals: runId } },
      limit: 5,
      sort: '-createdAt',
      overrideAccess: true,
    })

    if (results.docs.length === 0) {
      return Response.json({ error: 'Review gate events not found' }, { status: 404 })
    }

    const doc = results.docs[0]
    return Response.json({
      runId: doc.runId,
      projectId: doc.projectId,
      overallDecision: doc.overallDecision,
      canProceed: doc.canProceed,
      requiresHumanApproval: doc.requiresHumanApproval,
      checks: typeof doc.checks === 'string' ? JSON.parse(doc.checks) : doc.checks,
      blockReasons: typeof doc.blockReasons === 'string' ? JSON.parse(doc.blockReasons) : doc.blockReasons,
      warnings: typeof doc.warnings === 'string' ? JSON.parse(doc.warnings) : doc.warnings,
      summary: doc.summary,
      approvedBy: doc.approvedBy,
      approvedAt: doc.approvedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
