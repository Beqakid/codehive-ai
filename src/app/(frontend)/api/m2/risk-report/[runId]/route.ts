/**
 * GET /api/m2/risk-report/[runId]
 *
 * Returns the persisted risk report for a specific agent run.
 * DO NOT add `export const runtime = 'edge'`
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'
import { getRiskColor, getRiskEmoji } from '../../../../../lib/riskEngine'
import type { RiskLevel } from '../../../../../lib/riskEngine'

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> => {
  if (!FEATURE_FLAGS.M2_RISK_ENGINE) {
    return Response.json({ error: 'M2_RISK_ENGINE feature flag is disabled' }, { status: 403 })
  }

  const { runId } = await params

  try {
    const payload = await getPayload({ config })

    const reports = await payload.find({
      collection: 'run-risk-reports',
      where: { runId: { equals: runId } },
      limit: 1,
      overrideAccess: true,
    })

    if (reports.docs.length === 0) {
      return Response.json({ error: `No risk report found for run ${runId}` }, { status: 404 })
    }

    const report = reports.docs[0] as {
      riskLevel: RiskLevel
      riskScore: number
      confidenceScore: number
      rollbackComplexity: string
      implementationScope: string
      [key: string]: unknown
    }

    return Response.json({
      ...report,
      display: {
        emoji: getRiskEmoji(report.riskLevel),
        color: getRiskColor(report.riskLevel),
        label: `${getRiskEmoji(report.riskLevel)} ${report.riskLevel} (${report.riskScore}/100)`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
