import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import HiveBackground from '@/components/HiveBackground'
import ProjectCard from '@/components/ProjectCard'
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
  createdAt?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#34d399', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
  planning: { label: 'Planning', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
  submitted: { label: 'Submitted', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', dot: '#3b82f6' },
  approved: { label: 'Approved', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#a855f7' },
  archived: { label: 'Archived', color: '#475569', bg: 'rgba(71,85,105,0.12)', dot: '#334155' },
}

export default async function ProjectsPage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  let user: { id: number; email?: string } | null = null
  try {
    const authResult = await payload.auth({ headers })
    user = (authResult?.user as { id: number; email?: string } | null) ?? null
  } catch {
    // auth can throw on CF Workers — treat as unauthenticated
  }

  if (!user) redirect('/login')

  const projects = await payload.find({
    collection: 'projects',
    limit: 100,
    sort: '-createdAt',
    depth: 0,
    overrideAccess: true,
    where: {
      owner: { equals: user.id },
    },
  })

  const docs = projects.docs as unknown as ProjectDoc[]

  const total = docs.length
  const activeCount = docs.filter((d) => d.status === 'active').length
  const planningCount = docs.filter((d) => d.status === 'planning').length

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
            padding: '2.25rem 2rem 1.75rem',
          }}
        >
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.78rem' }}>
              <Link href="/dashboard" style={{ color: '#475569', textDecoration: 'none' }}>Dashboard</Link>
              <span style={{ color: '#1e3a5f' }}>/</span>
              <span style={{ color: '#94a3b8' }}>Projects</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                  🐝 Projects
                </h1>
                <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                  All your CodeHive AI workspaces
                </p>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Total', value: total, color: '#94a3b8' },
                  { label: 'Active', value: activeCount, color: '#34d399' },
                  { label: 'Planning', value: planningCount, color: '#fbbf24' },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: 'rgba(13,21,38,0.7)',
                      border: '1px solid rgba(30,58,95,0.6)',
                      borderRadius: 9,
                      padding: '0.5rem 1rem',
                      textAlign: 'center',
                      minWidth: 70,
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <Link
                href="/projects/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.25rem',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#000',
                  borderRadius: 9,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(245,158,11,0.25)',
                }}
              >
                + New Project
              </Link>
            </div>
          </div>
        </div>

        {/* Project grid */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem' }}>
          {docs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '5rem 2rem',
                background: 'rgba(13,21,38,0.6)',
                backdropFilter: 'blur(10px)',
                borderRadius: 16,
                border: '1px dashed rgba(30,58,95,0.7)',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍯</div>
              <h3 style={{ margin: '0 0 0.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>Your hive is empty</h3>
              <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.875rem' }}>Create your first project to start building with AI agents.</p>
              <Link
                href="/projects/new"
                style={{
                  display: 'inline-block',
                  padding: '0.65rem 1.5rem',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#000',
                  borderRadius: 9,
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
              >
                + New Project
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.1rem',
              }}
            >
              {docs.map((project) => (
                <ProjectCard
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  description={project.description}
                  status={project.status}
                  repoUrl={project.repoUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
