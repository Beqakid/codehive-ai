'use client'

import React from 'react'

interface PipelineStage {
  id: string
  label: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  durationMs?: number
  detail?: string
}

interface Props {
  stages: PipelineStage[]
  currentStage?: string
}

export default function ValidationPipelineStatus({ stages, currentStage }: Props) {
  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'passed': return '✅'
      case 'failed': return '❌'
      case 'skipped': return '⏭️'
      default: return '❓'
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#555'
      case 'running': return '#00aaff'
      case 'passed': return '#00ff88'
      case 'failed': return '#ff4444'
      case 'skipped': return '#666'
      default: return '#888'
    }
  }

  const connectorColor = (idx: number) => {
    if (idx >= stages.length - 1) return 'transparent'
    const current = stages[idx]
    if (current.status === 'passed') return '#00ff88'
    if (current.status === 'failed') return '#ff4444'
    return '#1a1a2e'
  }

  return (
    <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e' }}>
      <h3 style={{ color: '#00aaff', margin: '0 0 20px 0', fontSize: '18px', fontFamily: 'monospace' }}>⚡ Validation Pipeline</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {stages.map((stage, i) => {
          const isCurrent = stage.id === currentStage
          return (
            <div key={stage.id}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 16px',
                background: isCurrent ? '#111128' : 'transparent',
                borderRadius: '8px',
                border: isCurrent ? '1px solid #00aaff33' : '1px solid transparent',
                transition: 'all 0.2s',
              }}>
                {/* Icon */}
                <div style={{
                  width: '32px', height: '32px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: stage.status === 'running' ? '#00aaff15' : stage.status === 'passed' ? '#00ff8815' : stage.status === 'failed' ? '#ff444415' : '#111',
                  border: `2px solid ${statusColor(stage.status)}`,
                  fontSize: '14px',
                  flexShrink: 0,
                }}>
                  {statusIcon(stage.status)}
                </div>

                {/* Label + detail */}
                <div style={{ flex: 1 }}>
                  <div style={{ color: statusColor(stage.status), fontFamily: 'monospace', fontSize: '14px', fontWeight: isCurrent ? 700 : 400 }}>
                    {stage.label}
                  </div>
                  {stage.detail && (
                    <div style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px', marginTop: '2px' }}>{stage.detail}</div>
                  )}
                </div>

                {/* Duration */}
                {stage.durationMs !== undefined && stage.durationMs > 0 && (
                  <div style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px' }}>
                    {stage.durationMs}ms
                  </div>
                )}
              </div>

              {/* Connector line */}
              {i < stages.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '39px' }}>
                  <div style={{ width: '2px', height: '8px', background: connectorColor(i) }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
