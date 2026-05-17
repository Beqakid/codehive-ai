/**
 * GET /api/m6/dashboard — Dashboard summary data
 *
 * Returns aggregated stats for all async runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../payload.config'
import { scanForStalledRuns } from '../../../../../lib/heartbeatManager'

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })

    // Scan for stalled runs (side effect: marks them as stalled)
    const stalledScan = await scanForStalledRuns(payload)
    const stalledCount = stalledScan.filter((s) => s.isStalled).length

    // Get run counts by status
    const statuses = ['queued', 'processing', 'completed', 'failed', 'cancelled', 'stalled']
    const counts: Record<string, number> = {}

    for (const status of statuses) {
      const result = await payload.find({
        collection: 'async-runs' as any,
        where: { status: { equals: status } },
        limit: 0,
        overrideAccess: true,
      })
      counts[status] = result.totalDocs
    }

    // Get recent runs
    const recentRuns = await payload.find({
      collection: 'async-runs' as any,
      sort: '-createdAt',
      limit: 10,
      overrideAccess: true,
    })

    // Calculate average duration of completed runs
    const completedRuns = await payload.find({
      collection: 'async-runs' as any,
      where: { status: { equals: 'completed' } },
      sort: '-completedAt',
      limit: 50,
      overrideAccess: true,
    })

    const avgDurationMs = completedRuns.docs.length > 0
      ? completedRuns.docs.reduce((acc: number, r: any) => acc + (r.durationMs || 0), 0) / completedRuns.docs.length
      : 0

    return NextResponse.json({
      summary: {
        totalRuns: Object.values(counts).reduce((a, b) => a + b, 0),
        byStatus: counts,
        stalledDetected: stalledCount,
        avgDurationMs: Math.round(avgDurationMs),
        avgDurationFormatted: formatDuration(avgDurationMs),
      },
      recentRuns: recentRuns.docs.map((r: any) => ({
        runId: r.runId,
        title: r.title,
        projectName: r.projectName,
        status: r.status,
        currentStep: r.currentStep,
        completedSteps: r.completedSteps,
        totalSteps: r.totalSteps,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        durationMs: r.durationMs,
      })),
    })
  } catch (err) {
    console.error('[M6 GET /dashboard] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}
