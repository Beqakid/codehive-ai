'use client'

import React, { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, repoUrl }),
      })
      const data = await res.json() as { error?: string; project?: { id: number } }
      if (!res.ok) {
        setError(data.error || 'Failed to create project')
        setLoading(false)
        return
      }
      router.push(`/projects/${data.project!.id}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 52px)',
        background: '#070d1a',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', fontSize: '0.82rem' }}>
          <Link href="/projects" style={{ color: '#64748b', textDecoration: 'none' }}>Projects</Link>
          <span style={{ color: '#334155' }}>/</span>
          <span style={{ color: '#94a3b8' }}>New Project</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🐝</div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>New Project</h1>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Create a project to start generating code with your AI agents.
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            background: '#0d1526',
            border: '1px solid #1e3a5f',
            borderRadius: 12,
            padding: '2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>
                Project Name <span style={{ color: '#f59e0b' }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. User Auth Service"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)' }}
                onBlur={(e) => { e.target.style.borderColor = '#1e3a5f'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Description <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will this project build?"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)' }}
                onBlur={(e) => { e.target.style.borderColor = '#1e3a5f'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Repo URL */}
            <div style={{ marginBottom: '1.75rem' }}>
              <label style={labelStyle}>GitHub Repo URL <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/you/repo"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)' }}
                onBlur={(e) => { e.target.style.borderColor = '#1e3a5f'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  padding: '0.7rem 1rem',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: loading ? '#92400e' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Creating…
                  </span>
                ) : '🐝 Create Project'}
              </button>
              <Link
                href="/projects"
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #1e3a5f',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Info */}
        <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, display: 'flex', gap: '0.75rem' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
            After creating your project, you can run AI agents to plan, generate, and test code automatically via GitHub Actions.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder, textarea::placeholder { color: #334155; }
      `}</style>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: '0.45rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.9rem',
  background: '#070d1a',
  border: '1px solid #1e3a5f',
  borderRadius: 7,
  fontSize: '0.95rem',
  color: '#f1f5f9',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}
