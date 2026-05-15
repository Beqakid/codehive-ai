'use client'

import React from 'react'

interface SandboxStep {
  step: string
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

interface SandboxResult {
  provider: string
  success: boolean
  steps: SandboxStep[]
  totalDurationMs: number
  errors: string[]
  summary: string
}

interface HealAttempt {
  attemptNumber: number
  errorCategory: string
  healAction: string
  success: boolean
  resultMessage: string
  durationMs: number
}

interface Props {
  sandboxResult: SandboxResult | null
  healAttempts?: HealAttempt[]
}

export default function TestResultsPanel({ sandboxResult, healAttempts }: Props) {
  if (!sandboxResult) {
    return (
      <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e', color: '#a0a0b0' }}>
        <p>No test results available.</p>
      </div>
    )
  }

  const stepIcon = (status: string) => status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️'
  const stepColor = (status: string) => status === 'passed' ? '#00ff88' : status === 'failed' ? '#ff4444' : '#888'

  return (
    <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: '#00aaff', margin: 0, fontSize: '18px', fontFamily: 'monospace' }}>🧪 Sandbox Results</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: sandboxResult.success ? '#00ff88' : '#ff4444', fontFamily: 'monospace', fontSize: '13px' }}>
            {sandboxResult.success ? '✅ All Passed' : '❌ Failed'}
          </span>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '12px' }}>{sandboxResult.totalDurationMs}ms</span>
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px', padding: '2px 6px', border: '1px solid #333', borderRadius: '3px' }}>
            {sandboxResult.provider}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {sandboxResult.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#111122', borderRadius: '8px', border: `1px solid ${step.status === 'failed' ? '#331111' : '#1a1a2e'}` }}>
            <span style={{ fontSize: '16px' }}>{stepIcon(step.status)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: stepColor(step.status), fontFamily: 'monospace', fontSize: '14px', fontWeight: 600 }}>
                {step.step}
              </div>
              {step.status === 'failed' && step.stderr && (
                <div style={{ color: '#ff6666', fontFamily: 'monospace', fontSize: '11px', marginTop: '4px', maxHeight: '80px', overflow: 'auto' }}>
                  {step.stderr.slice(0, 300)}
                </div>
              )}
            </div>
            <div style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>
              {step.durationMs}ms
            </div>
            <div style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px' }}>
              exit: {step.exitCode}
            </div>
          </div>
        ))}
      </div>

      {/* Errors */}
      {sandboxResult.errors.length > 0 && (
        <div style={{ background: '#1a0000', border: '1px solid #ff4444', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ color: '#ff4444', fontSize: '13px', fontFamily: 'monospace', marginBottom: '8px' }}>Errors</div>
          {sandboxResult.errors.map((err, i) => (
            <div key={i} style={{ color: '#ff6666', fontSize: '12px', fontFamily: 'monospace' }}>• {err}</div>
          ))}
        </div>
      )}

      {/* Self-heal attempts */}
      {healAttempts && healAttempts.length > 0 && (
        <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: '16px' }}>
          <h4 style={{ color: '#aa88ff', margin: '0 0 12px 0', fontSize: '14px', fontFamily: 'monospace' }}>🔧 Self-Heal Attempts</h4>
          {healAttempts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#0a0a14', borderRadius: '6px', marginBottom: '6px' }}>
              <span>{a.success ? '✅' : '❌'}</span>
              <span style={{ color: '#a0a0b0', fontFamily: 'monospace', fontSize: '12px' }}>#{a.attemptNumber}</span>
              <span style={{ color: '#888', fontFamily: 'monospace', fontSize: '12px' }}>{a.errorCategory}</span>
              <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>→ {a.healAction}</span>
              <span style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px', marginLeft: 'auto' }}>{a.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
