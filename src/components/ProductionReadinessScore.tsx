'use client'

interface AgentVerdict {
  implementationConfidence: number
  riskScore: number
  testConfidence: number
  reviewerApproval: number
  productionReadiness: number
  recommendedAction: string
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#00ff88'
  if (score >= 60) return '#88ff44'
  if (score >= 40) return '#ffaa00'
  if (score >= 20) return '#ff6644'
  return '#ff4444'
}

function getActionStyle(action: string): { color: string; bg: string } {
  const lower = action.toLowerCase()
  if (lower.includes('deploy') || lower.includes('merge') || lower.includes('approve')) {
    return { color: '#00ff88', bg: '#00ff8815' }
  }
  if (lower.includes('reject') || lower.includes('block') || lower.includes('abort')) {
    return { color: '#ff4444', bg: '#ff444415' }
  }
  return { color: '#ffaa00', bg: '#ffaa0015' }
}

function GaugeCircle({ score, size = 140 }: { score: number; size?: number }) {
  const radius = (size - 14) / 2
  const circumference = 2 * Math.PI * radius
  // Show 270 degrees of arc (3/4 circle)
  const arcLength = circumference * 0.75
  const filledLength = (score / 100) * arcLength
  const color = getScoreColor(score)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#222222"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          style={{
            transition: 'stroke-dasharray 0.8s ease, stroke 0.3s ease',
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color,
            fontSize: '36px',
            fontWeight: 800,
            lineHeight: 1,
            textShadow: `0 0 20px ${color}44`,
          }}
        >
          {score}
        </span>
        <span style={{ color: '#888888', fontSize: '11px', marginTop: '4px' }}>
          Production Ready
        </span>
      </div>
    </div>
  )
}

function ScoreBar({
  label,
  score,
  maxScore = 100,
}: {
  label: string
  score: number
  maxScore?: number
}) {
  const pct = Math.min(100, Math.round((score / maxScore) * 100))
  const color = getScoreColor(pct)

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <span style={{ color: '#e0e0e0', fontSize: '13px' }}>{label}</span>
        <span style={{ color, fontSize: '13px', fontWeight: 700 }}>{score}</span>
      </div>
      <div
        style={{
          width: '100%',
          height: '6px',
          background: '#1a1a1a',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            borderRadius: '3px',
            transition: 'width 0.6s ease',
            boxShadow: `0 0 8px ${color}44`,
          }}
        />
      </div>
    </div>
  )
}

export function ProductionReadinessScore({ verdict }: { verdict: AgentVerdict }) {
  const actionStyle = getActionStyle(verdict.recommendedAction)

  return (
    <div
      style={{
        background: '#0a0a0a',
        border: '1px solid #333333',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {/* Header + Gauge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <h2
            style={{
              color: '#00ff88',
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 10px 0',
              letterSpacing: '0.5px',
            }}
          >
            🚀 Production Readiness
          </h2>

          {/* Action badge */}
          <div
            style={{
              display: 'inline-block',
              color: actionStyle.color,
              background: actionStyle.bg,
              border: `1px solid ${actionStyle.color}44`,
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {verdict.recommendedAction}
          </div>
        </div>

        <GaugeCircle score={verdict.productionReadiness} />
      </div>

      {/* Score breakdown */}
      <div
        style={{
          background: '#111111',
          border: '1px solid #1a1a1a',
          borderRadius: '8px',
          padding: '20px',
        }}
      >
        <h3
          style={{
            color: '#888888',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            margin: '0 0 16px 0',
          }}
        >
          Score Breakdown
        </h3>

        <ScoreBar label="Implementation Confidence" score={verdict.implementationConfidence} />
        <ScoreBar label="Risk Score (inverted)" score={100 - verdict.riskScore} />
        <ScoreBar label="Test Confidence" score={verdict.testConfidence} />
        <ScoreBar label="Reviewer Approval" score={verdict.reviewerApproval} />
        <div style={{ marginBottom: 0 }}>
          <ScoreBar label="Overall Readiness" score={verdict.productionReadiness} />
        </div>
      </div>
    </div>
  )
}
