import { NextRequest, NextResponse } from 'next/server'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator } from '@/agents/orchestrator'
import { isDeveloperOrAbove } from '@/access/roles'

export async function POST(req: NextRequest) {
  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    // Authenticate the request
    const headers = await getHeaders()
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isDeveloperOrAbove(user)) {
      return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 })
    }

    const body = await req.json()
    const { codingRequestId } = body

    if (!codingRequestId) {
      return NextResponse.json(
        { error: 'codingRequestId is required' },
        { status: 400 },
      )
    }

    // Run the orchestrator pipeline
    const result = await runOrchestrator(payload, codingRequestId)

    return NextResponse.json({
      success: true,
      agentPlan: result.agentPlan,
      runs: {
        product: { id: result.runs.product.id, status: 'completed' },
        architect: { id: result.runs.architect.id, status: 'completed' },
        reviewer: { id: result.runs.reviewer.id, status: 'completed' },
      },
    })
  } catch (error: any) {
    console.error('Agent plan generation failed:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    )
  }
}
