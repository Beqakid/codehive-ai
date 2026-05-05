import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  runProjectChat,
  type ProjectContext,
  type ChatMessage,
} from '@/agents/projectChatAgent'

export const dynamic = 'force-dynamic'

function extractMarkdown(field: unknown): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object' && field !== null && 'markdown' in field) {
    return String((field as { markdown?: string }).markdown ?? '')
  }
  return ''
}

function parseRepoUrl(repoUrl: string): { owner: string; name: string } {
  const m = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/)
  return {
    owner: m?.[1] || 'Beqakid',
    name: (m?.[2] || 'codehive-sanbox').replace(/\.git$/, ''),
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await request.json()) as { messages: ChatMessage[] }
  const { messages } = body

  const githubToken = process.env.GITHUB_TOKEN || ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY || ''

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  const send = async (obj: object) => {
    try {
      await writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
    } catch {
      // writer may be closed
    }
  }

  ;(async () => {
    try {
      const payloadConfig = await config
      const payload = await getPayload({ config: payloadConfig })

      // Load project
      const projectRes = await payload.find({
        collection: 'projects',
        where: { id: { equals: Number(id) } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (!projectRes.docs.length) {
        await send({ type: 'error', message: 'Project not found' })
        await writer.close()
        return
      }

      const project = projectRes.docs[0] as unknown as {
        id: number
        name: string
        description?: string
        repoUrl?: string
        status: string
      }

      const repoUrl = project.repoUrl || ''
      const { owner: repoOwner, name: repoName } = parseRepoUrl(repoUrl)

      // Load latest plan + fix attempts
      let latestPlan: ProjectContext['latestPlan'] = undefined
      let fixAttempts: ProjectContext['fixAttempts'] = []

      try {
        const crRes = await payload.find({
          collection: 'coding-requests',
          where: { project: { equals: Number(id) } },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        const crIds = crRes.docs.map((d: any) => d.id)

        if (crIds.length > 0) {
          const plansRes = await payload.find({
            collection: 'agent-plans',
            where: { codingRequest: { in: crIds } },
            limit: 1,
            sort: '-createdAt',
            depth: 0,
            overrideAccess: true,
          })

          const plan = plansRes.docs[0] as any
          if (plan) {
            latestPlan = {
              id: plan.id,
              status: plan.status,
              reviewScore: plan.reviewScore ?? null,
              verdictReason: plan.verdictReason ?? null,
              prBranch: plan.finalPlan?.prBranch ?? null,
              prUrl: plan.finalPlan?.prUrl ?? null,
              productSpec: extractMarkdown(plan.productSpec),
              architectureDesign: extractMarkdown(plan.architectureDesign),
              reviewFeedback: extractMarkdown(plan.reviewFeedback),
              uiuxDesign: extractMarkdown(plan.uiuxDesign),
            }

            // Load fix attempts
            const faRes = await payload.find({
              collection: 'fix-attempts',
              where: { agentPlan: { equals: plan.id } },
              sort: '-attemptNumber',
              limit: 10,
              overrideAccess: true,
            })
            fixAttempts = faRes.docs.map((fa: any) => ({
              id: fa.id,
              attemptNumber: fa.attemptNumber,
              status: fa.status,
              errorCategory: fa.errorCategory,
              errorSummary: fa.errorSummary,
              fixSummary: fa.fixSummary,
              confidence: fa.confidence,
              needsHumanReview: fa.needsHumanReview,
              branchName: fa.branchName,
            }))
          }
        }
      } catch {
        // silently ignore — agent can still respond with whatever context it has
      }

      const ctx: ProjectContext = {
        projectId: Number(id),
        projectName: project.name,
        projectDescription: project.description,
        repoOwner,
        repoName,
        repoUrl,
        latestPlan,
        fixAttempts,
      }

      await runProjectChat(messages, ctx, githubToken, anthropicKey, send)
    } catch (err) {
      await send({ type: 'error', message: String(err) })
    } finally {
      try {
        await writer.close()
      } catch {}
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
