/**
 * GET /api/m1/runs?projectId=xxx
 * Returns all planning runs for a project, newest first.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest } from 'next/server'

export const GET = async (req: NextRequest): Promise<Response> => {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    // Find coding requests for this project
    const codingRequests = await payload.find({
      collection: 'coding-requests',
      where: { project: { equals: projectId } },
      limit: 100,
      overrideAccess: true,
    })

    const requestIds = codingRequests.docs.map((r) => String(r.id))

    if (requestIds.length === 0) {
      return Response.json({ runs: [], total: 0 })
    }

    // Find planning runs linked to those requests
    const runs = await payload.find({
      collection: 'agent-runs',
      where: {
        and: [
          { codingRequest: { in: requestIds } },
          { agentName: { equals: 'planner' } },
        ],
      },
      sort: '-createdAt',
      limit: 50,
      overrideAccess: true,
    })

    const enriched = runs.docs.map((run) => {
      const runAny = run as Record<string, unknown>
      const req = codingRequests.docs.find(
        (r) => String(r.id) === String(runAny.codingRequest),
      )
      return {
        id: run.id,
        status: run.status,
        agentName: run.agentName,
        runType: runAny.runType,
        branchName: runAny.branchName,
        prUrl: runAny.prUrl,
        durationMs: run.durationMs,
        errorMessage: run.errorMessage,
        createdAt: (run as Record<string, unknown>).createdAt,
        updatedAt: (run as Record<string, unknown>).updatedAt,
        userRequest: req?.title || '',
        output: runAny.output,
      }
    })

    return Response.json({ runs: enriched, total: runs.totalDocs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
