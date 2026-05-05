import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect, notFound } from 'next/navigation'
import React from 'react'
import config from '@/payload.config'
import HiveTerminal from '@/components/HiveTerminal'
import '../../styles.css'

export const dynamic = 'force-dynamic'

interface ProjectDoc {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
  createdAt?: string
}

interface AgentPlanDoc {
  id: number
  status: string
  verdictReason?: string | null
  reviewScore?: number | null
  productSpec?: { markdown?: string } | null
  architectureDesign?: { markdown?: string } | null
  reviewFeedback?: { markdown?: string } | null
  finalPlan?: { prUrl?: string; title?: string; project?: string; generatedAt?: string; repoUrl?: string } | null
  createdAt?: string
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) redirect('/login')

  // ── Current project ──────────────────────────────────────────────────────
  const projectRes = await payload.find({
    collection: 'projects',
    where: { id: { equals: Number(id) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (!projectRes.docs.length) notFound()
  const project = projectRes.docs[0] as unknown as ProjectDoc

  // ── All projects (for left sidebar navigator) ────────────────────────────
  const allProjectsRes = await payload.find({
    collection: 'projects',
    limit: 100,
    sort: '-createdAt',
    depth: 0,
    overrideAccess: true,
    where: { owner: { equals: user.id } },
  })
  const allProjects = allProjectsRes.docs as unknown as ProjectDoc[]

  // ── Agent plans ──────────────────────────────────────────────────────────
  let plans: AgentPlanDoc[] = []
  try {
    const crRes = await payload.find({
      collection: 'coding-requests',
      where: { project: { equals: Number(id) } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const crIds = crRes.docs.map((d) => d.id)

    if (crIds.length > 0) {
      const plansRes = await payload.find({
        collection: 'agent-plans',
        where: { codingRequest: { in: crIds } },
        limit: 20,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      })
      plans = plansRes.docs as unknown as AgentPlanDoc[]
    }
  } catch {
    // silently ignore
  }

  const latestPlan = plans[0] ?? null

  // ── Fix attempts ─────────────────────────────────────────────────────────
  let showFixChat = false
  let fixAttemptCount = 0
  let latestErrorSummary = ''

  if (latestPlan) {
    try {
      const faRes = await payload.find({
        collection: 'fix-attempts',
        where: { agentPlan: { equals: latestPlan.id } },
        sort: '-attemptNumber',
        limit: 10,
        overrideAccess: true,
      })
      fixAttemptCount = faRes.docs.length
      showFixChat = faRes.docs.some(
        (a: any) => a.status === 'needs_human_review' || a.status === 'failed',
      )
      const failedDoc = faRes.docs.find((a: any) => a.errorSummary)
      latestErrorSummary = ((failedDoc as any)?.errorSummary || '').slice(0, 200)
    } catch {
      // silently ignore
    }
  }

  // ── Memory count (for AI brain stats) ────────────────────────────────────
  let memoryCount = 0
  try {
    const memRes = await payload.find({
      collection: 'project-memory',
      where: { project: { equals: Number(id) } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    memoryCount = memRes.totalDocs
  } catch {
    // silently ignore
  }

  // ── Lessons count (for AI brain stats) ───────────────────────────────────
  let lessonsCount = 0
  try {
    const lessonsRes = await payload.find({
      collection: 'lessons-learned',
      where: { project: { equals: Number(id) } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    lessonsCount = lessonsRes.totalDocs
  } catch {
    // silently ignore
  }

  return (
    <HiveTerminal
      project={project}
      allProjects={allProjects}
      plans={plans}
      showFixChat={showFixChat}
      fixAttemptCount={fixAttemptCount}
      latestErrorSummary={latestErrorSummary}
      memoryCount={memoryCount}
      lessonsCount={lessonsCount}
    />
  )
}
