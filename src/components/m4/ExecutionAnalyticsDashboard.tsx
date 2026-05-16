'use client'

import React from 'react'

interface AnalyticsData {
  totalRuns: number
  successRate: number
  avgBuildDuration: number
  avgTestDuration: number
  patchSuccessRate: number
  selfHealSuccessRate: number
  artifactUploadFailures: number
  prSuccessRate: number
  blockedPatchRate: number
}

interface ExecutionAnalyticsDashboardProps {
  analytics: AnalyticsData
  period: string
}

function MetricCard({ label, value, unit, color }: { label: string; value: number | string; unit?: string; color: string }) {
  return (
    <div style={{ padding: 16, background: '#111827', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}{unit || ''}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '8px 12px', background: '#111827', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#e2e8f0' }}>{label}</span>
        <span style={{ fontSize: 12, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

export function ExecutionAnalyticsDashboard({ analytics, period }: ExecutionAnalyticsDashboardProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f59e0b' }}>📊 Execution Analytics</h3>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{period}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Total Runs" value={analytics.totalRuns} color="#3b82f6" />
        <MetricCard label="Avg Build" value={analytics.avgBuildDuration} unit="ms" color="#f59e0b" />
        <MetricCard label="Avg Test" value={analytics.avgTestDuration} unit="ms" color="#22c55e" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ProgressBar label="Success Rate" value={analytics.successRate} color="#22c55e" />
        <ProgressBar label="Patch Success" value={analytics.patchSuccessRate} color="#3b82f6" />
        <ProgressBar label="Self-Heal Success" value={analytics.selfHealSuccessRate} color="#f59e0b" />
        <ProgressBar label="PR Success" value={analytics.prSuccessRate} color="#8b5cf6" />
        <ProgressBar label="Blocked Patches" value={analytics.blockedPatchRate} color="#ef4444" />
      </div>

      {analytics.artifactUploadFailures > 0 && (
        <div style={{ marginTop: 12, padding: 8, background: '#1c1917', borderRadius: 6, fontSize: 12, color: '#f59e0b', textAlign: 'center' }}>
          ⚠️ {analytics.artifactUploadFailures} artifact upload failure{analytics.artifactUploadFailures !== 1 ? 's' : ''} this {period}
        </div>
      )}
    </div>
  )
}
