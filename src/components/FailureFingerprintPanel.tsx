'use client'

import { useState } from 'react'

interface FailurePattern {
  fingerprint: string
  category: string
  pattern: string
  occurrenceCount: number
  lastSeen: string
  resolved: boolean
  resolution?: string
}

const categoryColors: Record<string, { color: string; bg: string }> = {
  build: { color: '#ff6644', bg: '#ff664415' },
  runtime: { color: '#ff4444', bg: '#ff444415' },
  test: { color: '#ffaa00', bg: '#ffaa0015' },
  lint: { color: '#4488ff', bg: '#4488ff15' },
  type: { color: '#aa66ff', bg: '#aa66ff15' },
  deploy: { color: '#ff44aa', bg: '#ff44aa15' },
  timeout: { color: '#ff8800', bg: '#ff880015' },
  network: { color: '#44aaff', bg: '#44aaff15' },
}

function getCategoryStyle(category: string): { color: string; bg: string } {
  const key = category.toLowerCase()
  for (const [k, v] of Object.entries(categoryColors)) {
    if (key.includes(k)) return v
  }
  return { color: '#888888', bg: '#88888815' }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

export function FailureFingerprintPanel({ failures }: { failures: FailurePattern[] }) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  const toggleCard = (i: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

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
      <h2
        style={{
          color: '#00ff88',
          fontSize: '18px',
          fontWeight: 700,
          margin: '0 0 20px 0',
          letterSpacing: '0.5px',
        }}
      >
        🔍 Failure Patterns
      </h2>

      {failures.length === 0 ? (
        <div
          style={{
            color: '#888888',
            fontSize: '14px',
            textAlign: 'center',
            padding: '32px 0',
            background: '#111111',
            borderRadius: '8px',
            border: '1px dashed #333333',
          }}
        >
          No failure patterns recorded
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {failures.map((failure, i) => {
            const catStyle = getCategoryStyle(failure.category)
            const isExpanded = expandedCards.has(i)

            return (
              <div
                key={i}
                onClick={() => toggleCard(i)}
                style={{
                  background: '#111111',
                  border: `1px solid ${failure.resolved ? '#00ff8833' : '#ff444433'}`,
                  borderRadius: '8px',
                  padding: '14px 18px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Top row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    {/* Category badge */}
                    <span
                      style={{
                        color: catStyle.color,
                        background: catStyle.bg,
                        border: `1px solid ${catStyle.color}33`,
                        padding: '2px 10px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        flexShrink: 0,
                      }}
                    >
                      {failure.category}
                    </span>

                    {/* Fingerprint */}
                    <span
                      style={{
                        color: '#888888',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        background: '#1a1a1a',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        flexShrink: 0,
                      }}
                    >
                      #{failure.fingerprint.slice(0, 8)}
                    </span>

                    {/* Resolution status */}
                    <span
                      style={{
                        color: failure.resolved ? '#00ff88' : '#ff4444',
                        fontSize: '11px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {failure.resolved ? '● Resolved' : '○ Unresolved'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {/* Occurrence count */}
                    <span
                      style={{
                        color: '#e0e0e0',
                        fontSize: '12px',
                        background: '#1a1a1a',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #333333',
                      }}
                    >
                      {failure.occurrenceCount}× seen
                    </span>

                    {/* Last seen */}
                    <span style={{ color: '#888888', fontSize: '11px' }}>
                      {formatDate(failure.lastSeen)}
                    </span>

                    {/* Expand arrow */}
                    <span
                      style={{
                        color: '#888888',
                        fontSize: '11px',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    >
                      ▶
                    </span>
                  </div>
                </div>

                {/* Pattern description */}
                <div
                  style={{
                    marginTop: '10px',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                    overflow: 'hidden',
                    textOverflow: isExpanded ? 'unset' : 'ellipsis',
                  }}
                >
                  {failure.pattern}
                </div>

                {/* Expanded: resolution */}
                {isExpanded && failure.resolved && failure.resolution && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      background: '#00ff8810',
                      border: '1px solid #00ff8833',
                      borderRadius: '6px',
                    }}
                  >
                    <div
                      style={{
                        color: '#00ff88',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '4px',
                      }}
                    >
                      ✅ Resolution
                    </div>
                    <div
                      style={{
                        color: '#e0e0e0',
                        fontSize: '13px',
                        lineHeight: '1.5',
                      }}
                    >
                      {failure.resolution}
                    </div>
                  </div>
                )}

                {isExpanded && !failure.resolved && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      background: '#ff444410',
                      border: '1px solid #ff444433',
                      borderRadius: '6px',
                    }}
                  >
                    <div
                      style={{
                        color: '#ff4444',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      ⏳ Awaiting resolution
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
