'use client'

interface ReviewerVerdict {
  decision: 'APPROVE' | 'REJECT' | 'NEEDS_CHANGES'
  score: number
  reasons: string[]
  riskyFiles: string[]
  missingTests: string[]
  rollbackConcerns: string[]
  securityIssues: string[]
  recommendation: string
}

const decisionConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  APPROVE: { label: 'APPROVED', color: '#00ff88', bg: '#00ff8818', icon: '✅' },
  REJECT: { label: 'REJECTED', color: '#ff4444', bg: '#ff444418', icon: '🚫' },
  NEEDS_CHANGES: { label: 'NEEDS CHANGES', color: '#ffaa00', bg: '#ffaa0018', icon: '⚠️' },
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#00ff88' : score >= 50 ? '#ffaa00' : '#ff4444'

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#333333"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <span style={{ color, fontSize: '22px', fontWeight: 800, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ color: '#888888', fontSize: '10px', marginTop: '2px' }}>
          / 100
        </span>
      </div>
    </div>
  )
}

function ListSection({
  title,
  items,
  icon,
  color,
}: {
  title: string
  items: string[]
  icon: string
  color: string
}) {
  if (!items || items.length === 0) return null

  return (
    <div style={{ marginTop: '16px' }}>
      <h4
        style={{
          color,
          fontSize: '13px',
          fontWeight: 600,
          margin: '0 0 8px 0',
        }}
      >
        {icon} {title}
      </h4>
      <ul
        style={{
          margin: 0,
          padding: '0 0 0 18px',
          listStyleType: 'disc',
        }}
      >
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              color: '#e0e0e0',
              fontSize: '13px',
              lineHeight: '1.6',
              marginBottom: '4px',
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReviewerVerdictCard({ verdict }: { verdict: ReviewerVerdict }) {
  const config = decisionConfig[verdict.decision] || decisionConfig.NEEDS_CHANGES

  return (
    <div
      style={{
        background: '#0a0a0a',
        border: `1px solid ${config.color}44`,
        borderRadius: '12px',
        overflow: 'hidden',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {/* Decision header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          background: config.bg,
          borderBottom: `1px solid ${config.color}33`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '28px' }}>{config.icon}</span>
          <div>
            <div
              style={{
                color: config.color,
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '1px',
              }}
            >
              {config.label}
            </div>
            <div style={{ color: '#888888', fontSize: '12px', marginTop: '2px' }}>
              Reviewer Verdict
            </div>
          </div>
        </div>

        <ScoreRing score={verdict.score} />
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        <ListSection title="Reasons" items={verdict.reasons} icon="📋" color="#e0e0e0" />
        <ListSection title="Risky Files" items={verdict.riskyFiles} icon="⚠️" color="#ffaa00" />
        <ListSection title="Missing Tests" items={verdict.missingTests} icon="🧪" color="#ff4444" />
        <ListSection
          title="Rollback Concerns"
          items={verdict.rollbackConcerns}
          icon="↩️"
          color="#ffaa00"
        />

        {verdict.securityIssues && verdict.securityIssues.length > 0 && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: '#ff444415',
              border: '1px solid #ff444433',
              borderRadius: '8px',
            }}
          >
            <h4
              style={{
                color: '#ff4444',
                fontSize: '13px',
                fontWeight: 700,
                margin: '0 0 8px 0',
              }}
            >
              🔒 Security Issues
            </h4>
            <ul style={{ margin: 0, padding: '0 0 0 18px', listStyleType: 'disc' }}>
              {verdict.securityIssues.map((issue, i) => (
                <li
                  key={i}
                  style={{
                    color: '#ff8888',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    marginBottom: '4px',
                  }}
                >
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendation */}
        {verdict.recommendation && (
          <div
            style={{
              marginTop: '20px',
              padding: '14px 18px',
              background: '#111111',
              border: '1px solid #00ff8833',
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                color: '#00ff88',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              💡 Recommendation
            </div>
            <div
              style={{
                color: '#e0e0e0',
                fontSize: '13px',
                lineHeight: '1.6',
              }}
            >
              {verdict.recommendation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
