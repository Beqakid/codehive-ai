/**
 * POST /api/sandbox/stream
 * SSE endpoint — polls GitHub Actions for the workflow run on the plan's PR branch
 * and streams live status back to the client.
 */

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runSandboxAgent, SandboxSSEEvent } from '@/agents/sandboxAgent'
import { parseGithubUrl } from '@/lib/github'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const { planId } = (await req.json()) as { planId: number }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SandboxSSEEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        const payloadConfig = await config
        const payload = await getPayload({ config: payloadConfig })

        const plan = await payload.findByID({
          collection: 'agent-plans',
          id: planId,
          depth: 1,
        })

        if (!plan) {
          send({ type: 'error', message: `Plan #${planId} not found` })
          controller.close()
          return
        }

        const finalPlan = plan.finalPlan as Record<string, unknown> | undefined
        const prUrl = finalPlan?.prUrl as string | undefined
        const repoUrl = finalPlan?.repoUrl as string | undefined

        if (!prUrl) {
          send({ type: 'error', message: 'No PR URL on this plan — run agents first' })
          controller.close()
          return
        }

        // Parse PR number from URL
        const prNumMatch = prUrl.match(/\/pull\/(\d+)$/)
        if (!prNumMatch) {
          send({ type: 'error', message: `Cannot parse PR number from: ${prUrl}` })
          controller.close()
          return
        }

        const parsedRepo = repoUrl ? parseGithubUrl(repoUrl) : null
        if (!parsedRepo) {
          send({ type: 'error', message: 'No repo URL on this plan' })
          controller.close()
          return
        }

        // Fetch PR head branch
        const ghHeaders: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'codehive-ai/4.0',
        }
        if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

        const prResp = await fetch(
          `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/pulls/${prNumMatch[1]}`,
          { headers: ghHeaders },
        )
        if (!prResp.ok) {
          send({ type: 'error', message: `Failed to fetch PR: ${prResp.status}` })
          controller.close()
          return
        }

        const prData = (await prResp.json()) as { head: { ref: string } }
        const branch = prData.head.ref

        send({ type: 'start', message: `🌿 PR branch: ${branch}` })

        await runSandboxAgent(parsedRepo.owner, parsedRepo.repo, branch, send)
      } catch (err) {
        send({ type: 'error', message: String(err) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
