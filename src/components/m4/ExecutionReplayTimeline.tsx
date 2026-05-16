'use client'

import React from 'react'

interface ReplayPhase {
  name: string
  startedAt: number
  completedAt: number | null
  durationMs: number
  status: string
  eventCount: number
}

interface ReplayEvent {
  eventId: string
  timestamp: number
  type: string
  stepIndex: number
  error?: string
}

interface ExecutionReplayTimelineProps {
  runId: string
  phases: ReplayPhase[]
  failurePoints: ReplayEvent[]
  totalDurationMs: number
}

const phaseColor = (status: string) => {
  switch (status) {
    case 'completed': return '#22c55e'
    case 'failed': return '#ef4444'
    case 'skipped': return '#6b7280'
    default: return '#f59e0b'
  }
}

export function ExecutionReplayTimeline({ runId, phases, failurePoints, totalDurationMs }: ExecutionReplayTimelineProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f59e0b' }}>🔄 Execution Replay</h3>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Total: {totalDurationMs}ms</span>
      </div>

      {/* Timeline bar */}
      <div style={{ display: 'flex', gap: 2, height: 24, marginBottom: 16, borderRadius: 6, overflow: 'hidden' }}>
        {phases.map((phase) => {
          const width = totalDurationMs > 0 ? Math.max(5, (phase.durationMs / totalDurationMs) * 100) : 100 / phases.length
          return (
            <div key={phase.name} style={{ width: `${width}%`, background: phaseColor(phase.status), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 600, opacity: 0.85 }} title={`${phase.name}: ${phase.durationMs}ms`}>
              {width > 15 ? phase.name.substring(0, 8) : ''}
            </div>
          )
        })}
      </div>

      {/* Phase list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phases.map((phase, i) => (
          <div key={phase.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: '#111827', borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 20 }}>{i + 1}</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: phaseColor(phase.status) }} />
            <span style={{ flex: 1, fontSize: 13 }}>{phase.name}</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{phase.eventCount} events</span>
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 60, textAlign: 'right' }}>{phase.durationMs}ms</span>
          </div>
        ))}
      </div>

      {failurePoints.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: '#1c1917', borderRadius: 6, border: '1px solid #7f1d1d' }}>
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 6 }}>❌ Failure Points</div>
          {failurePoints.map((fp) => (
            <div key={fp.eventId} style={{ fontSize: 11, color: '#fca5a5', padding: '2px 0' }}>
              Step {fp.stepIndex}: {fp.type} {fp.error ? `— ${fp.error}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
