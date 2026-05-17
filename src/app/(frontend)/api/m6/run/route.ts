/**
 * POST /api/m6/run — Submit an async pipeline run
 * GET  /api/m6/run — List recent runs
 *
 * POST immediately returns a runId + polling endpoint.
 * Processing happens asynchronously via self-chaining HTTP calls.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../payload.config'
import { createAsyncRun } from '../../../../../lib/asyncPipeline'
import { chainNextStep, getInternalToken } from '../../../../../lib/chainScheduler'

interface RunRequestBody {
  projectId: string
  projectName: string
  repoOwner: string
  repoName: string
  title: string
  description: string
  branch?: string
}

export async function POST(req: NextRequest) {
  try {
    let body: RunRequestBody
    try {
      body = (await req.json()) as RunRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { projectId, projectName, repoOwner, repoName, title, description, branch } = body

    if (!projectId || !projectName || !repoOwner || !repoName || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, projectName, repoOwner, repoName, title, description' },
        { status: 400 },
      )
    }

    // Check API keys
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'No AI provider API key configured' },
        { status: 503 },
      )
    }

    const payload = await getPayload({ config: configPromise })

    // Create run + steps in D1
    const { runId, steps } = await createAsyncRun(payload, {
      projectId,
      projectName,
      repoOwner,
      repoName,
      title,
      description,
      branch,
    })

    // Fire-and-forget: chain to process endpoint for step 1
    chainNextStep(req.url, runId)

    // Return immediately with runId + polling URL
    return NextResponse.json({
      runId,
      status: 'queued',
      totalSteps: steps.length,
      pollUrl: `/api/m6/run/${runId}`,
      eventsUrl: `/api/m6/run/${runId}/events`,
      message: 'Pipeline queued — processing will start shortly',
    })
  } catch (err) {
    console.error('[M6 POST /api/m6/run] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })

    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    const where: any = {}
    if (projectId) where.projectId = { equals: projectId }
    if (status) where.status = { equals: status }

    const runs = await payload.find({
      collection: 'async-runs' as any,
      where: Object.keys(where).length > 0 ? where : undefined,
      sort: '-createdAt',
      limit: Math.min(limit, 50),
      overrideAccess: true,
    })

    return NextResponse.json({
      runs: runs.docs,
      totalDocs: runs.totalDocs,
      hasNextPage: runs.hasNextPage,
    })
  } catch (err) {
    console.error('[M6 GET /api/m6/run] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
