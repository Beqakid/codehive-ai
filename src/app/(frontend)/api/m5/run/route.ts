/**
 * POST /api/m5/run
 *
 * Milestone 5 — Triggers the multi-agent analysis pipeline.
 * Validates inputs, resolves API keys from env, calls the agent orchestrator,
 * and returns the full PipelineResult.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../payload.config'
import { runAgentPipeline } from '../../../../../lib/agentOrchestrator'

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

    // Validate required fields
    if (!projectId || !projectName || !repoOwner || !repoName || !title || !description) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: projectId, projectName, repoOwner, repoName, title, description',
        },
        { status: 400 },
      )
    }

    // Resolve API keys from environment
    const apiKeys = {
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      github: process.env.GITHUB_TOKEN || '',
    }

    if (!apiKeys.openai && !apiKeys.anthropic) {
      return NextResponse.json(
        { error: 'No AI provider API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)' },
        { status: 503 },
      )
    }

    const payload = await getPayload({ config: configPromise })

    // Run the multi-agent pipeline
    const result = await runAgentPipeline({
      projectId,
      projectName,
      repoOwner,
      repoName,
      title,
      description,
      branch: branch || 'main',
      apiKeys,
      payload,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[M5 /api/m5/run] Pipeline error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
