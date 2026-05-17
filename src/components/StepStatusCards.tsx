'use client'
import React, { useState } from 'react'

interface Step {
  stepName: string
  stepIndex: number
  status: string
  model: string | null
  markdown: string | null
  error: string | null
  durationMs: number
  retryCount: number
  maxRetries: number
  hasOutput: boolean
}

export default function StepStatusCards({
  steps,
  onRetry,
}: {
  steps: Step[]
  onRetry?: (stepName: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'running': return '#f59e0b'
      case 'failed': return '#ef4444'
      case 'ready': return '#6366f1'
      case 'skipped': return '#6b7280'
      default: return '#374151'
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '8px',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {steps.map((step) => {
        const color = getStatusColor(step.status)
        const isExpanded = expanded === step.stepName

        return (
          <div
            key={step.stepName}
            onClick={() => setExpanded(isExpanded ? null : step.stepName)}
            style={{
              background: '#111827',
              border: `1px solid ${color}`,
              borderRadius: '8px',
              padding: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e0e0e0' }}>
                {step.stepName.replace(/_/g, ' ')}
              </span>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: color,
                display: 'inline-block',
                animation: step.status === 'running' ? 'pulse 1.5s infinite' : 'none',
              }} />
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {step.status.toUpperCase()}
              {step.durationMs > 0 && ` • ${(step.durationMs / 1000).toFixed(1)}s`}
            </div>

            {isExpanded && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1f2937' }}>
                {step.markdown && (
                  <div style={{ fontSize: '11px', color: '#d1d5db', whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto' }}>
                    {step.markdown}
                  </div>
                )}
                {step.error && (
                  <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{step.error}</div>
                )}
                {step.status === 'failed' && onRetry && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRetry(step.stepName)
                    }}
                    style={{
                      marginTop: '8px',
                      padding: '4px 12px',
                      background: '#1e1b4b',
                      border: '1px solid #6366f1',
                      borderRadius: '4px',
                      color: '#a5b4fc',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    ↻ Retry ({step.retryCount}/{step.maxRetries})
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
