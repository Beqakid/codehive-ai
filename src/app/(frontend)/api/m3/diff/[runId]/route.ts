/**
 * GET /api/m3/diff/[runId]
 *
 * Milestone 3 — Returns the diff/patch results for a specific run.
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
      collection: 'patch-runs',
      where: { runId: { equals: runId } },
      limit: 1,
      overrideAccess: true,
    })

    if (results.docs.length === 0) {
      return Response.json({ error: 'Patch run not found' }, { status: 404 })
    }

    const doc = results.docs[0]
    return Response.json({
      runId: doc.runId,
      status: doc.status,
      patchCount: doc.patchCount,
      totalLinesChanged: doc.totalLinesChanged,
      diffs: typeof doc.diffs === 'string' ? JSON.parse(doc.diffs) : doc.diffs,
      patches: typeof doc.patches === 'string' ? JSON.parse(doc.patches) : doc.patches,
      rejectedFiles: typeof doc.rejectedFiles === 'string' ? JSON.parse(doc.rejectedFiles) : doc.rejectedFiles,
      validationErrors: typeof doc.validationErrors === 'string' ? JSON.parse(doc.validationErrors) : doc.validationErrors,
      warnings: typeof doc.warnings === 'string' ? JSON.parse(doc.warnings) : doc.warnings,
      aiModel: doc.aiModel,
      durationMs: doc.durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
