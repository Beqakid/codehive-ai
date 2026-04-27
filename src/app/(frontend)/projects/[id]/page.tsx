import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect, notFound } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import { AgentRunner } from '@/components/AgentRunner'
import { CodeGenRunner } from '@/components/CodeGenRunner'
import { SandboxRunner } from '@/components/SandboxRunner'
import '../../styles.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Project — CodeHive AI',
}

interface ProjectDoc {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
  owner?: { email: string } | number
  createdAt: string
}

interface CodingRequestDoc {
  id: number
  title: string
  description?: string
  status: string
  priority: string
}

interface AgentPlanDoc {
  id: number
  codingRequest?: { title: string } | number
  reviewFeedback?: { overallScore?: number }
  finalPlan?: { prUrl?: string }
  status: string
  createdAt: string
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  active:      { bg: 'rgba(16,185,129,0.12)',  text: '#10b981' },
  draft:       { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' },
  submitted:   { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa' },
  planning:    { bg: 'rgba(245,158,11,0.12)',  text: '#fbbf24' },
  approved:    { bg: 'rgba(16,185,129,0.12)',  text: '#34d399' },
  in_progress: { bg: 'rgba(251,146,60,0.12)',  text: '#fb923c' },
  completed:   { bg: 'rgba(34,211,238,0.12)',  text: '#22d3ee' },
  rejected:    { bg: 'rgba(239,68,68,0.12)',   text: '#f87171' },
  archived:    { bg: 'rgba(100,116,139,0.08)', text: '#64748b' },
}

const PRIORITY_COLOR: Record<string, string> = {
  low: '#64748b', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626',
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

  let project: ProjectDoc
  try {
    const result = await payload.findByID({
      collection: 'projects',
      id: parseInt(id, 10),
      depth: 1,
    })
    project = result as unknown as ProjectDoc
  } catch {
    notFound()
  }

  if (!project!) notFound()

  const codingRequests = await payload.find({
    collection: 'coding-requests',
    where: { project: { equals: project.id } },
    sort: '-createdAt',
    limit: 50,
  })

  const crIds = codingRequests.docs.map((cr) => (cr as unknown as CodingRequestDoc).id)
  let agentPlans: { docs: unknown[]; totalDocs: number } = { docs: [], totalDocs: 0 }
  if (crIds.length > 0) {
    agentPlans = await payload.find({
      collection: 'agent-plans',
      where: { codingRequest: { in: crIds.join(',') } },
      sort: '-createdAt',
      limit: 20,
      depth: 1,
    })
  }

  const ownerEmail =
    typeof project.owner === 'object' && project.owner !== null
      ? project.owner.email
      : null

  const sc = STATUS_COLOR[project.status] || STATUS_COLOR.draft!

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 52px)',
        background: '#070d1a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem 1.5rem',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem', fontSize: '0.82rem' }}>
          <Link href="/dashboard" style={{ color: '#475569', textDecoration: 'none' }}>Dashboard</Link>
          <span style={{ color: '#1e3a5f' }}>/</span>
          <Link href="/projects" style={{ color: '#475569', textDecoration: 'none' }}>Projects</Link>
          <span style={{ color: '#1e3a5f' }}>/</span>
          <span style={{ color: '#94a3b8' }}>{project.name}</span>
        </div>

        {/* Project header */}
        <div
          style={{
            background: '#0d1526',
            border: '1px solid #1e3a5f',
            borderRadius: 12,
            padding: '1.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9' }}>{project.name}</h1>
                <span style={{
                  fontSize: '0.7rem', padding: '3px 10px', borderRadius: 9999,
                  background: sc.bg, color: sc.text, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>{project.status}</span>
              </div>
              {project.description && (
                <p style={{ margin: '0 0 0.75rem', color: '#64748b', lineHeight: 1.6, fontSize: '0.9rem' }}>
                  {project.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap' }}>
                {ownerEmail && <span>👤 {ownerEmail}</span>}
                <span>📅 {new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                {project.repoUrl && (
                  <a href={project.repoUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    🔗 Repository ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Coding Requests', value: codingRequests.totalDocs, color: '#8b5cf6' },
            { label: 'Agent Plans',     value: agentPlans.totalDocs,     color: '#3b82f6' },
            { label: 'Approved Plans',  value: (agentPlans.docs as AgentPlanDoc[]).filter((p) => p.status === 'approved').length, color: '#10b981' },
          ].map((s) => (
            <div key={s.label} style={{
              background: '#0d1526', border: '1px solid #1e3a5f',
              borderRadius: 10, padding: '1.1rem 1.25rem', borderTop: `2px solid ${s.color}`,
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Coding Requests */}
        <div style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: 3, height: 18, background: '#8b5cf6', borderRadius: 2 }} />
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
                Coding Requests <span style={{ color: '#475569', fontWeight: 400 }}>({codingRequests.totalDocs})</span>
              </h2>
            </div>
            <Link href="/admin/collections/coding-requests/create"
              style={{ padding: '0.35rem 0.85rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
              + New Request
            </Link>
          </div>

          {codingRequests.docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#475569' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No coding requests yet. Create one to start the AI pipeline.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {codingRequests.docs.map((c) => {
                const cr = c as unknown as CodingRequestDoc
                const csc = STATUS_COLOR[cr.status] || STATUS_COLOR.draft!
                return (
                  <div
                    key={cr.id}
                    style={{
                      background: '#070d1a',
                      border: '1px solid #1e3a5f',
                      borderRadius: 8,
                      padding: '1rem 1.1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f1f5f9' }}>{cr.title}</div>
                        {cr.description && (
                          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem', lineHeight: 1.4 }}>
                            {cr.description.substring(0, 120)}{cr.description.length > 120 ? '…' : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: '1rem', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.67rem', padding: '2px 7px', borderRadius: 9999,
                          background: csc.bg, color: csc.text, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>{cr.status?.replace('_', ' ')}</span>
                        <span style={{
                          fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4,
                          border: `1px solid ${PRIORITY_COLOR[cr.priority] || '#64748b'}`,
                          color: PRIORITY_COLOR[cr.priority] || '#64748b',
                          fontWeight: 600, textTransform: 'uppercase',
                        }}>{cr.priority}</span>
                      </div>
                    </div>
                    <AgentRunner codingRequestId={cr.id} title={cr.title} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Agent Plans History */}
        <div style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
            <div style={{ width: 3, height: 18, background: '#3b82f6', borderRadius: 2 }} />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
              Agent Plans History <span style={{ color: '#475569', fontWeight: 400 }}>({agentPlans.totalDocs})</span>
            </h2>
          </div>

          {agentPlans.docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#475569' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No agent plans yet. Click &ldquo;🤖 Run AI Agents&rdquo; on a coding request above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(agentPlans.docs as AgentPlanDoc[]).map((plan) => {
                const crRef = plan.codingRequest
                const crTitle =
                  typeof crRef === 'object' && crRef !== null && 'title' in crRef
                    ? crRef.title
                    : `Request #${String(crRef)}`
                const prUrl = plan.finalPlan?.prUrl
                const isApproved = plan.status === 'approved'
                const psc = STATUS_COLOR[plan.status] || STATUS_COLOR.draft!

                return (
                  <div
                    key={plan.id}
                    style={{
                      background: '#070d1a',
                      border: '1px solid #1e3a5f',
                      borderRadius: 8,
                      padding: '1rem 1.1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isApproved ? '0.75rem' : 0 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{crTitle}</div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem' }}>
                          <span>{new Date(plan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {prUrl && (
                            <a href={prUrl} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#3b82f6', textDecoration: 'none' }}>
                              View PR ↗
                            </a>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.68rem', padding: '2px 9px', borderRadius: 9999,
                        background: psc.bg, color: psc.text, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>{plan.status?.replace('_', ' ')}</span>
                    </div>

                    {isApproved && <CodeGenRunner planId={plan.id} prUrl={prUrl} />}
                    {isApproved && prUrl && <SandboxRunner planId={plan.id} prUrl={prUrl} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
