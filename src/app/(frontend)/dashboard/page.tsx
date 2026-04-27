import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import config from '@/payload.config'
import ParallelDashboard from '@/components/ParallelDashboard'
import CommandInterface from '@/components/CommandInterface'
import HiveBackground from '@/components/HiveBackground'
import '../styles.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Dashboard — CodeHive AI',
}

interface ProjectDoc {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
}

export default async function DashboardPage() {
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

  if (!user) {
    redirect('/login')
  }

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

  const projectList = projects.docs.map((p) => {
    const doc = p as unknown as ProjectDoc
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      repoUrl: doc.repoUrl,
    }
  })

  const activeCount = projectList.filter((p) => p.status === 'active').length
  const planningCount = projectList.filter((p) => p.status === 'planning').length

  return (
    <div style={{ minHeight: '100vh', background: '#070d1a', position: 'relative' }}>
      <HiveBackground />

      {/* All content sits above the background */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero header */}
        <div
          style={{
            borderBottom: '1px solid rgba(30,58,95,0.6)',
            background: 'rgba(7,13,26,0.7)',
            backdropFilter: 'blur(12px)',
            padding: '2.5rem 2rem 2rem',
          }}
        >
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '1.6rem' }}>🐝</span>
                  <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                    Command Center
                  </h1>
                </div>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                  Welcome back, <span style={{ color: '#f59e0b', fontWeight: 600 }}>{user.email}</span>
                </p>
              </div>

              {/* Stats strip */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Total Projects', value: projectList.length, color: '#60a5fa' },
                  { label: 'Active', value: activeCount, color: '#34d399' },
                  { label: 'Planning', value: planningCount, color: '#f59e0b' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: 'rgba(13,21,38,0.8)',
                      border: '1px solid rgba(30,58,95,0.7)',
                      borderRadius: 10,
                      padding: '0.65rem 1.25rem',
                      textAlign: 'center',
                      minWidth: 90,
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

          {/* Command Interface */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 3, height: 20, borderRadius: 9999, background: 'linear-gradient(to bottom, #f59e0b, #d97706)' }} />
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Command</span>
            </div>
            <CommandInterface />
          </section>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(30,58,95,0.8), transparent)' }} />

          {/* Parallel Dashboard */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 3, height: 20, borderRadius: 9999, background: 'linear-gradient(to bottom, #60a5fa, #818cf8)' }} />
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Parallel Runs</span>
              <span style={{ background: 'rgba(30,58,95,0.6)', color: '#64748b', fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(30,58,95,0.8)' }}>
                {projectList.length} projects
              </span>
            </div>
            <ParallelDashboard projects={projectList} />
          </section>
        </div>
      </div>
    </div>
  )
}
