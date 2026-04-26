'use client'

/**
 * SandboxRunner — Phase 4
 *
 * Polls the /api/sandbox/stream SSE endpoint and renders live
 * GitHub Actions workflow status for a given agent plan.
 */

import React, { useState, useRef, useCallback } from 'react'
import type { SandboxSSEEvent } from '@/agents/sandboxAgent'

interface Props {
  planId: number
  prUrl?: string
}

interface StepState {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?: string
}

interface RunState {
  phase: 'idle' | 'running' | 'done' | 'error'
  logs: string[]
  steps: StepState[]
  success?: boolean
  logsUrl?: string
}

export function SandboxRunner({ planId, prUrl }: Props) {
  const [run, setRun] = useState<RunState>({ phase: 'idle', logs: [], steps: [] })
  const abortRef = useRef<AbortController | null>(null)

  const startSandbox = useCallback(async () => {
    if (run.phase === 'running') return

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setRun({ phase: 'running', logs: ['🚀 Starting sandbox check...'], steps: [] })

    try {
      const resp = await fetch('/api/sandbox/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
        signal: abortRef.current.signal,
      })

      if (!resp.body) throw new Error('No stream body')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw) as SandboxSSEEvent

            setRun((prev) => {
              const next = { ...prev }

              if (event.type === 'start' || event.type === 'waiting' || event.type === 'running') {
                next.logs = [...prev.logs, event.message]
              } else if (event.type === 'step') {
                // Update or insert step
                const existing = prev.steps.findIndex((s) => s.name === event.name)
                if (existing >= 0) {
                  const steps = [...prev.steps]
                  steps[existing] = { name: event.name, status: event.status, conclusion: event.conclusion }
                  next.steps = steps
                } else {
                  next.steps = [
                    ...prev.steps,
                    { name: event.name, status: event.status, conclusion: event.conclusion },
                  ]
                }
              } else if (event.type === 'done') {
                next.phase = 'done'
                next.success = event.success
                next.logsUrl = event.logsUrl
                next.logs = [...prev.logs, event.message]
              } else if (event.type === 'error') {
                next.phase = 'error'
                next.logs = [...prev.logs, `❌ ${event.message}`]
              }

              return next
            })
          } catch {
            // skip malformed
          }
        }
      }

      setRun((prev) =>
        prev.phase === 'running' ? { ...prev, phase: 'done', success: false } : prev,
      )
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      setRun((prev) => ({
        ...prev,
        phase: 'error',
        logs: [...prev.logs, `❌ ${String(err)}`],
      }))
    }
  }, [planId, run.phase])

  const stepIcon = (step: StepState) => {
    if (step.status === 'in_progress') return '⚙️'
    if (step.status === 'completed') {
      return step.conclusion === 'success' ? '✅' : step.conclusion === 'skipped' ? '⏭️' : '❌'
    }
    return '⏳'
  }

  const borderColor =
    run.phase === 'done' && run.success
      ? '#22c55e'
      : run.phase === 'done' && !run.success
      ? '#ef4444'
      : run.phase === 'error'
      ? '#ef4444'
      : run.phase === 'running'
      ? '#f59e0b'
      : '#e5e7eb'

  return (
    <div
      style={{
        marginTop: '0.75rem',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 0.3s',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 1rem',
          background:
            run.phase === 'done' && run.success
              ? '#f0fdf4'
              : run.phase === 'done' && !run.success
              ? '#fef2f2'
              : run.phase === 'running'
              ? '#fffbeb'
              : '#f9fafb',
          borderBottom: run.phase !== 'idle' ? `1px solid ${borderColor}` : 'none',
        }}
      >
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
          🧪 Sandbox Tests
        </span>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {prUrl && run.phase !== 'idle' && run.logsUrl && (
            <a
              href={run.logsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}
            >
              View Logs →
            </a>
          )}
          <button
            onClick={startSandbox}
            disabled={run.phase === 'running'}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: run.phase === 'running' ? 'not-allowed' : 'pointer',
              background:
                run.phase === 'running'
                  ? '#d1d5db'
                  : run.phase === 'done'
                  ? '#6366f1'
                  : '#f59e0b',
              color: '#fff',
            }}
          >
            {run.phase === 'idle'
              ? '🧪 Run Sandbox'
              : run.phase === 'running'
              ? '⏳ Running...'
              : '↺ Re-run'}
          </button>
        </div>
      </div>

      {/* Steps */}
      {run.steps.length > 0 && (
        <div
          style={{
            padding: '0.5rem 1rem',
            borderBottom: '1px solid #f3f4f6',
            background: '#fff',
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          {run.steps.map((step) => (
            <span
              key={step.name}
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 9999,
                background:
                  step.conclusion === 'success'
                    ? '#dcfce7'
                    : step.conclusion === 'failure'
                    ? '#fecaca'
                    : step.status === 'in_progress'
                    ? '#fef3c7'
                    : '#f3f4f6',
                color:
                  step.conclusion === 'success'
                    ? '#166534'
                    : step.conclusion === 'failure'
                    ? '#991b1b'
                    : step.status === 'in_progress'
                    ? '#92400e'
                    : '#6b7280',
                fontWeight: 500,
              }}
            >
              {stepIcon(step)} {step.name}
            </span>
          ))}
        </div>
      )}

      {/* Log output */}
      {run.phase !== 'idle' && (
        <div
          style={{
            background: '#0f172a',
            padding: '0.75rem 1rem',
            maxHeight: 160,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#94a3b8',
            lineHeight: 1.6,
          }}
        >
          {run.logs.map((log, i) => (
            <div
              key={i}
              style={{
                color: log.startsWith('❌')
                  ? '#f87171'
                  : log.startsWith('✅')
                  ? '#4ade80'
                  : '#94a3b8',
              }}
            >
              {log}
            </div>
          ))}
          {run.phase === 'running' && (
            <div style={{ color: '#f59e0b', marginTop: '0.25rem' }}>▌</div>
          )}
        </div>
      )}
    </div>
  )
}
