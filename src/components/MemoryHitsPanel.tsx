'use client'

import { useState } from 'react'

interface MemoryEntry {
  memoryType: string
  content: string
  confidence: number
  sourceRunId: string
  createdAt: string
}

const typeColors: Record<string, { color: string; bg: string }> = {
  architecture: { color: '#4488ff', bg: '#4488ff15' },
  errors: { color: '#ff4444', bg: '#ff444415' },
  fixes: { color: '#00ff88', bg: '#00ff8815' },
  rules: { color: '#ffaa00', bg: '#ffaa0015' },
}

function getTypeStyle(type: string): { color: string; bg: string } {
  const key = type.toLowerCase()
  for (const [k, v] of Object.entries(typeColors)) {
    if (key.includes(k)) return v
  }
  return { color: '#888888', bg: '#88888815' }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export function MemoryHitsPanel({
  memories,
  title,
}: {
  memories: MemoryEntry[]
  title?: string
}) {
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())

  const toggleEntry = (index: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  // Group memories by type
  const grouped = memories.reduce<Record<string, { entries: MemoryEntry[]; indices: number[] }>>(
    (acc, mem, i) => {
      const key = mem.memoryType
      if (!acc[key]) acc[key] = { entries: [], indices: [] }
      acc[key].entries.push(mem)
      acc[key].indices.push(i)
      return acc
    },
    {},
  )

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
        {title || '🧠 Memory Context'}
      </h2>

      {memories.length === 0 ? (
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
          No prior memories for this project
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(grouped).map(([type, { entries, indices }]) => {
            const style = getTypeStyle(type)
            return (
              <div key={type}>
                {/* Group header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                  }}
                >
                  <span
                    style={{
                      color: style.color,
                      background: style.bg,
                      border: `1px solid ${style.color}33`,
                      padding: '3px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {type}
                  </span>
                  <span style={{ color: '#888888', fontSize: '12px' }}>
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {/* Entries */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {entries.map((mem, j) => {
                    const globalIdx = indices[j]
                    const isExpanded = expandedEntries.has(globalIdx)
                    const confidencePct = Math.round(mem.confidence * 100)

                    return (
                      <div
                        key={globalIdx}
                        style={{
                          background: '#111111',
                          border: '1px solid #1a1a1a',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleEntry(globalIdx)}
                      >
                        {/* Top row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                          }}
                        >
                          <div
                            style={{
                              color: '#e0e0e0',
                              fontSize: '13px',
                              lineHeight: '1.4',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                            }}
                          >
                            {mem.content}
                          </div>
                          <span
                            style={{
                              color: '#888888',
                              fontSize: '11px',
                              flexShrink: 0,
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                            }}
                          >
                            ▶
                          </span>
                        </div>

                        {/* Confidence bar */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginTop: '8px',
                          }}
                        >
                          <span style={{ color: '#888888', fontSize: '11px', flexShrink: 0 }}>
                            Confidence
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: '4px',
                              background: '#1a1a1a',
                              borderRadius: '2px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${confidencePct}%`,
                                height: '100%',
                                background:
                                  confidencePct >= 80
                                    ? '#00ff88'
                                    : confidencePct >= 50
                                      ? '#ffaa00'
                                      : '#ff4444',
                                borderRadius: '2px',
                                transition: 'width 0.3s',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              color: '#e0e0e0',
                              fontSize: '11px',
                              fontWeight: 600,
                              flexShrink: 0,
                              minWidth: '30px',
                              textAlign: 'right',
                            }}
                          >
                            {confidencePct}%
                          </span>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: '10px',
                              paddingTop: '10px',
                              borderTop: '1px solid #333333',
                              display: 'flex',
                              gap: '16px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ color: '#888888', fontSize: '11px' }}>
                              Source: <span style={{ color: '#ffaa00' }}>{mem.sourceRunId.slice(0, 8)}…</span>
                            </span>
                            <span style={{ color: '#888888', fontSize: '11px' }}>
                              Created: <span style={{ color: '#e0e0e0' }}>{formatDate(mem.createdAt)}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
