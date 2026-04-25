import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect, notFound } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import '../../styles.css'

export const metadata = {
  title: 'Project Detail — CodeHive AI',
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
  status: string
  createdAt: string
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect('/admin')
  }

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

  if (!project!) {
    notFound()
  }

  const codingRequests = await payload.find({
    collection: 'coding-requests',
    where: { project: { equals: project.id } },
    sort: '-createdAt',
    limit: 50,
  })

  // Find agent plans for this project's coding requests
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
      : 'Unknown'

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <Link href="/dashboard" style={linkStyle}>Dashboard</Link>
          <span style={{ color: '#999' }}>/</span>
          <Link href="/projects" style={linkStyle}>Projects</Link>
          <span style={{ color: '#999' }}>/</span>
          <span style={{ color: '#333' }}>{project.name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{project.name}</h1>
            {project.description && (
              <p style={{ margin: '0.5rem 0 0', color: '#666', lineHeight: 1.5 }}>{project.description}</p>
            )}
          </div>
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 12px',
            borderRadius: 9999,
            background: project.status === 'active' ? '#dcfce7' : '#f3f4f6',
            color: project.status === 'active' ? '#166534' : '#4b5563',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            {project.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#999' }}>
          <span>Owner: {ownerEmail}</span>
          <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
          {project.repoUrl && <a href={project.repoUrl} style={{ color: '#3b82f6' }} target="_blank" rel="noopener noreferrer">🔗 Repository</a>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Coding Requests */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Coding Requests ({codingRequests.totalDocs})</h2>
            <Link href="/admin/collections/coding-requests/create" style={smallBtnStyle}>+ New</Link>
          </div>
          {codingRequests.docs.length === 0 ? (
            <p style={{ color: '#999', margin: 0 }}>No coding requests yet.</p>
          ) : (
            codingRequests.docs.map((c) => {
              const cr = c as unknown as CodingRequestDoc
              return (
                <div key={cr.id} style={listItemStyle}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{cr.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.15rem' }}>
                      {cr.description?.substring(0, 80)}{(cr.description?.length ?? 0) > 80 ? '...' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <StatusBadge status={cr.status} />
                    <PriorityBadge priority={cr.priority} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Agent Plans */}
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Agent Plans ({agentPlans.totalDocs})</h2>
          {agentPlans.docs.length === 0 ? (
            <p style={{ color: '#999', margin: 0 }}>No agent plans generated yet. Use the API to trigger the agent pipeline.</p>
          ) : (
            agentPlans.docs.map((p) => {
              const plan = p as unknown as AgentPlanDoc
              const crRef = plan.codingRequest
              const crTitle =
                typeof crRef === 'object' && crRef !== null && 'title' in crRef
                  ? crRef.title
                  : `Request #${String(crRef)}`
              const reviewScore = plan.reviewFeedback?.overallScore ?? '—'
              return (
                <div key={plan.id} style={listItemStyle}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{crTitle}</div>
                    <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.15rem' }}>
                      Score: {reviewScore}/10 · {new Date(plan.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={plan.status} />
                </div>
              )
            })
          )}
        </div>
      </div>
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
  }
  const c = colors[status] || colors.draft
  return (
    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 9999, background: c.bg, color: c.text, fontWeight: 600, textTransform: 'uppercase' }}>
      {status?.replace('_', ' ')}
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
    <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, border: `1px solid ${colors[priority] || '#999'}`, color: colors[priority] || '#999', fontWeight: 600, textTransform: 'uppercase' }}>
      {priority}
    </span>
  )
}

const linkStyle: React.CSSProperties = { color: '#3b82f6', textDecoration: 'none', fontSize: '0.85rem' }
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1.25rem' }
const listItemStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }
const smallBtnStyle: React.CSSProperties = { display: 'inline-block', padding: '0.3rem 0.75rem', background: '#10b981', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 500 }
