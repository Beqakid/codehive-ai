'use client'

import React from 'react'

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  filePath: string
  message: string
}

interface ReviewGateCheck {
  gateId: string
  name: string
  decision: string
  reason: string
  details?: string
}

interface Props {
  valid: boolean
  issues: ValidationIssue[]
  summary: string
  reviewGateChecks?: ReviewGateCheck[]
  reviewGateDecision?: string
  scopeAllowed?: string[]
  scopeRestricted?: string[]
  scopeBlocked?: string[]
}

export default function ValidationSummary({
  valid,
  issues,
  summary,
  reviewGateChecks,
  reviewGateDecision,
  scopeAllowed,
  scopeRestricted,
  scopeBlocked,
}: Props) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const gateIcon = (decision: string) => {
    switch (decision) {
      case 'auto_approve': return '✅'
      case 'confirmation_required': return '⚠️'
      case 'approval_required': return '🔒'
      case 'blocked': return '🚫'
      default: return '❓'
    }
  }

  const gateColor = (decision: string) => {
    switch (decision) {
      case 'auto_approve': return '#00ff88'
      case 'confirmation_required': return '#ffaa00'
      case 'approval_required': return '#ff8800'
      case 'blocked': return '#ff0044'
      default: return '#888'
    }
  }

  return (
    <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: valid ? '#00ff88' : '#ff4444', margin: 0, fontSize: '18px', fontFamily: 'monospace' }}>
          {valid ? '✅' : '❌'} Validation Summary
        </h3>
        <span style={{ color: '#a0a0b0', fontFamily: 'monospace', fontSize: '13px' }}>{summary}</span>
      </div>

      {/* Issue counts */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ padding: '8px 16px', background: errors.length > 0 ? '#1a0000' : '#001a00', borderRadius: '8px', border: `1px solid ${errors.length > 0 ? '#ff4444' : '#00ff88'}` }}>
          <div style={{ color: errors.length > 0 ? '#ff4444' : '#00ff88', fontFamily: 'monospace', fontSize: '20px', fontWeight: 700 }}>{errors.length}</div>
          <div style={{ color: '#888', fontFamily: 'monospace', fontSize: '11px' }}>errors</div>
        </div>
        <div style={{ padding: '8px 16px', background: warnings.length > 0 ? '#1a1000' : '#0a0a14', borderRadius: '8px', border: `1px solid ${warnings.length > 0 ? '#ffaa00' : '#1a1a2e'}` }}>
          <div style={{ color: warnings.length > 0 ? '#ffaa00' : '#888', fontFamily: 'monospace', fontSize: '20px', fontWeight: 700 }}>{warnings.length}</div>
          <div style={{ color: '#888', fontFamily: 'monospace', fontSize: '11px' }}>warnings</div>
        </div>
      </div>

      {/* Issues list */}
      {issues.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', padding: '6px 10px', borderBottom: '1px solid #111', alignItems: 'flex-start' }}>
              <span style={{ color: issue.severity === 'error' ? '#ff4444' : issue.severity === 'warning' ? '#ffaa00' : '#00aaff', fontSize: '10px', fontFamily: 'monospace', padding: '1px 4px', border: `1px solid ${issue.severity === 'error' ? '#ff4444' : '#ffaa00'}`, borderRadius: '2px', flexShrink: 0, marginTop: '2px' }}>
                {issue.severity.toUpperCase()}
              </span>
              <span style={{ color: '#00aaff', fontFamily: 'monospace', fontSize: '12px', flexShrink: 0 }}>{issue.code}</span>
              <span style={{ color: '#a0a0b0', fontFamily: 'monospace', fontSize: '12px' }}>{issue.filePath}: {issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scope summary */}
      {(scopeAllowed || scopeRestricted || scopeBlocked) && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#0a0a14', borderRadius: '8px', border: '1px solid #1a1a2e' }}>
          <div style={{ color: '#00aaff', fontSize: '13px', fontFamily: 'monospace', marginBottom: '8px' }}>📂 Scope Check</div>
          {scopeAllowed && scopeAllowed.length > 0 && (
            <div style={{ color: '#00ff88', fontSize: '12px', fontFamily: 'monospace', marginBottom: '4px' }}>✅ Allowed: {scopeAllowed.length} file(s)</div>
          )}
          {scopeRestricted && scopeRestricted.length > 0 && (
            <div style={{ color: '#ffaa00', fontSize: '12px', fontFamily: 'monospace', marginBottom: '4px' }}>⚠️ Restricted: {scopeRestricted.join(', ')}</div>
          )}
          {scopeBlocked && scopeBlocked.length > 0 && (
            <div style={{ color: '#ff4444', fontSize: '12px', fontFamily: 'monospace' }}>🚫 Blocked: {scopeBlocked.join(', ')}</div>
          )}
        </div>
      )}

      {/* Review gates */}
      {reviewGateChecks && reviewGateChecks.length > 0 && (
        <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ color: '#aa88ff', margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>🔐 Review Gates</h4>
            {reviewGateDecision && (
              <span style={{ color: gateColor(reviewGateDecision), fontFamily: 'monospace', fontSize: '12px', padding: '2px 8px', border: `1px solid ${gateColor(reviewGateDecision)}`, borderRadius: '4px' }}>
                {gateIcon(reviewGateDecision)} {reviewGateDecision.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {reviewGateChecks.map((check, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#0a0a14', borderRadius: '6px', marginBottom: '6px' }}>
              <span>{gateIcon(check.decision)}</span>
              <span style={{ color: gateColor(check.decision), fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, minWidth: '160px' }}>{check.name}</span>
              <span style={{ color: '#a0a0b0', fontFamily: 'monospace', fontSize: '11px' }}>{check.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
