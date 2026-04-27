/**
 * @module run-fix-route
 * @description POST /api/run-fix — SSE endpoint for the Run & Fix Until Stable loop.
 * Takes planId, resolves the PR/branch from the plan, then streams the entire fix loop.
 * Uses TransformStream for Cloudflare Workers SSE compatibility.
 * All payload operations use overrideAccess: true (auth is pre-validated).
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runAndFixUntilStable, type FixSSEEvent } from '@/agents/selfFixOrchestrator'

interface RunFixBody {
  planId?: unknown
}

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  // ── 1. Init Payload ──────────────────────────────────────────────────
  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  } catch (err) {
    return Response.json({ error: `Payload init failed: ${String(err)}` }, { status: 500 })
  }

  // ── 2. Parse body ────────────────────────────────────────────────────
  let body: RunFixBody
  try {
    body = (await request.json()) as RunFixBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const planId = typeof body.planId === 'number' ? body.planId : null
  if (!planId) {
    return Response.json({ error: 'planId is required (number)' }, { status: 400 })
  }

  // ── 3. Load plan + resolve PR info ───────────────────────────────────
  let projectId: number
  let prNumber: number
  let branchName: string
  let owner: string
  let repo: string

  try {
    const plan = await payload.findByID({
      collection: 'agent-plans',
      id: planId,
      depth: 2,
      overrideAccess: true,
    })

    if (!plan) {
      return Response.json({ error: `Plan ${planId} not found` }, { status: 404 })
    }
    if (plan.status !== 'approved') {
      return Response.json(
        { error: `Plan must be approved (current: ${plan.status})` },
        { status: 400 },
      )
    }

    const finalPlan = plan.finalPlan as Record<string, unknown> | undefined
    const prUrl = finalPlan?.prUrl as string | undefined
    const repoUrl = finalPlan?.repoUrl as string | undefined

    if (!prUrl) {
      return Response.json({ error: 'Plan has no PR URL — run code generation first' }, { status: 400 })
    }
    if (!repoUrl) {
      return Response.json({ error: 'Plan has no repo URL' }, { status: 400 })
    }

    // Parse PR URL: https://github.com/owner/repo/pull/123
    const prMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!prMatch) {
      return Response.json({ error: `Cannot parse PR URL: ${prUrl}` }, { status: 400 })
    }

    owner = prMatch[1]
    repo = prMatch[2]
    prNumber = parseInt(prMatch[3], 10)

    // Get branch name from GitHub PR API
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'codehive-ai/5.0',
    }
    if (process.env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const prResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: ghHeaders },
    )
    if (!prResp.ok) {
      return Response.json({ error: 'Could not fetch PR from GitHub' }, { status: 502 })
    }
    const prData = (await prResp.json()) as { head?: { ref?: string } }
    branchName = prData.head?.ref ?? 'main'

    // Resolve project ID from codingRequest → project chain
    const crField = plan.codingRequest as unknown as
      | { id: number; project?: { id: number } | number }
      | number
    if (typeof crField === 'object' && crField !== null) {
      const proj = crField.project
      projectId =
        typeof proj === 'object' && proj !== null
          ? proj.id
          : typeof proj === 'number'
            ? proj
            : 0
    } else {
      projectId = 0
    }
  } catch (err) {
    return Response.json({ error: `Failed to load plan: ${String(err)}` }, { status: 500 })
  }

  // ── 4. SSE stream via TransformStream ─────────────────────────────────
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  const send = (event: FixSSEEvent) => {
    try {
      void writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch {
      // writer already closed
    }
  }

  // Fire-and-forget: run pipeline in background
  void (async () => {
    try {
      await runAndFixUntilStable(
        payload,
        { projectId, planId, prNumber, branchName, owner, repo },
        send,
      )
    } catch (err) {
      send({ type: 'error', message: String(err) })
    } finally {
      try {
        await writer.close()
      } catch {
        /* already closed */
      }
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
