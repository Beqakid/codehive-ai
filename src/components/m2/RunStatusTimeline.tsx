'use client'

/**
 * RunStatusTimeline — M2 component
 * Displays the run state machine progress as a vertical timeline.
 * Uses full inline styles — Tailwind gets purged on CF Workers build.
 */

import type { RunState } from '../../lib/runStateMachine'
import { STATE_LABELS, STATE_PROGRESS, isTerminal } from '../../lib/runStateMachine'

interface RunStatusTimelineProps {
  currentState: RunState
  errorMessage?: string
  compact?: boolean
}

// Ordered pipeline states (excludes terminal + cancelled)
const PIPELINE_STATES: RunState[] = [
  'queued',
  'starting',
  'analyzing_repo',
  'building_graph',
  'risk_analysis',
  'planning',
  'creating_pr',
  'completed',
]

const STATE_ICONS: Record<RunState, string> = {
  queued: '⏳',
  starting: '🔄',
  analyzing_repo: '🔍',
  building_graph: '🔗',
  risk_analysis: '📊',
  planning: '🧠',
  creating_pr: '🔀',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
}

export function RunStatusTimeline({ currentState, errorMessage, compact = false }: RunStatusTimelineProps) {
  const currentProgress = STATE_PROGRESS[currentState] ?? 0
  const isFailed = currentState === 'failed'
  const isCancelled = currentState === 'cancelled'
  const isDone = isTerminal(currentState)

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: 12,
        padding: compact ? '12px 16px' : '20px 24px',
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Run Status
        </div>
        <div
          style={{
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            background: isFailed ? 'rgba(239,68,68,0.15)' :
              isCancelled ? 'rgba(100,116,139,0.15)' :
              isDone ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
            color: isFailed ? '#fca5a5' :
              isCancelled ? '#94a3b8' :
              isDone ? '#86efac' : '#93c5fd',
            border: `1px solid ${
              isFailed ? 'rgba(239,68,68,0.3)' :
              isCancelled ? 'rgba(100,116,139,0.3)' :
              isDone ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'
            }`,
          }}
        >
          {STATE_ICONS[currentState]} {STATE_LABELS[currentState]}
        </div>
      </div>

      {/* Progress bar */}
      {!isFailed && !isCancelled && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Progress</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{currentProgress}%</span>
          </div>
          <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${currentProgress}%`,
                background: isDone ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Timeline */}
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {PIPELINE_STATES.map((state, idx) => {
            const stateProgress = STATE_PROGRESS[state] ?? 0
            const isCurrent = state === currentState && !isTerminal(currentState)
            const isCompleted = STATE_PROGRESS[state]! <= currentProgress && !isFailed && !isCancelled
            const isUpcoming = stateProgress > currentProgress

            const dotColor = isFailed && isCurrent ? '#ef4444' :
              isCompleted ? '#22c55e' :
              isCurrent ? '#3b82f6' : '#1e293b'

            const lineColor = isCompleted ? '#22c55e' : '#1e293b'

            return (
              <div key={state} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Dot + line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div
                    style={{
                      width: isCurrent ? 14 : 10,
                      height: isCurrent ? 14 : 10,
                      borderRadius: '50%',
                      background: dotColor,
                      border: `2px solid ${dotColor}`,
                      boxShadow: isCurrent ? `0 0 8px ${dotColor}` : 'none',
                      flexShrink: 0,
                      transition: 'all 0.3s ease',
                    }}
                  />
                  {idx < PIPELINE_STATES.length - 1 && (
                    <div
                      style={{
                        width: 2,
                        height: 28,
                        background: lineColor,
                        flexShrink: 0,
                        transition: 'background 0.3s ease',
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <div style={{ paddingBottom: idx < PIPELINE_STATES.length - 1 ? 0 : 0, paddingTop: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isCurrent ? 700 : 500,
                      color: isCompleted ? '#86efac' :
                        isCurrent ? '#93c5fd' :
                        isUpcoming ? '#475569' : '#94a3b8',
                      lineHeight: 1.4,
                    }}
                  >
                    {STATE_ICONS[state]} {STATE_LABELS[state]}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Error message */}
      {isFailed && errorMessage && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Error
          </div>
          <div style={{ fontSize: 12, color: '#fca5a5' }}>{errorMessage}</div>
        </div>
      )}
    </div>
  )
}
