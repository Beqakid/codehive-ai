'use client'

import React from 'react'

interface LifecycleStep {
  label: string
  status: 'completed' | 'active' | 'pending' | 'failed'
  durationMs?: number
}

interface WorkspaceLifecycleViewerProps {
  workspaceId: string
  steps: LifecycleStep[]
}

const stepColor = (status: string) => {
  switch (status) {
    case 'completed': return '#22c55e'
    case 'active': return '#f59e0b'
    case 'failed': return '#ef4444'
    default: return '#374151'
  }
}

export function WorkspaceLifecycleViewer({ workspaceId, steps }: WorkspaceLifecycleViewerProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f59e0b' }}>🔄 Workspace Lifecycle</h3>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, fontFamily: 'monospace' }}>{workspaceId}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, i) => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: stepColor(step.status), border: step.status === 'active' ? '2px solid #f59e0b' : 'none' }} />
              {i < steps.length - 1 && <div style={{ width: 2, height: 24, background: step.status === 'completed' ? '#22c55e' : '#374151' }} />}
            </div>
            <div style={{ paddingBottom: i < steps.length - 1 ? 12 : 0 }}>
              <div style={{ fontSize: 13, color: step.status === 'pending' ? '#6b7280' : '#e2e8f0' }}>{step.label}</div>
              {step.durationMs !== undefined && (
                <div style={{ fontSize: 10, color: '#6b7280' }}>{step.durationMs}ms</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
