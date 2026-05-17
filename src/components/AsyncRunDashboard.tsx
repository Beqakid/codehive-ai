'use client'
import React, { useState, useEffect, useCallback } from 'react'

interface DashboardData {
  summary: {
    totalRuns: number
    byStatus: Record<string, number>
    stalledDetected: number
    avgDurationMs: number
    avgDurationFormatted: string
  }
  recentRuns: Array<{
    runId: string
    title: string
    projectName: string
    status: string
    currentStep: string
    completedSteps: number
    totalSteps: number
    startedAt: string
    completedAt: string | null
    durationMs: number
  }>
}

const statusColors: Record<string, string> = {
  queued: '#6366f1',
  processing: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#6b7280',
  stalled: '#f97316',
}

export default function AsyncRunDashboard({ onSelectRun }: { onSelectRun?: (runId: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/m6/dashboard')
      if (res.ok) setData(await res.json())
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 10000)
    return () => clearInterval(interval)
  }, [fetchDashboard])

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#00ff41', fontFamily: "'JetBrains Mono', monospace", background: '#0a0e14' }}>
        <div style={{ animation: 'pulse 1.5s infinite' }}>⟳ Loading dashboard...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '24px', color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", background: '#0a0e14' }}>
        ✖ Failed to load dashboard
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', fontFamily: "'JetBrains Mono', monospace", background: '#0a0e14', color: '#e0e0e0', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <span style={{ fontSize: '24px' }}>⚡</span>
        <h2 style={{ margin: 0, color: '#00ff41', fontSize: '20px' }}>ASYNC PIPELINE DASHBOARD</h2>
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280' }}>
          M6 Orchestration Engine
        </span>
      </div>

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {Object.entries(data.summary.byStatus).map(([status, count]) => (
          <div key={status} style={{
            background: '#111827',
            border: `1px solid ${statusColors[status] || '#374151'}`,
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: statusColors[status] }}>{count}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginTop: '4px' }}>{status}</div>
          </div>
        ))}
        <div style={{
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#00ff41' }}>{data.summary.totalRuns}</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginTop: '4px' }}>Total</div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '12px 16px',
        background: '#111827',
        borderRadius: '8px',
        marginBottom: '24px',
        fontSize: '13px',
      }}>
        <span>⏱ Avg Duration: <span style={{ color: '#00ff41' }}>{data.summary.avgDurationFormatted}</span></span>
        {data.summary.stalledDetected > 0 && (
          <span style={{ color: '#f97316' }}>⚠ {data.summary.stalledDetected} stalled runs detected</span>
        )}
      </div>

      {/* Recent Runs */}
      <h3 style={{ color: '#00ff41', fontSize: '14px', marginBottom: '12px' }}>RECENT RUNS</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.recentRuns.map((run) => {
          const progress = Math.round((run.completedSteps / run.totalSteps) * 100)
          return (
            <div
              key={run.runId}
              onClick={() => onSelectRun?.(run.runId)}
              style={{
                background: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#00ff41' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f2937' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{run.title}</span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: statusColors[run.status] + '20',
                  color: statusColors[run.status],
                  textTransform: 'uppercase',
                }}>{run.status}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#9ca3af' }}>
                <span>{run.projectName}</span>
                <span>Step: {run.currentStep}</span>
                <span>{run.completedSteps}/{run.totalSteps}</span>
              </div>
              {/* Progress bar */}
              <div style={{ marginTop: '8px', background: '#1f2937', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: statusColors[run.status] || '#00ff41',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
