'use client'

import React, { useState } from 'react'

interface StepResult {
  step: string
  command: string
  status: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

interface BuildTestLintTabsProps {
  steps: StepResult[]
}

const tabConfig: Record<string, { label: string; icon: string }> = {
  install: { label: 'Install', icon: '📦' },
  lint: { label: 'Lint', icon: '🔍' },
  typecheck: { label: 'Types', icon: '🔤' },
  build: { label: 'Build', icon: '🔨' },
  test: { label: 'Test', icon: '🧪' },
}

export function BuildTestLintTabs({ steps }: BuildTestLintTabsProps) {
  const [activeTab, setActiveTab] = useState(steps[0]?.step || 'install')
  const activeStep = steps.find((s) => s.step === activeTab)

  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden', color: '#e2e8f0' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
        {steps.map((step) => {
          const cfg = tabConfig[step.step] || { label: step.step, icon: '⚙️' }
          const isActive = activeTab === step.step
          return (
            <button
              key={step.step}
              onClick={() => setActiveTab(step.step)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                background: isActive ? '#111827' : 'transparent',
                color: isActive ? '#f59e0b' : '#6b7280',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid #f59e0b' : '2px solid transparent',
              }}
            >
              {cfg.icon} {cfg.label}
              <span style={{ marginLeft: 4, fontSize: 10, color: step.status === 'passed' ? '#22c55e' : step.status === 'failed' ? '#ef4444' : '#6b7280' }}>
                {step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '—'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeStep && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11 }}>
            <span style={{ color: '#94a3b8' }}>Command: <span style={{ fontFamily: 'monospace' }}>{activeStep.command}</span></span>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: activeStep.exitCode === 0 ? '#22c55e' : '#ef4444' }}>Exit: {activeStep.exitCode}</span>
              <span style={{ color: '#94a3b8' }}>{activeStep.durationMs}ms</span>
            </div>
          </div>

          {activeStep.stdout && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 4 }}>stdout</div>
              <pre style={{ margin: 0, padding: 10, background: '#0f172a', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{activeStep.stdout}</pre>
            </div>
          )}
          {activeStep.stderr && (
            <div>
              <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 4 }}>stderr</div>
              <pre style={{ margin: 0, padding: 10, background: '#1c1917', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: '#fca5a5', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{activeStep.stderr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
