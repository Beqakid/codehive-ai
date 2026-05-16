/**
 * GET /api/m5/failures/[runId]
 *
 * Milestone 5 — Retrieves failure patterns for a specific pipeline run.
 * Queries the failure-patterns collection by sourceRunId and also includes
 * any healing-attempts from M4. Returns categorized failures with fingerprints.
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

    // Fetch failure patterns for this run
    const failurePatterns = await payload.find({
      collection: 'failure-patterns' as 'users',
      where: {
        sourceRunId: { equals: runId },
      },
      sort: '-createdAt',
      limit: 100,
      overrideAccess: true,
    })

    // Also fetch any healing attempts from M4
    let healingAttempts: { totalDocs: number; docs: Record<string, unknown>[] } = {
      totalDocs: 0,
      docs: [],
    }
    try {
      healingAttempts = await payload.find({
        collection: 'healing-attempts' as 'users',
        where: {
          runId: { equals: runId },
        },
        sort: 'attemptNumber',
        limit: 50,
        overrideAccess: true,
      }) as unknown as { totalDocs: number; docs: Record<string, unknown>[] }
    } catch {
      // healing-attempts collection may not exist yet — that's fine
    }

    // Categorize failures by type
    const categorized: Record<string, unknown[]> = {}
    for (const doc of failurePatterns.docs as Record<string, unknown>[]) {
      const category = (doc.category as string) || 'uncategorized'
      if (!categorized[category]) {
        categorized[category] = []
      }
      categorized[category].push({
        id: doc.id,
        sourceRunId: doc.sourceRunId,
        category: doc.category,
        errorType: doc.errorType,
        fingerprint: doc.fingerprint,
        message: doc.message,
        filePath: doc.filePath,
        lineNumber: doc.lineNumber,
        frequency: doc.frequency,
        firstSeen: doc.firstSeen,
        lastSeen: doc.lastSeen,
        suggestedFix: doc.suggestedFix,
        autoFixable: doc.autoFixable,
        severity: doc.severity,
        createdAt: doc.createdAt,
      })
    }

    return NextResponse.json({
      runId,
      totalFailures: failurePatterns.totalDocs,
      categorized,
      healingAttempts: {
        total: healingAttempts.totalDocs,
        attempts: healingAttempts.docs.map((doc: Record<string, unknown>) => ({
          id: doc.id,
          attemptId: doc.attemptId,
          strategy: doc.strategy,
          targetFile: doc.targetFile,
          errorMessage: doc.errorMessage,
          suggestedFix: doc.suggestedFix,
          outcome: doc.outcome,
          durationMs: doc.durationMs,
          attemptNumber: doc.attemptNumber,
        })),
      },
    })
  } catch (err) {
    console.error('[M5 /api/m5/failures] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
