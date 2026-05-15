/**
 * GET /api/m3/test-results/[runId]
 *
 * Milestone 3 — Returns sandbox/test execution results for a run.
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

    const sandboxResults = await payload.find({
      collection: 'sandbox-runs',
      where: { runId: { equals: runId } },
      limit: 5,
      sort: '-createdAt',
      overrideAccess: true,
    })

    const validationResults = await payload.find({
      collection: 'validation-results',
      where: { runId: { equals: runId } },
      limit: 5,
      sort: '-createdAt',
      overrideAccess: true,
    })

    const healAttempts = await payload.find({
      collection: 'self-heal-attempts',
      where: { runId: { equals: runId } },
      limit: 10,
      sort: 'attemptNumber',
      overrideAccess: true,
    })

    return Response.json({
      runId,
      sandbox: sandboxResults.docs.map((d) => ({
        provider: d.provider,
        success: d.success,
        steps: typeof d.steps === 'string' ? JSON.parse(d.steps) : d.steps,
        totalDurationMs: d.totalDurationMs,
        errors: typeof d.errors === 'string' ? JSON.parse(d.errors) : d.errors,
        summary: d.summary,
        branch: d.branch,
      })),
      validation: validationResults.docs.map((d) => ({
        valid: d.valid,
        errorCount: d.errorCount,
        warningCount: d.warningCount,
        issues: typeof d.issues === 'string' ? JSON.parse(d.issues) : d.issues,
        summary: d.summary,
        durationMs: d.durationMs,
      })),
      selfHealAttempts: healAttempts.docs.map((d) => ({
        attemptNumber: d.attemptNumber,
        errorCategory: d.errorCategory,
        healAction: d.healAction,
        success: d.success,
        resultMessage: d.resultMessage,
        durationMs: d.durationMs,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
