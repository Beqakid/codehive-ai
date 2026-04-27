import { headers as getHeaders } from 'next/headers.js'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import Link from 'next/link'
import config from '@/payload.config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  // Logged-in users go straight to projects
  if (user) {
    redirect('/projects')
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: 'calc(100vh - 52px)',
      }}
    >
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          padding: '5rem 2rem 4rem',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐝</div>
        <h1
          style={{
            margin: '0 0 1rem',
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            fontWeight: 800,
            lineHeight: 1.15,
          }}
        >
          AI Coding Command Center
        </h1>
        <p
          style={{
            margin: '0 auto 2.5rem',
            maxWidth: 580,
            color: 'rgba(255,255,255,0.7)',
            fontSize: '1.15rem',
            lineHeight: 1.6,
          }}
        >
          Plan, generate, and test code automatically — powered by GPT-4o and GitHub Actions.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/signup"
            style={{
              background: '#10b981',
              color: '#fff',
              padding: '0.8rem 2rem',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Get started free →
          </Link>
          <Link
            href="/login"
            style={{
              background: 'transparent',
              color: '#fff',
              padding: '0.8rem 2rem',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4rem 2rem' }}>
        <h2 style={{ textAlign: 'center', margin: '0 0 2.5rem', fontSize: '1.6rem', color: '#0f172a' }}>
          From idea to tested code — automatically
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {[
            {
              icon: '📋',
              title: 'Product Agent',
              desc: 'Turns your feature request into structured user stories and a scope breakdown.',
            },
            {
              icon: '🏗️',
              title: 'Architect Agent',
              desc: 'Designs the system architecture, file structure, and tech stack for your feature.',
            },
            {
              icon: '🔎',
              title: 'Reviewer Agent',
              desc: 'Scores the plan, flags security gaps, and proposes improvements before any code is written.',
            },
            {
              icon: '⚡',
              title: 'Code Generator',
              desc: 'Implements every file in the plan and commits them directly to your GitHub PR.',
            },
            {
              icon: '🧪',
              title: 'Sandbox Runner',
              desc: 'Triggers GitHub Actions to install deps, run tests, and post pass/fail results on your PR.',
            },
            {
              icon: '📡',
              title: 'Live Streaming',
              desc: 'Watch each agent think in real time with SSE-powered logs — no page refreshes needed.',
            },
          ].map((f) => (
            <div
              key={f.title}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '1.5rem',
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem' }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#0f172a' }}>
                {f.title}
              </h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#6b7280', lineHeight: 1.5 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '3.5rem' }}>
          <Link
            href="/signup"
            style={{
              background: '#0f172a',
              color: '#fff',
              padding: '0.8rem 2.5rem',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1rem',
              display: 'inline-block',
            }}
          >
            Start building with AI →
          </Link>
        </div>
      </div>
    </div>
  )
}
