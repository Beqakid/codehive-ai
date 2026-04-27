'use client'

import React from 'react'
import Link from 'next/link'

interface ProjectCardProps {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#34d399', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
  planning: { label: 'Planning', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
  submitted: { label: 'Submitted', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', dot: '#3b82f6' },
  approved: { label: 'Approved', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#a855f7' },
  archived: { label: 'Archived', color: '#475569', bg: 'rgba(71,85,105,0.12)', dot: '#334155' },
}

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(30,41,59,0.5)', dot: '#475569' }
}

export default function ProjectCard({ id, name, description, status, repoUrl }: ProjectCardProps) {
  const cfg = getStatusCfg(status)

  return (
    <Link href={`/projects/${id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'rgba(13,21,38,0.82)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(30,58,95,0.7)',
          borderRadius: 13,
          padding: '1.25rem 1.35rem',
          transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(245,158,11,0.45)'
          el.style.transform = 'translateY(-2px)'
          el.style.boxShadow = '0 8px 28px rgba(0,0,0,0.35)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(30,58,95,0.7)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = 'none'
        }}
      >
        {/* Accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(to right, ${cfg.dot}, transparent)`,
            borderRadius: '13px 13px 0 0',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#e2e8f0',
              lineHeight: 1.3,
              maxWidth: '75%',
            }}
          >
            {name}
          </h3>
          <span
            style={{
              fontSize: '0.65rem',
              padding: '3px 9px',
              borderRadius: 9999,
              background: cfg.bg,
              color: cfg.color,
              fontWeight: 700,
              border: `1px solid ${cfg.dot}40`,
              whiteSpace: 'nowrap',
            }}
          >
            {cfg.label}
          </span>
        </div>

        {description && (
          <p
            style={{
              margin: '0 0 0.85rem',
              fontSize: '0.8rem',
              color: '#475569',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          {repoUrl ? (
            <span style={{ fontSize: '0.7rem', color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⎇</span>
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repoUrl.replace('https://github.com/', '')}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: '0.7rem', color: '#1e3a5f' }}>No repo linked</span>
          )}
          <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>Open →</span>
        </div>
      </div>
    </Link>
  )
}
