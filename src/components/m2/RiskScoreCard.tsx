'use client'

/**
 * RiskScoreCard — M2 component
 * Displays risk level, score, confidence, and key factors.
 * Uses full inline styles — Tailwind gets purged on CF Workers build.
 */

import type { RiskLevel } from '../../lib/riskEngine'

interface RiskFactor {
  name: string
  triggered: boolean
  weight: number
  description: string
}

interface RiskScoreCardProps {
  riskLevel: RiskLevel
  riskScore: number
  confidenceScore: number
  rollbackComplexity?: string
  implementationScope?: string
  factors?: RiskFactor[]
  recommendations?: string[]
  compact?: boolean
}

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string; badge: string }> = {
  LOW: { bg: '#0f1f17', border: '#22c55e', text: '#86efac', badge: '#22c55e' },
  MEDIUM: { bg: '#1f1a0f', border: '#f59e0b', text: '#fcd34d', badge: '#f59e0b' },
  HIGH: { bg: '#1f0f0f', border: '#ef4444', text: '#fca5a5', badge: '#ef4444' },
  CRITICAL: { bg: '#1a0f1f', border: '#7c3aed', text: '#c4b5fd', badge: '#7c3aed' },
}

const RISK_EMOJIS: Record<RiskLevel, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🔴',
  CRITICAL: '🚨',
}

export function RiskScoreCard({
  riskLevel,
  riskScore,
  confidenceScore,
  rollbackComplexity,
  implementationScope,
  factors = [],
  recommendations = [],
  compact = false,
}: RiskScoreCardProps) {
  const colors = RISK_COLORS[riskLevel] ?? RISK_COLORS.MEDIUM
  const emoji = RISK_EMOJIS[riskLevel] ?? '⚠️'
  const triggeredFactors = factors.filter((f) => f.triggered)

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: compact ? '12px 16px' : '20px 24px',
        fontFamily: 'monospace',
        color: '#e2e8f0',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: compact ? 18 : 24 }}>{emoji}</span>
          <div>
            <div style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: colors.text, letterSpacing: '0.05em' }}>
              {riskLevel} RISK
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Score: {riskScore}/100 · Confidence: {confidenceScore}%
            </div>
          </div>
        </div>
        {/* Score gauge */}
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              width: compact ? 48 : 64,
              height: compact ? 48 : 64,
              borderRadius: '50%',
              border: `3px solid ${colors.badge}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <span style={{ fontSize: compact ? 14 : 18, fontWeight: 800, color: colors.badge }}>{riskScore}</span>
            <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.05em' }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: compact ? 8 : 14 }}>
        <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${riskScore}%`,
              background: colors.badge,
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {!compact && (
        <>
          {/* Scope + Rollback */}
          {(rollbackComplexity || implementationScope) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              {implementationScope && (
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>SCOPE</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{implementationScope}</div>
                </div>
              )}
              {rollbackComplexity && (
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>ROLLBACK</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{rollbackComplexity}</div>
                </div>
              )}
            </div>
          )}

          {/* Triggered factors */}
          {triggeredFactors.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Risk Factors ({triggeredFactors.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {triggeredFactors.slice(0, 5).map((f) => (
                  <div
                    key={f.name}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '6px 10px',
                      background: 'rgba(239,68,68,0.08)',
                      borderRadius: 6,
                      borderLeft: '2px solid #ef4444',
                    }}
                  >
                    <span style={{ fontSize: 10, marginTop: 2 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 11, color: '#fca5a5', fontWeight: 600 }}>{f.name.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{f.description}</div>
                    </div>
                  </div>
                ))}
                {triggeredFactors.length > 5 && (
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '4px 0' }}>
                    +{triggeredFactors.length - 5} more factors
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Recommendations
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recommendations.slice(0, 4).map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#94a3b8', paddingLeft: 12, borderLeft: `2px solid ${colors.border}` }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
