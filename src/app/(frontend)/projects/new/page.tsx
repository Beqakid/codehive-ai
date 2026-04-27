'use client'

import React, { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import HiveBackground from '@/components/HiveBackground'

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
      const data = (await res.json()) as { error?: string; project?: { id: number } }
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
    <div style={{ minHeight: '100vh', background: '#070d1a', position: 'relative' }}>
      <HiveBackground />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '3.5rem 1.5rem',
          minHeight: '100vh',
        }}
      >
        <div style={{ width: '100%', maxWidth: 560 }}>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '2rem',
              fontSize: '0.78rem',
            }}
          >
            <Link href="/projects" style={{ color: '#475569', textDecoration: 'none' }}>
              Projects
            </Link>
            <span style={{ color: '#1e3a5f' }}>/</span>
            <span style={{ color: '#94a3b8' }}>New Project</span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                }}
              >
                🐝
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: '#f1f5f9',
                  letterSpacing: '-0.02em',
                }}
              >
                New Project
              </h1>
            </div>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Create a project to start generating code with your AI agents.
            </p>
          </div>

          {/* Form card */}
          <div
            style={{
              background: 'rgba(13,21,38,0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(30,58,95,0.8)',
              borderRadius: 14,
              padding: '2rem',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
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
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(245,158,11,0.6)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(30,58,95,0.8)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>
                  Description{' '}
                  <span style={{ color: '#334155', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will this project build?"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(245,158,11,0.6)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(30,58,95,0.8)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Repo URL */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={labelStyle}>
                  GitHub Repo URL{' '}
                  <span style={{ color: '#334155', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/you/repo"
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(245,158,11,0.6)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(30,58,95,0.8)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 9,
                    color: '#f87171',
                    fontSize: '0.85rem',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link
                  href="/projects"
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(30,41,59,0.5)',
                    color: '#94a3b8',
                    border: '1px solid rgba(30,58,95,0.6)',
                    borderRadius: 9,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  style={{
                    flex: 2,
                    padding: '0.75rem',
                    background:
                      loading || !name.trim()
                        ? 'rgba(30,41,59,0.5)'
                        : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: loading || !name.trim() ? '#475569' : '#000',
                    border: 'none',
                    borderRadius: 9,
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                    boxShadow:
                      !loading && name.trim() ? '0 4px 14px rgba(245,158,11,0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? 'Creating…' : '🐝 Create Project'}
                </button>
              </div>
            </form>
          </div>

          {/* Tip */}
          <p
            style={{
              marginTop: '1.5rem',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#1e3a5f',
            }}
          >
            You can link a GitHub repo and connect AI agents after creation.
          </p>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.9rem',
  borderRadius: 9,
  border: '1px solid rgba(30,58,95,0.8)',
  background: 'rgba(7,13,26,0.7)',
  color: '#e2e8f0',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}
