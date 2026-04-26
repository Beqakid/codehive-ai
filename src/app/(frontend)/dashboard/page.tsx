import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import { AgentRunner } from '@/components/AgentRunner'
import '../styles.css'

export const metadata = {
  title: 'Dashboard — CodeHive AI',
}

interface DocWithStatus {
  id: number
  status?: string
  title?: string
  name?: string
  priority?: string
  description?: string
  codingRequest?: Record<string, unknown> | number
  createdAt: string
}

export default async function DashboardPage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect('/admin')
  }

  const [projects, codingRequests, agentPlans] = await Promise.all([
    payload.find({ collection: 'projects', limit: 10, sort: '-createdAt' }),
    payload.find({ collection: 'coding-requests', limit: 10, sort: '-createdAt' }),
    payload.find({ collection: 'agent-plans', limit: 5, sort: '-createdAt', depth: 1 }),
  ])

  const statusCounts: Record<string, number> = {
    draft: 0,
    submitted: 0,
    planning: 0,
    approved: 0,
    in_progress: 0,
    completed: 0,
    rejected: 0,
  }
  codingRequests.docs.forEach((req) => {
    const doc = req as unknown as DocWithStatus
    const s = doc.status as string
    if (s in statusCounts) statusCounts[s]++
  })

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: 1200,
        margin: '0 auto',
        padding: '2rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>🐝 CodeHive AI Dashboard</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666' }}>Welcome back, {user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/projects" style={linkBtnStyle}>
            Projects
          </Link>
          <Link href="/admin" style={{ ...linkBtnStyle, background: '#333' }}>
            Admin Panel
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <StatCard label="Projects" value={projects.totalDocs} color="#3b82f6" />
        <StatCard label="Coding Requests" value={codingRequests.totalDocs} color="#8b5cf6" />
        <StatCard label="Agent Plans" value={agentPlans.totalDocs} color="#10b981" />
        <StatCard label="Approved" value={statusCounts.approved} color="#22c55e" />
        <StatCard label="In Progress" value={statusCounts.in_progress} color="#f59e0b" />
        <StatCard label="Completed" value={statusCounts.completed} color="#06b6d4" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Recent Projects */}
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Recent Projects</h2>
          {projects.docs.length === 0 ? (
            <p style={{ color: '#999' }}>No projects yet. Create one in the admin panel.</p>
          ) : (
            projects.docs.map((p) => {
              const project = p as unknown as DocWithStatus
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  style={listItemStyle}
                >
                  <span style={{ fontWeight: 500 }}>{project.name}</span>
                  <StatusBadge status={project.status ?? 'draft'} />
                </Link>
              )
            })
          )}
        </div>

        {/* Recent Coding Requests */}
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Recent Coding Requests</h2>
          {codingRequests.docs.length === 0 ? (
            <p style={{ color: '#999' }}>No coding requests yet.</p>
          ) : (
            codingRequests.docs.map((c) => {
              const cr = c as unknown as DocWithStatus
              return (
                <div
                  key={cr.id}
                  style={{ ...listItemStyle, flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{cr.title}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <PriorityBadge priority={cr.priority ?? 'medium'} />
                      <StatusBadge status={cr.status ?? 'draft'} />
                    </div>
                  </div>
                  <AgentRunner codingRequestId={cr.id} title={cr.title ?? ''} />
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Latest Agent Plans */}
      <div style={{ ...cardStyle, marginTop: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Latest Agent Plans</h2>
        {agentPlans.docs.length === 0 ? (
          <p style={{ color: '#999' }}>
            No agent plans generated yet. Click &ldquo;🤖 Run AI Agents&rdquo; on a coding request
            above.
          </p>
        ) : (
          agentPlans.docs.map((p) => {
            const plan = p as unknown as DocWithStatus
            const crRef = plan.codingRequest
            const crTitle =
              typeof crRef === 'object' && crRef !== null && 'title' in crRef
                ? String(crRef.title)
                : `Request #${String(crRef)}`
            return (
              <div key={plan.id} style={listItemStyle}>
                <span style={{ fontWeight: 500 }}>{crTitle}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <StatusBadge status={plan.status ?? 'draft'} />
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>
                    {new Date(plan.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '1.25rem',
        borderTop: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#dcfce7', text: '#166534' },
    draft: { bg: '#f3f4f6', text: '#374151' },
    submitted: { bg: '#dbeafe', text: '#1e40af' },
    planning: { bg: '#fef3c7', text: '#92400e' },
    approved: { bg: '#dcfce7', text: '#166534' },
    in_progress: { bg: '#fed7aa', text: '#9a3412' },
    completed: { bg: '#cffafe', text: '#155e75' },
    rejected: { bg: '#fecaca', text: '#991b1b' },
    archived: { bg: '#e5e7eb', text: '#4b5563' },
    paused: { bg: '#e5e7eb', text: '#4b5563' },
    superseded: { bg: '#e5e7eb', text: '#4b5563' },
  }
  const c = colors[status] || colors.draft
  return (
    <span
      style={{
        fontSize: '0.7rem',
        padding: '2px 8px',
        borderRadius: 9999,
        background: c.bg,
        color: c.text,
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: '#6b7280',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
  }
  return (
    <span
      style={{
        fontSize: '0.65rem',
        padding: '1px 6px',
        borderRadius: 4,
        border: `1px solid ${colors[priority] || '#999'}`,
        color: colors[priority] || '#999',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {priority}
    </span>
  )
}

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.5rem 1rem',
  background: '#3b82f6',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 500,
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '1.25rem',
}

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.6rem 0',
  borderBottom: '1px solid #f3f4f6',
  textDecoration: 'none',
  color: 'inherit',
}
