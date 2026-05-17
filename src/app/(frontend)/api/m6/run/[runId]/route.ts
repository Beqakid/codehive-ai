/**
 * GET /api/m6/run/[runId] — Get run status + all steps
 *
 * Returns the full state of an async pipeline run including
 * all step statuses, outputs, and timing information.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../payload.config'
import { getAsyncRunState } from '../../../../../../lib/asyncPipeline'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const payload = await getPayload({ config: configPromise })
    const state = await getAsyncRunState(payload, runId)

    if (!state) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Compute progress percentage
    const completedCount = state.steps.filter(
      (s: any) => s.status === 'completed' || s.status === 'skipped'
    ).length
    const progress = Math.round((completedCount / state.steps.length) * 100)

    // Parse verdict from metadata if available
    let verdict = null
    try {
      const meta = JSON.parse(state.run.metadata || '{}')
      verdict = meta.verdict || null
    } catch { /* ignore */ }

    return NextResponse.json({
      run: {
        runId: state.run.runId,
        projectId: state.run.projectId,
        projectName: state.run.projectName,
        title: state.run.title,
        status: state.run.status,
        currentStep: state.run.currentStep,
        progress,
        completedSteps: state.run.completedSteps,
        totalSteps: state.run.totalSteps,
        failedSteps: state.run.failedSteps,
        heartbeatAt: state.run.heartbeatAt,
        startedAt: state.run.startedAt,
        completedAt: state.run.completedAt,
        durationMs: state.run.durationMs,
        error: state.run.error,
        verdict,
      },
      steps: state.steps.map((s: any) => ({
        stepName: s.stepName,
        stepIndex: s.stepIndex,
        status: s.status,
        model: s.model,
        markdown: s.markdown,
        error: s.error,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationMs: s.durationMs,
        retryCount: s.retryCount,
        maxRetries: s.maxRetries,
        // Don't send full output in list view — use separate endpoint
        hasOutput: !!s.output,
      })),
    })
  } catch (err) {
    console.error('[M6 GET /api/m6/run/[runId]] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
