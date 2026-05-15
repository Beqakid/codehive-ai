'use client'

/**
 * /projects/[id]/plan
 *
 * Milestone 1 planning interface.
 * - Command input (what do you want to build?)
 * - Live SSE log stream during pipeline run
 * - Completion state with PR link + "View Full Plan" button
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface LogEvent {
  type: 'log' | 'run_created' | 'complete' | 'error'
  level?: string
  event?: string
  message: string
  runId?: string
  prUrl?: string
  branchName?: string
  planTitle?: string
}

interface Props {
  projectId: string
  projectName: string
  repoOwner?: string
  repoName?: string
}

const LEVEL_COLOR: Record<string, string> = {
  info: '#94a3b8',
  success: '#4ade80',
  warn: '#facc15',
  error: '#f87171',
  debug: '#818cf8',
}

const LEVEL_PREFIX: Record<string, string> = {
  info: '●',
  success: '✓',
  warn: '⚠',
  error: '✗',
  debug: '·',
}

export function M1PlanInterface({ projectId, projectName, repoOwner, repoName }: Props) {
  const [request, setRequest] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [planTitle, setPlanTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const submit = async () => {
    if (!request.trim() || running) return
    setRunning(true)
    setLogs([])
    setRunId(null)
    setPrUrl(null)
    setBranchName(null)
    setPlanTitle(null)
    setError(null)
    setComplete(false)

    try {
      const resp = await fetch('/api/m1/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, userRequest: request, repoOwner, repoName }),
      })

      if (!resp.body) {
        setError('No response body from server')
        setRunning(false)
        return
      }

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
          try {
            const event = JSON.parse(line.slice(6)) as LogEvent
            if (event.type === 'run_created' && event.runId) {
              setRunId(event.runId)
            }
            if (event.type === 'complete') {
              setPrUrl(event.prUrl || null)
              setBranchName(event.branchName || null)
              setPlanTitle(event.planTitle || null)
              setComplete(true)
              setRunning(false)
            }
            if (event.type === 'error') {
              setError(event.message)
              setRunning(false)
            }
            setLogs((prev) => [...prev, event])
          } catch {
            // malformed SSE line, skip
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setRunning(false)
    }
  }

  const repoLabel = repoOwner && repoName ? `${repoOwner}/${repoName}` : 'No repo configured'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <Link
          href={`/projects/${projectId}`}
          style={{
            color: '#f59e0b',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ← Back to Terminal
        </Link>
        <div style={{ flex: 1 }} />
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '13px',
            color: '#f59e0b',
          }}
        >
          🐝 {projectName}
        </div>
        <div
          style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '13px',
            color: '#a5b4fc',
          }}
        >
          📁 {repoLabel}
        </div>
      </div>

      {/* Title */}
      <div>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: '700',
            margin: 0,
            background: 'linear-gradient(135deg, #f59e0b, #fcd34d)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          📋 Planning Agent
        </h1>
        <p style={{ color: '#64748b', margin: '8px 0 0', fontSize: '15px' }}>
          Describe what you want to build. The AI will analyze the repo and generate an
          implementation plan — no code changes are made.
        </p>
      </div>

      {/* Command Input */}
      {!running && !complete && (
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <label style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>
            What do you want to implement?
          </label>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="e.g. Add caregiver QR verification to the booking flow — scan a QR code to confirm arrival"
            rows={4}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              color: '#e2e8f0',
              fontSize: '15px',
              padding: '14px 16px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: '1.6',
              width: '100%',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={submit}
              disabled={!request.trim()}
              style={{
                background: request.trim()
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: '10px',
                color: request.trim() ? '#000' : '#64748b',
                cursor: request.trim() ? 'pointer' : 'not-allowed',
                fontSize: '15px',
                fontWeight: '600',
                padding: '12px 28px',
              }}
            >
              🚀 Generate Plan
            </button>
            <span style={{ fontSize: '12px', color: '#475569' }}>⌘+Enter to submit</span>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#fca5a5',
                fontSize: '14px',
              }}
            >
              ❌ {error}
            </div>
          )}
        </div>
      )}

      {/* Live Logs */}
      {(running || logs.length > 0) && (
        <div
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: running ? '#4ade80' : complete ? '#4ade80' : '#f87171',
                animation: running ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
              {running ? 'Pipeline running...' : complete ? 'Pipeline complete' : 'Pipeline stopped'}
              {runId && ` · run #${runId}`}
            </span>
          </div>

          <div
            style={{
              padding: '16px 20px',
              maxHeight: '380px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '13px',
              lineHeight: '1.7',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {logs.map((log, i) => {
              if (log.type === 'run_created' || log.type === 'complete') return null
              if (log.type === 'error') {
                return (
                  <div key={i} style={{ color: '#f87171' }}>
                    ✗ ERROR: {log.message}
                  </div>
                )
              }
              const color = LEVEL_COLOR[log.level || 'info'] || '#94a3b8'
              const prefix = LEVEL_PREFIX[log.level || 'info'] || '●'
              return (
                <div key={i} style={{ color }}>
                  {prefix} {log.message}
                </div>
              )
            })}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Completion Card */}
      {complete && (
        <div
          style={{
            background: 'rgba(74, 222, 128, 0.06)',
            border: '1px solid rgba(74, 222, 128, 0.25)',
            borderRadius: '16px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#4ade80' }}>
              ✅ Plan Generated
            </h2>
            {planTitle && (
              <p style={{ color: '#94a3b8', margin: '8px 0 0', fontSize: '15px' }}>
                {planTitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {runId && (
              <Link
                href={`/projects/${projectId}/plan/${runId}`}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  borderRadius: '10px',
                  color: '#000',
                  fontWeight: '600',
                  fontSize: '14px',
                  padding: '10px 22px',
                  textDecoration: 'none',
                }}
              >
                📄 View Full Plan
              </Link>
            )}
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '10px',
                  color: '#a5b4fc',
                  fontSize: '14px',
                  padding: '10px 22px',
                  textDecoration: 'none',
                }}
              >
                🔀 Open Pull Request
              </a>
            )}
            {branchName && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  color: '#64748b',
                  fontSize: '13px',
                  padding: '10px 16px',
                  fontFamily: 'monospace',
                }}
              >
                🌿 {branchName}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setComplete(false)
              setLogs([])
              setRequest('')
              setError(null)
            }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '10px 20px',
              alignSelf: 'flex-start',
            }}
          >
            + New Plan
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
