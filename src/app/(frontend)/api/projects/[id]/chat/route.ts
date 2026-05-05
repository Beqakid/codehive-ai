import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { runProjectChat, ProjectContext, MemoryEntry } from '@/agents/projectChatAgent'

export const dynamic = 'force-dynamic'

/** Safely extract string from Payload JSON fields stored as { markdown: string } or plain string */
function extractMarkdown(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'markdown' in val) {
    const md = (val as Record<string, unknown>).markdown
    return typeof md === 'string' ? md : undefined
  }
  return undefined
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const projectId = parseInt(id, 10)

  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  let body: { messages?: unknown[] } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const messages = (body.messages ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>

  const payload = await getPayload({ config })

  // ── Load project ──────────────────────────────────────────────────────────
  let project: { id: number; name: string; description?: string; githubUrl?: string } | null = null
  try {
    const p = await payload.findByID({
      collection: 'projects',
      id: projectId,
      overrideAccess: true,
    })
    project = p as typeof project
  } catch {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Parse owner/repo from github URL
  let repoOwner = 'Beqakid'
  let repoName = 'codehive-sanbox'
  if (project.githubUrl) {
    const match = project.githubUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (match) {
      repoOwner = match[1]
      repoName = match[2]
    }
  }

  // ── Load persistent memories ───────────────────────────────────────────────
  let memories: MemoryEntry[] = []
  try {
    const memResult = await payload.find({
      collection: 'project-memory',
      where: { project: { equals: projectId } },
      sort: '-createdAt',
      limit: 30,
      overrideAccess: true,
    })
    memories = (memResult.docs ?? []).map((m: Record<string, unknown>) => ({
      id: m.id as number,
      type: (m.type as string) ?? 'context',
      summary: (m.summary as string) ?? '',
      content: (m.content as string) ?? '',
      importance: (m.importance as string) ?? 'medium',
      tags: m.tags as string | undefined,
      source: (m.source as string) ?? 'agent',
      createdAt: (m.createdAt as string) ?? new Date().toISOString(),
    }))
  } catch {
    // Non-fatal — memories just won't be available
    memories = []
  }

  // ── Load latest plan ───────────────────────────────────────────────────────
  let latestPlan: ProjectContext['latestPlan'] = undefined
  try {
    const plans = await payload.find({
      collection: 'agent-plans',
      where: { codingRequest: { exists: true } },
      sort: '-createdAt',
      limit: 20,
      overrideAccess: true,
    })
    // Find the plan associated with this project
    const plan = plans.docs.find((p: Record<string, unknown>) => {
      const cr = p.codingRequest as { project?: { id?: number } | number } | null
      if (!cr) return false
      const projId = typeof cr === 'object' && cr.project
        ? (typeof cr.project === 'object' ? cr.project.id : cr.project)
        : null
      return projId === projectId
    }) as Record<string, unknown> | undefined

    if (plan) {
      const finalPlan = (plan.finalPlan as Record<string, unknown>) ?? {}
      latestPlan = {
        id: plan.id as number,
        status: (plan.status as string) ?? 'draft',
        reviewScore: plan.reviewScore as number | null,
        verdictReason: plan.verdictReason as string | null,
        prBranch: plan.prBranch as string | null,
        prUrl: (finalPlan.prUrl as string | null) ?? null,
        // These are stored as { markdown: string } JSON objects in Payload — extract the string
        productSpec: extractMarkdown(plan.productSpec),
        architectureDesign: extractMarkdown(plan.architectureDesign),
        // uiuxDesign lives inside finalPlan JSON object
        uiuxDesign: extractMarkdown(finalPlan.uiuxDesign),
        reviewFeedback: extractMarkdown(plan.reviewFeedback),
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Load fix attempts ──────────────────────────────────────────────────────
  let fixAttempts: ProjectContext['fixAttempts'] = []
  try {
    if (latestPlan) {
      const fixes = await payload.find({
        collection: 'fix-attempts',
        where: { agentPlan: { equals: latestPlan.id } },
        sort: '-createdAt',
        limit: 10,
        overrideAccess: true,
      })
      fixAttempts = (fixes.docs ?? []).map((f: Record<string, unknown>) => ({
        id: f.id as number,
        attemptNumber: (f.attemptNumber as number) ?? 1,
        status: (f.status as string) ?? 'unknown',
        errorCategory: f.errorCategory as string | undefined,
        errorSummary: f.errorSummary as string | undefined,
        fixSummary: f.fixSummary as string | undefined,
        confidence: f.confidence as number | undefined,
        needsHumanReview: (f.needsHumanReview as boolean) ?? false,
        branchName: f.branchName as string | undefined,
      }))
    }
  } catch {
    // Non-fatal
  }

  const ctx: ProjectContext = {
    projectId,
    projectName: (project.name as string) ?? 'Unknown Project',
    projectDescription: project.description as string | undefined,
    repoOwner,
    repoName,
    repoUrl: project.githubUrl as string | undefined,
    memories,
    latestPlan,
    fixAttempts,
  }

  const githubToken = (process.env.GITHUB_TOKEN as string) ?? ''
  const anthropicKey = (process.env.ANTHROPIC_API_KEY as string) ?? ''

  // ── Action dispatcher (write_memory + project actions) ────────────────────
  const actionDispatcher = async (action: string, params: Record<string, unknown>): Promise<string> => {
    switch (action) {
      case 'write_memory': {
        try {
          await payload.create({
            collection: 'project-memory',
            data: {
              project: projectId,
              type: (params.type as string) ?? 'context',
              summary: (params.summary as string) ?? 'Untitled memory',
              content: (params.content as string) ?? '',
              importance: (params.importance as string) ?? 'medium',
              tags: params.tags as string | undefined,
              source: 'agent',
            },
            overrideAccess: true,
          })
          return `✅ Memory stored: "${params.summary}"`
        } catch (e) {
          return `Error writing memory: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'approve_plan': {
        if (!latestPlan) return 'No plan found to approve.'
        try {
          await payload.update({
            collection: 'agent-plans',
            id: latestPlan.id,
            data: { status: 'approved', verdictApproved: true },
            overrideAccess: true,
          })
          return `✅ Plan #${latestPlan.id} approved. Code generation can now begin.`
        } catch (e) {
          return `Error approving plan: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      case 'trigger_fix':
        return `ACTION:trigger_fix:${latestPlan?.prBranch ?? ''}:${latestPlan?.id ?? ''}`

      case 'trigger_codegen':
        return `ACTION:trigger_codegen:${latestPlan?.prBranch ?? ''}:${latestPlan?.id ?? ''}`

      case 'trigger_sandbox':
        return `ACTION:trigger_sandbox:${latestPlan?.prBranch ?? ''}:${latestPlan?.id ?? ''}`

      default:
        return `Unknown action: ${action}`
    }
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = async (obj: object) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
    } catch {
      // Client disconnected
    }
  }

  // Run agent in background
  runProjectChat(messages, ctx, githubToken, anthropicKey, send, actionDispatcher)
    .catch(async (e) => {
      await send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    })
    .finally(async () => {
      try { await writer.close() } catch { /* already closed */ }
    })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
