/**
 * GET /api/m1/runs/[runId]
 * Returns full detail for a single planning run, including the plan markdown.
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

    const run = await payload.findByID({
      collection: 'agent-runs',
      id: runId,
      overrideAccess: true,
    })

    if (!run) {
      return Response.json({ error: 'Run not found' }, { status: 404 })
    }

    // Fetch the linked coding request for the user request text
    const runAny = run as Record<string, unknown>
    let userRequest = ''
    try {
      const codingReq = await payload.findByID({
        collection: 'coding-requests',
        id: String(runAny.codingRequest),
        overrideAccess: true,
      })
      userRequest = codingReq?.description || ''
    } catch {
      // Non-fatal
    }

    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        agentName: run.agentName,
        runType: runAny.runType,
        branchName: runAny.branchName,
        prUrl: runAny.prUrl,
        planMarkdown: runAny.planMarkdown,
        output: runAny.output,
        input: run.input,
        durationMs: run.durationMs,
        errorMessage: run.errorMessage,
        createdAt: runAny.createdAt,
        updatedAt: runAny.updatedAt,
        userRequest,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
