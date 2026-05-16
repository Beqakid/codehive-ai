/**
 * GET /api/m5/agents/[runId]
 *
 * Milestone 5 — Retrieves all agent step results for a given pipeline run.
 * Queries the agent-logs collection and returns output, markdown, and timing
 * for every agent step in the run.
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

    const agentLogs = await payload.find({
      collection: 'agent-logs' as 'users',
      where: {
        runId: { equals: runId },
      },
      sort: 'stepOrder',
      limit: 100,
      overrideAccess: true,
    })

    const steps = agentLogs.docs.map((doc: Record<string, unknown>) => ({
      id: doc.id,
      runId: doc.runId,
      agentRole: doc.agentRole,
      stepName: doc.stepName,
      stepOrder: doc.stepOrder,
      status: doc.status,
      output: doc.output,
      markdown: doc.markdown,
      tokenUsage: doc.tokenUsage,
      model: doc.model,
      durationMs: doc.durationMs,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
      errorMessage: doc.errorMessage,
    }))

    return NextResponse.json({
      runId,
      totalSteps: agentLogs.totalDocs,
      steps,
    })
  } catch (err) {
    console.error('[M5 /api/m5/agents] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
