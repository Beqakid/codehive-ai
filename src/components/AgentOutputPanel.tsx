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
  json?: unknown
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#888888', bg: '#88888815' },
  running: { label: 'Running', color: '#ffaa00', bg: '#ffaa0015' },
  completed: { label: 'Completed', color: '#00ff88', bg: '#00ff8815' },
  failed: { label: 'Failed', color: '#ff4444', bg: '#ff444415' },
  skipped: { label: 'Skipped', color: '#666666', bg: '#66666615' },
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

export function AgentOutputPanel({
  step,
  expanded: initialExpanded = false,
}: {
  step: PipelineStep
  expanded?: boolean
}) {
  const [showJson, setShowJson] = useState(false)
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const status = statusConfig[step.status] || statusConfig.pending

  return (
    <div
      style={{
        background: '#0a0a0a',
        border: '1px solid #333333',
        borderRadius: '12px',
        overflow: 'hidden',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: '#111111',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid #333333' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3
            style={{
              color: '#e0e0e0',
              fontSize: '15px',
              fontWeight: 700,
              margin: 0,
            }}
          >
            {formatStepName(step.name)}
          </h3>

          <span
            style={{
              color: status.color,
              background: status.bg,
              border: `1px solid ${status.color}33`,
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {status.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {step.durationMs !== undefined && (
            <span style={{ color: '#888888', fontSize: '12px' }}>
              ⏱ {formatDuration(step.durationMs)}
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
              }}
            >
              {step.model}
            </span>
          )}
          <span
            style={{
              color: '#888888',
              fontSize: '12px',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div style={{ padding: '20px' }}>
          {/* Error */}
          {step.error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#ff444415',
                border: '1px solid #ff444433',
                borderRadius: '8px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  color: '#ff4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                ❌ Error
              </div>
              <div
                style={{
                  color: '#ff8888',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {step.error}
              </div>
            </div>
          )}

          {/* Markdown output */}
          {step.markdown && (
            <div
              style={{
                padding: '16px',
                background: '#111111',
                border: '1px solid #00ff8822',
                borderRadius: '8px',
                color: '#e0e0e0',
                fontSize: '13px',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '500px',
                overflowY: 'auto',
                marginBottom: step.json ? '16px' : 0,
              }}
            >
              {step.markdown}
            </div>
          )}

          {/* JSON output */}
          {step.json && (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowJson(!showJson)
                }}
                style={{
                  background: '#1a1a1a',
                  color: '#ffaa00',
                  border: '1px solid #ffaa0033',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    transform: showJson ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    display: 'inline-block',
                  }}
                >
                  ▶
                </span>
                JSON Output
              </button>

              {showJson && (
                <pre
                  style={{
                    marginTop: '10px',
                    padding: '16px',
                    background: '#111111',
                    border: '1px solid #333333',
                    borderRadius: '8px',
                    color: '#e0e0e0',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    overflow: 'auto',
                    maxHeight: '400px',
                  }}
                >
                  {JSON.stringify(step.json, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Empty state */}
          {!step.markdown && !step.json && !step.error && (
            <div
              style={{
                color: '#888888',
                fontSize: '13px',
                textAlign: 'center',
                padding: '24px 0',
              }}
            >
              No output available for this step
            </div>
          )}
        </div>
      )}
    </div>
  )
}
