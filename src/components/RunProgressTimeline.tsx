'use client'
import React from 'react'

interface Step {
  stepName: string
  stepIndex: number
  status: string
  model: string | null
  markdown: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  durationMs: number
  retryCount: number
  maxRetries: number
  hasOutput: boolean
}

const stepIcons: Record<string, string> = {
  product: '🎯',
  repo_intelligence: '🔍',
  architect: '🏗️',
  risk_gate: '⚠️',
  code: '💻',
  patch_validation: '✅',
  sandbox: '📦',
  test: '🧪',
  fix: '🔧',
  reviewer: '👁️',
  memory: '🧠',
  pr_materialization: '📝',
}

const statusStyles: Record<string, { bg: string; border: string; icon: string }> = {
  pending: { bg: '#1f2937', border: '#374151', icon: '○' },
  ready: { bg: '#1e1b4b', border: '#4f46e5', icon: '◎' },
  running: { bg: '#1c1917', border: '#f59e0b', icon: '⟳' },
  completed: { bg: '#052e16', border: '#10b981', icon: '●' },
  failed: { bg: '#2d0000', border: '#ef4444', icon: '✖' },
  skipped: { bg: '#1f2937', border: '#4b5563', icon: '⊘' },
}

export default function RunProgressTimeline({ steps }: { steps: Step[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
      {steps.map((step, i) => {
        const style = statusStyles[step.status] || statusStyles.pending
        const isLast = i === steps.length - 1

        return (
          <div key={step.stepName} style={{ display: 'flex', gap: '12px' }}>
            {/* Timeline connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: style.border,
                border: `2px solid ${style.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                flexShrink: 0,
                marginTop: '8px',
              }} />
              {!isLast && (
                <div style={{
                  width: '2px',
                  flexGrow: 1,
                  background: step.status === 'completed' ? '#10b981' : '#374151',
                  minHeight: '20px',
                }} />
              )}
            </div>

            {/* Step card */}
            <div style={{
              flex: 1,
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: '6px',
              padding: '10px 14px',
              marginBottom: '4px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                  {stepIcons[step.stepName] || '⬡'} {step.stepName.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {step.status === 'running' && '⟳ '}
                  {step.durationMs > 0 ? `${(step.durationMs / 1000).toFixed(1)}s` : ''}
                </span>
              </div>
              {step.error && (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
                  ✖ {step.error.slice(0, 100)}
                </div>
              )}
              {step.model && step.status === 'completed' && (
                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                  Model: {step.model}
                </div>
              )}
              {step.retryCount > 0 && (
                <div style={{ fontSize: '10px', color: '#f97316', marginTop: '4px' }}>
                  Retry: {step.retryCount}/{step.maxRetries}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
