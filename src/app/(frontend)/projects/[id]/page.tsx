import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect, notFound } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import { CodeGenRunner } from '@/components/CodeGenRunner'
import { SandboxRunner } from '@/components/SandboxRunner'
import { FixRunner } from '@/components/FixRunner'
import { ChatFixPanel } from '@/components/ChatFixPanel'
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
  verdictReason?: string | null
  reviewScore?: number | null
  productSpec?: { markdown?: string } | null
  architectureDesign?: { markdown?: string } | null
  reviewFeedback?: { markdown?: string } | null
  finalPlan?: { prUrl?: string; title?: string; project?: string; generatedAt?: string; repoUrl?: string } | null
  createdAt?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#34d399', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
  planning: { label: 'Planning', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
  submitted: { label: 'Submitted', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', dot: '#3b82f6' },
  approved: { label: 'Approved', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#a855f7' },
  needs_revision: { label: 'Needs Revision', color: '#fb923c', bg: 'rgba(249,115,22,0.12)', dot: '#f97316' },
  draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(71,85,105,0.12)', dot: '#475569' },
  rejected: { label: 'Rejected', color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#ef4444' },
  archived: { label: 'Archived', color: '#475569', bg: 'rgba(71,85,105,0.12)', dot: '#334155' },
}

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(30,41,59,0.5)', dot: '#475569' }
}

function extractMarkdown(field: unknown): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object' && field !== null && 'markdown' in field) {
    return String((field as { markdown?: string }).markdown ?? '')
  }
  return ''
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

  const cfg = getStatusCfg(project.status)
  const latestPlan = plans[0] ?? null
  const isApproved = latestPlan?.status === 'approved'
  const isNeedsRevision = latestPlan?.status === 'needs_revision'
  const latestPrUrl = latestPlan?.finalPlan?.prUrl ?? undefined

  // Check for fix attempts needing human review
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
            padding: '2rem 2rem 0',
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* Breadcrumbs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                fontSize: '0.78rem',
              }}
            >
              <Link
                href="/dashboard"
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                Dashboard
              </Link>
              <span style={{ color: '#1e3a5f', fontSize: '0.7rem' }}>›</span>
              <Link
                href="/projects"
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                Projects
              </Link>
              <span style={{ color: '#1e3a5f', fontSize: '0.7rem' }}>›</span>
              <span
                style={{
                  color: '#94a3b8',
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.name}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                paddingBottom: '1.75rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  {/* Gradient icon badge */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
                      border: '1px solid rgba(59,130,246,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    📁
                  </div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '1.55rem',
                      fontWeight: 800,
                      color: '#f1f5f9',
                      letterSpacing: '-0.02em',
                    }}
                  >
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
                  <p
                    style={{
                      margin: 0,
                      color: '#64748b',
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                      marginLeft: 48,
                    }}
                  >
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
                      marginLeft: 48,
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

            {/* Rainbow accent line */}
            <div
              style={{
                height: 2,
                background: 'linear-gradient(to right, #3b82f6, #8b5cf6, #f59e0b, #ef4444)',
                borderRadius: 1,
              }}
            />
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}
        >
          {/* AI Runners */}
          {latestPlan && (
            <div
              style={{
                background: 'rgba(13,21,38,0.8)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(30,58,95,0.7)',
                borderRadius: 14,
                padding: 0,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              }}
            >
              {/* Top accent line */}
              <div
                style={{
                  height: 2,
                  background: 'linear-gradient(to right, #f59e0b, #d97706, #ea580c)',
                  borderRadius: '14px 14px 0 0',
                }}
              />

              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                  {/* Gradient icon badge */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))',
                      border: '1px solid rgba(245,158,11,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      flexShrink: 0,
                    }}
                  >
                    🤖
                  </div>
                  <span
                    style={{
                      color: '#e2e8f0',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    AI Runners
                  </span>
                  <span style={{ color: '#475569', fontSize: '0.72rem' }}>—</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600 }}>Plan #{latestPlan.id}</span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: getStatusCfg(latestPlan.status).bg,
                      color: getStatusCfg(latestPlan.status).color,
                      fontWeight: 700,
                      border: `1px solid ${getStatusCfg(latestPlan.status).dot}40`,
                    }}
                  >
                    {getStatusCfg(latestPlan.status).label}
                  </span>
                  {latestPlan.reviewScore != null && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: latestPlan.reviewScore >= 7.5 ? 'rgba(16,185,129,0.12)' : 'rgba(249,115,22,0.12)',
                        color: latestPlan.reviewScore >= 7.5 ? '#34d399' : '#fb923c',
                        fontWeight: 700,
                        border: `1px solid ${latestPlan.reviewScore >= 7.5 ? '#10b981' : '#f97316'}40`,
                      }}
                    >
                      Score: {latestPlan.reviewScore}/10
                    </span>
                  )}
                </div>

                {isApproved ? (
                  <>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      <div style={{ flex: 1, minWidth: 280 }}>
                        <CodeGenRunner planId={latestPlan.id} prUrl={latestPrUrl} />
                      </div>
                      <div style={{ flex: 1, minWidth: 280 }}>
                        <SandboxRunner planId={latestPlan.id} />
                      </div>
                    </div>
                    {/* Run & Fix Until Stable — full width below the two runners */}
                    <FixRunner planId={latestPlan.id} prUrl={latestPrUrl} />
                    {/* Interactive Fix Chat — appears when auto-fix fails */}
                    {showFixChat && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <ChatFixPanel
                          planId={latestPlan.id}
                          projectName={project.name}
                          fixAttemptCount={fixAttemptCount}
                          latestError={latestErrorSummary}
                        />
                      </div>
                    )}
                  </>
                ) : isNeedsRevision ? (
                  <div
                    style={{
                      padding: '1.5rem',
                      background: 'rgba(249,115,22,0.06)',
                      border: '1px solid rgba(249,115,22,0.3)',
                      borderRadius: 12,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Orange accent top line */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        background: 'linear-gradient(to right, #f97316, #ea580c, #fb923c)',
                        borderRadius: '12px 12px 0 0',
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: 'rgba(249,115,22,0.12)',
                          border: '1px solid rgba(249,115,22,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.1rem',
                          flexShrink: 0,
                        }}
                      >
                        ⚠️
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: '#fb923c',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            marginBottom: '0.35rem',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          Reviewer Flagged This Plan
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.6 }}>
                          The AI reviewer determined this plan needs revision before code generation can proceed.
                          {latestPlan.reviewScore != null && (
                            <>
                              {' '}
                              Review score:{' '}
                              <strong style={{ color: '#fb923c' }}>{latestPlan.reviewScore}/10</strong>{' '}
                              (threshold: 7.5).
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reviewer concerns */}
                    {latestPlan.verdictReason && (
                      <div
                        style={{
                          background: 'rgba(7,13,26,0.6)',
                          border: '1px solid rgba(30,58,95,0.5)',
                          borderRadius: 10,
                          padding: '1rem 1.25rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: '#f97316',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <span style={{ fontSize: '0.75rem' }}>💬</span>
                          Reviewer Concerns
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {latestPlan.verdictReason}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        paddingTop: '0.25rem',
                        borderTop: '1px solid rgba(249,115,22,0.15)',
                      }}
                    >
                      <ApprovePlanButton planId={latestPlan.id} variant="override" />
                      <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                        Override will approve this plan and allow code generation to proceed.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '1.25rem',
                      background: 'rgba(245,158,11,0.07)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        ⏳ Plan not yet approved
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        This plan is in <strong style={{ color: '#94a3b8' }}>{latestPlan.status}</strong> status.
                        It must be approved before code generation can run.
                        Use the <strong style={{ color: '#94a3b8' }}>Dashboard → Command Interface</strong> to run the
                        full agent pipeline, or approve this plan manually below.
                      </div>
                    </div>
                    <ApprovePlanButton planId={latestPlan.id} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Agent plans */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                marginBottom: '1.25rem',
              }}
            >
              {/* Gradient icon badge */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(129,140,248,0.2))',
                  border: '1px solid rgba(96,165,250,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  flexShrink: 0,
                }}
              >
                📋
              </div>
              <span
                style={{
                  color: '#e2e8f0',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Agent Plans
              </span>
              <span
                style={{
                  background: 'rgba(30,58,95,0.5)',
                  color: '#64748b',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 8px',
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
                  padding: '3.5rem 2rem',
                  background: 'rgba(13,21,38,0.6)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 14,
                  border: '1px dashed rgba(30,58,95,0.6)',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🤖</div>
                <p
                  style={{
                    margin: 0,
                    color: '#64748b',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    marginBottom: '0.35rem',
                  }}
                >
                  No agent plans yet
                </p>
                <p
                  style={{
                    margin: 0,
                    color: '#475569',
                    fontSize: '0.8rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  Submit a coding request via the Dashboard to get started.
                </p>
                <Link
                  href="/dashboard"
                  style={{
                    display: 'inline-block',
                    padding: '0.55rem 1.3rem',
                    background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxShadow: '0 0 20px rgba(245,158,11,0.25)',
                  }}
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {plans.map((plan) => {
                  const planCfg = getStatusCfg(plan.status)
                  const productText = extractMarkdown(plan.productSpec)
                  const architectText = extractMarkdown(plan.architectureDesign)
                  const reviewText = extractMarkdown(plan.reviewFeedback)
                  const planPrUrl = plan.finalPlan?.prUrl

                  return (
                    <div
                      key={plan.id}
                      style={{
                        background: 'rgba(13,21,38,0.8)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(30,58,95,0.7)',
                        borderRadius: 14,
                        padding: 0,
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                      }}
                    >
                      {/* Top accent line using plan status color */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          right: 0,
                          height: 2,
                          background: `linear-gradient(to right, ${planCfg.dot}, ${planCfg.color})`,
                          borderRadius: '14px 14px 0 0',
                        }}
                      />
                      {/* Left edge bar */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 3,
                          background: planCfg.dot,
                          borderRadius: '14px 0 0 14px',
                        }}
                      />
                      <div style={{ padding: '1.25rem 1.4rem 1.25rem 1.75rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.85rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.92rem' }}>
                              Plan #{plan.id}
                            </span>
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
                            {plan.reviewScore != null && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '2px 7px',
                                  borderRadius: 9999,
                                  background:
                                    plan.reviewScore >= 7.5
                                      ? 'rgba(16,185,129,0.12)'
                                      : 'rgba(249,115,22,0.12)',
                                  color: plan.reviewScore >= 7.5 ? '#34d399' : '#fb923c',
                                  fontWeight: 600,
                                  border: `1px solid ${plan.reviewScore >= 7.5 ? '#10b981' : '#f97316'}40`,
                                }}
                              >
                                {plan.reviewScore}/10
                              </span>
                            )}
                          </div>
                          {plan.createdAt && (
                            <span style={{ fontSize: '0.7rem', color: '#475569' }}>
                              {new Date(plan.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '1rem',
                          }}
                        >
                          {productText && (
                            <div
                              style={{
                                padding: '0.75rem',
                                background: 'rgba(7,13,26,0.5)',
                                borderRadius: 8,
                                border: '1px solid rgba(30,58,95,0.4)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#60a5fa',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  marginBottom: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#60a5fa', display: 'inline-block' }} />
                                Product
                              </div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                {productText.substring(0, 140)}
                                {productText.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          {architectText && (
                            <div
                              style={{
                                padding: '0.75rem',
                                background: 'rgba(7,13,26,0.5)',
                                borderRadius: 8,
                                border: '1px solid rgba(30,58,95,0.4)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#c084fc',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  marginBottom: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#c084fc', display: 'inline-block' }} />
                                Architecture
                              </div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                {architectText.substring(0, 140)}
                                {architectText.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          {reviewText && (
                            <div
                              style={{
                                padding: '0.75rem',
                                background: 'rgba(7,13,26,0.5)',
                                borderRadius: 8,
                                border: '1px solid rgba(30,58,95,0.4)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#34d399',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  marginBottom: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#34d399', display: 'inline-block' }} />
                                Review
                              </div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                {reviewText.substring(0, 140)}
                                {reviewText.length > 140 ? '…' : ''}
                              </p>
                            </div>
                          )}
                        </div>

                        {planPrUrl && (
                          <a
                            href={planPrUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              marginTop: '0.85rem',
                              fontSize: '0.78rem',
                              color: '#60a5fa',
                              textDecoration: 'none',
                              fontWeight: 600,
                              padding: '4px 10px',
                              background: 'rgba(96,165,250,0.08)',
                              borderRadius: 6,
                              border: '1px solid rgba(96,165,250,0.2)',
                            }}
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

function ApprovePlanButton({ planId, variant }: { planId: number; variant?: 'override' }) {
  const isOverride = variant === 'override'
  return (
    <form action={`/api/plans/${planId}/approve`} method="POST">
      <button
        type="submit"
        style={{
          padding: '0.55rem 1.3rem',
          background: isOverride
            ? 'linear-gradient(135deg, #ea580c, #f97316)'
            : 'linear-gradient(135deg, #d97706, #f59e0b)',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          boxShadow: isOverride
            ? '0 0 20px rgba(249,115,22,0.3)'
            : '0 0 20px rgba(245,158,11,0.25)',
          letterSpacing: '-0.01em',
        }}
      >
        {isOverride ? '⚡ Override & Approve' : '✅ Approve Plan'}
      </button>
    </form>
  )
}
