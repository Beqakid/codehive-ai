'use client'

import { useState } from 'react'

interface PipelineStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  model?: string
  error?: string
  markdown?: string
}

const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  skipped: '⏭️',
}

const statusColors: Record<string, string> = {
  pending: '#888888',
  running: '#ffaa00',
  completed: '#00ff88',
  failed: '#ff4444',
  skipped: '#666666',
}

function formatStepName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

export function AgentTimeline({ steps }: { steps: PipelineStep[] }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
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
          margin: '0 0 24px 0',
          letterSpacing: '0.5px',
        }}
      >
        🐝 Agent Pipeline
      </h2>

      <div style={{ position: 'relative' }}>
        {steps.map((step, i) => {
          const isExpanded = expandedSteps.has(i)
          const isLast = i === steps.length - 1
          const color = statusColors[step.status] || '#888888'

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                position: 'relative',
                marginBottom: isLast ? 0 : '4px',
              }}
            >
              {/* Timeline line + dot */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '40px',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: `${color}22`,
                    border: `2px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    flexShrink: 0,
                    zIndex: 1,
                  }}
                >
                  {statusIcons[step.status]}
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: '2px',
                      flexGrow: 1,
                      minHeight: '20px',
                      background: `linear-gradient(to bottom, ${color}66, #33333366)`,
                    }}
                  />
                )}
              </div>

              {/* Step content */}
              <div
                style={{
                  flex: 1,
                  marginLeft: '12px',
                  paddingBottom: isLast ? 0 : '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    cursor: step.markdown ? 'pointer' : 'default',
                  }}
                  onClick={() => step.markdown && toggleStep(i)}
                >
                  <span
                    style={{
                      color: '#e0e0e0',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    {formatStepName(step.name)}
                  </span>

                  {step.durationMs !== undefined && (
                    <span
                      style={{
                        color: '#888888',
                        fontSize: '12px',
                        background: '#1a1a1a',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #333333',
                      }}
                    >
                      {formatDuration(step.durationMs)}
                    </span>
                  )}

                  {step.model && (
                    <span
                      style={{
                        color: '#ffaa00',
                        fontSize: '11px',
                        background: '#ffaa0015',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #ffaa0033',
                      }}
                    >
                      {step.model}
                    </span>
                  )}

                  {step.markdown && (
                    <span
                      style={{
                        color: '#888888',
                        fontSize: '11px',
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    >
                      ▶
                    </span>
                  )}
                </div>

                {step.error && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      background: '#ff444415',
                      border: '1px solid #ff444433',
                      borderRadius: '6px',
                      color: '#ff4444',
                      fontSize: '12px',
                      lineHeight: '1.5',
                    }}
                  >
                    {step.error}
                  </div>
                )}

                {isExpanded && step.markdown && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '12px 16px',
                      background: '#111111',
                      border: '1px solid #00ff8833',
                      borderRadius: '8px',
                      color: '#e0e0e0',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {step.markdown}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {steps.length === 0 && (
        <div
          style={{
            color: '#888888',
            fontSize: '14px',
            textAlign: 'center',
            padding: '32px 0',
          }}
        >
          No pipeline steps to display
        </div>
      )}
    </div>
  )
}
