'use client'

import React from 'react'

interface HealingAttempt {
  attemptId: string
  strategy: string
  targetFile: string
  errorMessage: string
  suggestedFix: string
  outcome: string
  attemptNumber: number
  maxAttempts: number
  durationMs: number
}

interface SelfHealViewerProps {
  attempts: HealingAttempt[]
  maxAttempts: number
}

const outcomeIcon = (outcome: string) => {
  switch (outcome) {
    case 'fixed': return '✅'
    case 'partial': return '🟡'
    case 'failed': return '❌'
    case 'blocked': return '🚫'
    case 'skipped': return '⏭️'
    default: return '⬜'
  }
}

const strategyLabel = (strategy: string) => {
  const labels: Record<string, string> = {
    import_fix: 'Import Fix',
    missing_dependency: 'Missing Dep',
    syntax_repair: 'Syntax Repair',
    lint_autofix: 'Lint Fix',
    format_fix: 'Format Fix',
    type_mismatch: 'Type Fix',
    path_correction: 'Path Fix',
    unused_variable: 'Unused Var',
    missing_export: 'Missing Export',
  }
  return labels[strategy] || strategy
}

export function SelfHealViewer({ attempts, maxAttempts }: SelfHealViewerProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f59e0b' }}>🔧 Self-Healing</h3>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{attempts.length}/{maxAttempts} attempts</span>
      </div>

      {attempts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#6b7280', fontSize: 13 }}>No healing attempts required</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attempts.map((attempt) => (
            <div key={attempt.attemptId} style={{ padding: 12, background: '#111827', borderRadius: 8, borderLeft: `3px solid ${attempt.outcome === 'fixed' ? '#22c55e' : attempt.outcome === 'blocked' ? '#ef4444' : '#f59e0b'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{outcomeIcon(attempt.outcome)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Attempt {attempt.attemptNumber}</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{strategyLabel(attempt.strategy)}</span>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{attempt.durationMs}ms</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>Target: {attempt.targetFile}</div>
              {attempt.suggestedFix && (
                <div style={{ fontSize: 11, color: '#a3e635', marginTop: 4 }}>{attempt.suggestedFix}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
