'use client'

import React, { useState } from 'react'

interface ExecutionStep {
  step: string
  command: string
  status: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

interface ExecutionConsoleProps {
  runId: string
  steps: ExecutionStep[]
  totalDurationMs: number
  success: boolean
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'passed': return '✅'
    case 'failed': return '❌'
    case 'running': return '⏳'
    case 'skipped': return '⏭️'
    case 'timed_out': return '⏰'
    default: return '⬜'
  }
}

export function ExecutionConsole({ runId, steps, totalDurationMs, success }: ExecutionConsoleProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, fontFamily: 'monospace', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f59e0b' }}>⚡ Execution Console</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Run: {runId}</span>
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: success ? '#065f461a' : '#7f1d1d1a', color: success ? '#22c55e' : '#ef4444' }}>
            {success ? 'PASSED' : 'FAILED'}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{totalDurationMs}ms</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((step) => (
          <div key={step.step}>
            <div
              onClick={() => setExpandedStep(expandedStep === step.step ? null : step.step)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#111827', borderRadius: 6, cursor: 'pointer', borderLeft: `3px solid ${step.status === 'passed' ? '#22c55e' : step.status === 'failed' ? '#ef4444' : '#6b7280'}` }}
            >
              <span>{statusIcon(step.status)}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0' }}>{step.step}</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{step.command}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 60, textAlign: 'right' }}>{step.durationMs}ms</span>
              <span style={{ fontSize: 11, color: step.exitCode === 0 ? '#22c55e' : '#ef4444' }}>exit:{step.exitCode}</span>
            </div>

            {expandedStep === step.step && (
              <div style={{ margin: '4px 0 8px 16px', padding: 12, background: '#0f172a', borderRadius: 6, fontSize: 11 }}>
                {step.stdout && (
                  <div>
                    <div style={{ color: '#22c55e', marginBottom: 4 }}>stdout:</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#94a3b8', maxHeight: 200, overflow: 'auto' }}>{step.stdout}</pre>
                  </div>
                )}
                {step.stderr && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: '#ef4444', marginBottom: 4 }}>stderr:</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#fca5a5', maxHeight: 200, overflow: 'auto' }}>{step.stderr}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
