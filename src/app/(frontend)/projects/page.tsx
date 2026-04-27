import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import '../styles.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Projects — CodeHive AI',
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

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active:   { bg: 'rgba(16,185,129,0.12)', text: '#10b981', dot: '#10b981' },
  draft:    { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8', dot: '#64748b' },
  archived: { bg: 'rgba(100,116,139,0.08)', text: '#64748b', dot: '#475569' },
}

export default async function ProjectsPage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) redirect('/login')

  const projects = await payload.find({
    collection: 'projects',
    limit: 50,
    sort: '-createdAt',
    depth: 1,
  })

  const active = projects.docs.filter((p) => (p as unknown as ProjectDoc).status === 'active').length
  const draft  = projects.docs.filter((p) => (p as unknown as ProjectDoc).status === 'draft').length

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', background: '#070d1a', padding: '2.5rem 1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <div style={{ width: 4, height: 20, background: 'linear-gradient(to bottom, #f59e0b, #d97706)', borderRadius: 2 }} />
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>Projects</h1>
            </div>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
              {projects.totalDocs} project{projects.totalDocs !== 1 ? 's' : ''} · {active} active · {draft} draft
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/dashboard"
              style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#94a3b8', border: '1px solid #1e3a5f', borderRadius: 7, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
              Dashboard
            </Link>
            <Link href="/projects/new"
              style={{ padding: '0.5rem 1.1rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', borderRadius: 7, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>+</span> New Project
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Projects', value: projects.totalDocs, color: '#3b82f6' },
            { label: 'Active',          value: active,              color: '#10b981' },
            { label: 'Draft',           value: draft,               color: '#f59e0b' },
          ].map((s) => (
            <div key={s.label} style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 10, padding: '1.1rem 1.25rem', borderTop: `2px solid ${s.color}` }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {projects.docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', background: '#0d1526', borderRadius: 12, border: '1px dashed #1e3a5f' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐝</div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#f1f5f9', fontSize: '1.25rem' }}>No projects yet</h2>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>Create your first project to start generating code with AI agents.</p>
            <Link href="/projects/new"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.7rem 1.5rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.95rem' }}>
              + Create your first project
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {projects.docs.map((p) => {
              const project = p as unknown as ProjectDoc
              const sc = STATUS_COLORS[project.status] || STATUS_COLORS.draft!
              const ownerEmail = typeof project.owner === 'object' && project.owner !== null
                ? project.owner.email : ''
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  style={{
                    display: 'block',
                    background: '#0d1526',
                    border: '1px solid #1e3a5f',
                    borderRadius: 10,
                    padding: '1.4rem',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'border-color 0.15s, transform 0.12s',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Left accent bar */}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: sc.dot, borderRadius: '4px 0 0 4px' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', paddingLeft: '0.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>{project.name}</h3>
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: sc.bg,
                      color: sc.text,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      flexShrink: 0,
                      marginLeft: '0.5rem',
                    }}>{project.status}</span>
                  </div>

                  {project.description && (
                    <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5, paddingLeft: '0.25rem' }}>
                      {project.description.length > 110
                        ? project.description.substring(0, 110) + '…'
                        : project.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '0.25rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#475569' }}>
                      {ownerEmail && <span>{ownerEmail}</span>}
                      <span>{new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    {project.repoUrl && (
                      <span style={{ fontSize: '0.75rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span>⬡</span> repo
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
