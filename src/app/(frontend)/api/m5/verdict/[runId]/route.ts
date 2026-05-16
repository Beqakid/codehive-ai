/**
 * GET /api/m5/verdict/[runId]
 *
 * Milestone 5 — Retrieves the final verdict for a pipeline run.
 * Queries the agent-verdicts collection and returns the full verdict
 * including scores, recommendation, reasoning, and risk assessment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../payload.config'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params

    if (!runId) {
      return NextResponse.json({ error: 'Missing runId parameter' }, { status: 400 })
    }

    const payload = await getPayload({ config: configPromise })

    const verdicts = await payload.find({
      collection: 'agent-verdicts' as 'users',
      where: {
        runId: { equals: runId },
      },
      limit: 1,
      overrideAccess: true,
    })

    if (verdicts.totalDocs === 0) {
      return NextResponse.json(
        { error: 'No verdict found for this run', runId },
        { status: 404 },
      )
    }

    const verdict = verdicts.docs[0] as Record<string, unknown>

    return NextResponse.json({
      runId,
      verdict: {
        id: verdict.id,
        runId: verdict.runId,
        projectId: verdict.projectId,
        recommendation: verdict.recommendation,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        scores: verdict.scores,
        riskFlags: verdict.riskFlags,
        summary: verdict.summary,
        detailedAnalysis: verdict.detailedAnalysis,
        agentContributions: verdict.agentContributions,
        createdAt: verdict.createdAt,
        updatedAt: verdict.updatedAt,
      },
    })
  } catch (err) {
    console.error('[M5 /api/m5/verdict] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
