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
          background: 'rgba(13,21,38,0.8)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(30,58,95,0.7)',
          borderRadius: 14,
          padding: '1.35rem 1.4rem 1.1rem',
          transition: 'border-color 0.25s, transform 0.2s, box-shadow 0.25s',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(245,158,11,0.45)'
          el.style.transform = 'translateY(-3px) scale(1.005)'
          el.style.boxShadow = `0 12px 40px rgba(0,0,0,0.4), 0 0 20px ${cfg.dot}18`
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(30,58,95,0.7)'
          el.style.transform = 'translateY(0) scale(1)'
          el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25)'
        }}
      >
        {/* Top accent gradient line using project status color */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(to right, ${cfg.dot}, ${cfg.color}88, transparent)`,
            borderRadius: '14px 14px 0 0',
          }}
        />

        {/* Header row: icon + name + status badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.7rem', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
            {/* Project icon badge */}
            <div
              style={{
                width: 28,
                height: 28,
                minWidth: 28,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${cfg.dot}22, ${cfg.color}11)`,
                border: `1px solid ${cfg.dot}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
              }}
            >
              📁
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#f1f5f9',
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.62rem',
              padding: '3px 10px',
              borderRadius: 9999,
              background: cfg.bg,
              color: cfg.color,
              fontWeight: 700,
              border: `1px solid ${cfg.dot}40`,
              whiteSpace: 'nowrap',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: cfg.dot,
                display: 'inline-block',
                boxShadow: `0 0 6px ${cfg.dot}60`,
              }}
            />
            {cfg.label}
          </span>
        </div>

        {description && (
          <p
            style={{
              margin: '0 0 0.85rem',
              fontSize: '0.8rem',
              color: '#94a3b8',
              lineHeight: 1.55,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {description}
          </p>
        )}

        {/* Spacer to push footer down */}
        <div style={{ flex: 1 }} />

        {/* Footer divider line */}
        <div
          style={{
            height: 1,
            background: 'rgba(30,58,95,0.5)',
            marginBottom: '0.7rem',
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {repoUrl ? (
            <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" fill="#64748b"/>
              </svg>
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repoUrl.replace('https://github.com/', '')}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>No repo linked</span>
          )}
          <span
            style={{
              fontSize: '0.7rem',
              color: '#f59e0b',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              letterSpacing: '0.02em',
            }}
          >
            Open
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2.5L8 6L4.5 9.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}
