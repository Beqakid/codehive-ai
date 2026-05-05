import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import HiveBackground from '@/components/HiveBackground'
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

  // If the user has projects, drop them straight into the most recent one (HiveTerminal)
  if (docs.length > 0) {
    redirect(`/projects/${docs[0].id}`)
  }

  // No projects yet — show a clean empty state
  return (
    <div style={{ minHeight: '100vh', background: '#070d1a', position: 'relative' }}>
      <HiveBackground />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🐝</div>

        <h1
          style={{
            margin: '0 0 0.5rem',
            fontSize: '2rem',
            fontWeight: 800,
            color: '#f1f5f9',
            letterSpacing: '-0.03em',
          }}
        >
          Welcome to CodeHive
        </h1>

        <p
          style={{
            margin: '0 0 2.5rem',
            color: '#64748b',
            fontSize: '1rem',
            maxWidth: 420,
            lineHeight: 1.6,
          }}
        >
          Your hive is empty. Create your first project and let the agents get to work.
        </p>

        <Link
          href="/projects/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.85rem 2rem',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#000',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: '1rem',
            textDecoration: 'none',
            boxShadow: '0 4px 24px rgba(245,158,11,0.3)',
            transition: 'transform 0.15s',
          }}
        >
          + Create First Project
        </Link>

        {/* Subtle feature hints */}
        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            marginTop: '3rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 640,
          }}
        >
          {[
            { icon: '🏗️', label: 'Architect Agent' },
            { icon: '💻', label: 'Code Generator' },
            { icon: '🧪', label: 'Sandbox Tests' },
            { icon: '🔧', label: 'Auto Fix Loop' },
            { icon: '🧠', label: 'Persistent Memory' },
            { icon: '🤖', label: 'Autopilot Mode' },
          ].map((f) => (
            <div
              key={f.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.9rem',
                background: 'rgba(13,21,38,0.7)',
                border: '1px solid rgba(30,58,95,0.6)',
                borderRadius: 999,
                color: '#475569',
                fontSize: '0.8rem',
                fontWeight: 500,
              }}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
