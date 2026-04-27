import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect, notFound } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import CodeGenRunner from '@/components/CodeGenRunner'
import SandboxRunner from '@/components/SandboxRunner'
import HiveBackground from '@/components/HiveBackground'
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
  productAnalysis?: string
  architecturePlan?: string
  reviewNotes?: string
  prUrl?: string
  createdAt?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#34d399', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
  planning: { label: 'Planning', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
  submitted: { label: 'Submitted', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', dot: '#3b82f6' },
  approved: { label: 'Approved', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#a855f7' },
  archived: { label: 'Archived', color: '#475569', bg: 'rgba(71,85,105,0.12)', dot: '#334155' },
}

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(30,41,59,0.5)', dot: '#475569' }
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

  const projectRes = await payload.find({
    collection: 'projects',
    where: { id: { equals: Number(id) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (!projectRes.docs.length) notFound()
  const project = projectRes.docs[0] as unknown as ProjectDoc

  // Guard: agent-plans schema may differ — never crash the page
  let plans: AgentPlanDoc[] = []
  try {
    const plansRes = await payload.find({
      collection: 'agent-plans',
      limit: 20,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    })
    plans = plansRes.docs as unknown as AgentPlanDoc[]
  } catch {
    // silently ignore — plans section will show empty state
  }

  const cfg = getStatusCfg(project.status)

  return (
    <div style={{ minHeight: '100vh', background: '#070d1a', position: 'relative' }}>
      <HiveBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Page header */}
        <div
          style={{
            borderBottom: '1px solid rgba(30,58,95,0.6)',
            background: 'rgba(7,13,26,0.75)',
            backdropFilter: 'blur(14px)',
            padding: '2rem 2rem 1.75rem',
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.78rem',
              }}
            >
              <Link href="/dashboard" style={{ color: '#475569', textDecoration: 'none' }}>Dashboard</Link>
              <span style={{ color: '#1e3a5f' }}>/</span>
              <Link href="/projects" style={{ color: '#475569', textDecoration: 'none' }}>Projects</Link>
              <span style={{ color: '#1e3a5f' }}>/</span>
              <span style={{ color: '#94a3b8', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                    {project.name}
                  </h1>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '3px 10px',
                      borderRadius: 9999,
                      background: cfg.bg,
                      color: cfg.color,
                      fontWeight: 700,
                      border: `1px solid ${cfg.dot}40`,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>
                {project.description && (
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {project.description}
                  </p>
                )}
                {project.repoUrl && (
                  <a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#60a5fa',
                      textDecoration: 'none',
                    }}
                  >
                    ⎇ {project.repoUrl.replace('https://github.com/', '')} ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* AI Runner buttons */}
          <div
            style={{
              background: 'rgba(13,21,38,0.8)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(30,58,95,0.7)',
              borderRadius: 14,
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <div style={{ width: 3, height: 18, borderRadius: 9999, background: 'linear-gradient(to bottom, #f59e0b, #d97706)' }} />
              <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Runners</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <CodeGenRunner projectId={project.id} repoUrl={project.repoUrl} />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <SandboxRunner projectId={project.id} />
              </div>
            </div>
          </div>

          {/* Agent plans */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{ width: 3, height: 18, borderRadius: 9999, background: 'linear-gradient(to bottom, #60a5fa, #818cf8)' }} />
              <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agent Plans</span>
              <span
                style={{
                  background: 'rgba(30,58,95,0.5)',
                  color: '#475569',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 9999,
                  border: '1px solid rgba(30,58,95,0.7)',
                }}
              >
                {plans.length}
              </span>
            </div>

            {plans.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 2rem',
                  background: 'rgba(13,21,38,0.6)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 12,
                  border: '1px dashed rgba(30,58,95,0.6)',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤖</div>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.875rem' }}>
                  No agent plans yet — run the Code Generator above to create one.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {plans.map((plan) => {
                  const planCfg = getStatusCfg(plan.status)
                  return (
                    <div
                      key={plan.id}
                      style={{
                        background: 'rgba(13,21,38,0.8)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(30,58,95,0.7)',
                        borderRadius: 12,
                        padding: '1.25rem 1.4rem',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 3,
                          background: planCfg.dot,
                          borderRadius: '12px 0 0 12px',
                        }}
                      />
                      <div style={{ paddingLeft: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}>Plan #{plan.id}</span>
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '2px 8px',
                                borderRadius: 9999,
                                background: planCfg.bg,
                                color: planCfg.color,
                                fontWeight: 700,
                                border: `1px solid ${planCfg.dot}40`,
                              }}
                            >
                              {planCfg.label}
                            </span>
                          </div>
                          {plan.createdAt && (
                            <span style={{ fontSize: '0.7rem', color: '#334155' }}>
                              {new Date(plan.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                          {plan.productAnalysis && (
                            <div>
                              <div style={{ fontSize: '0.65rem', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Product</div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                {plan.productAnalysis.substring(0, 140)}{plan.productAnalysis.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          {plan.architecturePlan && (
                            <div>
                              <div style={{ fontSize: '0.65rem', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Architecture</div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                {plan.architecturePlan.substring(0, 140)}{plan.architecturePlan.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          {plan.reviewNotes && (
                            <div>
                              <div style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Review</div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                {plan.reviewNotes.substring(0, 140)}{plan.reviewNotes.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                        </div>
                        {plan.prUrl && (
                          <a
                            href={plan.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: '0.75rem', fontSize: '0.78rem', color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
                          >
                            🔗 View PR on GitHub ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
