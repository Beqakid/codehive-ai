'use client'

/**
 * FixRunner — Run & Fix Until Stable UI
 *
 * Client component that connects to /api/run-fix via SSE and shows:
 * - Live workflow monitoring
 * - Error parsing & classification
 * - Fix attempt cards with confidence, risk, and file changes
 * - Final pass/fail/needs-review status
 */

import React, { useState, useRef } from 'react'

interface FixRunnerProps {
  planId: number
  prUrl?: string
}

type FixSSEEvent =
  | { type: 'status'; phase: string; message: string }
  | { type: 'workflow_start'; runId: number; attempt: number }
  | { type: 'workflow_polling'; elapsed: number; status: string }
  | { type: 'workflow_result'; success: boolean; conclusion: string; logsUrl: string }
  | { type: 'error_parsed'; category: string; summary: string; filesFound: number }
  | { type: 'fix_start'; attempt: number; maxAttempts: number }
  | {
      type: 'fix_agent_response'
      summary: string
      confidence: number
      riskLevel: string
      filesCount: number
    }
  | { type: 'fix_committed'; attempt: number; filesUpdated: string[]; commitMessage: string }
  | { type: 'fix_rejected'; attempt: number; reason: string }
  | { type: 'attempt_result'; attempt: number; status: string; message: string }
  | { type: 'done'; finalStatus: string; totalAttempts: number; message: string }
  | { type: 'error'; message: string }

interface AttemptInfo {
  number: number
  errorCategory?: string
  errorSummary?: string
  fixSummary?: string
  confidence?: number
  riskLevel?: string
  filesUpdated?: string[]
  status: 'running' | 'committed' | 'passed' | 'failed' | 'needs_human_review' | 'rejected'
}

export function FixRunner({ planId, prUrl }: FixRunnerProps) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [finalStatus, setFinalStatus] = useState<string | null>(null)
  const [statusLog, setStatusLog] = useState<string[]>([])
  const [attempts, setAttempts] = useState<AttemptInfo[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [currentPhase, setCurrentPhase] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) =>
    setStatusLog((prev) => {
      const next = [...prev, msg]
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return next
    })

  const run = async () => {
    setRunning(true)
    setDone(false)
    setFinalStatus(null)
    setErrors([])
    setStatusLog([])
    setAttempts([])
    setCurrentPhase('')
    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/run-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
        signal: abortRef.current.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as FixSSEEvent

            if (event.type === 'status') {
              setCurrentPhase(event.phase)
              addLog(event.message)
            } else if (event.type === 'workflow_start') {
              addLog(`🚀 Workflow run #${event.runId}`)
            } else if (event.type === 'workflow_polling') {
              // Throttled — don't spam
            } else if (event.type === 'workflow_result') {
              addLog(
                event.success
                  ? '✅ Workflow passed!'
                  : `❌ Workflow failed: ${event.conclusion}`,
              )
            } else if (event.type === 'error_parsed') {
              addLog(
                `🔎 Error: ${event.category} | ${event.filesFound} file(s) referenced`,
              )
              // Update the latest attempt with error info
              setAttempts((prev) => {
                if (prev.length === 0) return prev
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  errorCategory: event.category,
                  errorSummary: event.summary,
                }
                return updated
              })
            } else if (event.type === 'fix_start') {
              addLog(`🔧 Fix attempt ${event.attempt}/${event.maxAttempts}`)
              setAttempts((prev) => [
                ...prev,
                { number: event.attempt, status: 'running' },
              ])
            } else if (event.type === 'fix_agent_response') {
              addLog(
                `🤖 Fix: ${event.summary} (confidence: ${Math.round(event.confidence * 100)}%)`,
              )
              setAttempts((prev) => {
                if (prev.length === 0) return prev
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  fixSummary: event.summary,
                  confidence: event.confidence,
                  riskLevel: event.riskLevel,
                }
                return updated
              })
            } else if (event.type === 'fix_committed') {
              addLog(`📝 Committed ${event.filesUpdated.length} file(s)`)
              setAttempts((prev) =>
                prev.map((a) =>
                  a.number === event.attempt
                    ? { ...a, status: 'committed', filesUpdated: event.filesUpdated }
                    : a,
                ),
              )
            } else if (event.type === 'fix_rejected') {
              addLog(`⚠️ Fix rejected: ${event.reason}`)
              setAttempts((prev) =>
                prev.map((a) =>
                  a.number === event.attempt ? { ...a, status: 'rejected' } : a,
                ),
              )
            } else if (event.type === 'attempt_result') {
              addLog(event.message)
              setAttempts((prev) =>
                prev.map((a) =>
                  a.number === event.attempt
                    ? { ...a, status: event.status as AttemptInfo['status'] }
                    : a,
                ),
              )
            } else if (event.type === 'done') {
              setDone(true)
              setRunning(false)
              setFinalStatus(event.finalStatus)
              addLog(event.message)
            } else if (event.type === 'error') {
              setErrors((prev) => [...prev, event.message])
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrors((prev) => [...prev, String(err)])
      }
    } finally {
      setRunning(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    addLog('⏹ Stopped by user')
  }

  const statusColor =
    finalStatus === 'passed'
      ? { border: 'rgba(16,185,129,0.4)', bg: 'rgba(16,185,129,0.08)', text: '#34d399' }
      : finalStatus === 'needs_human_review'
        ? {
            border: 'rgba(245,158,11,0.4)',
            bg: 'rgba(245,158,11,0.08)',
            text: '#fbbf24',
          }
        : finalStatus === 'failed'
          ? { border: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.08)', text: '#f87171' }
          : {
              border: 'rgba(30,58,95,0.7)',
              bg: 'rgba(13,21,38,0.8)',
              text: '#94a3b8',
            }

  const phaseLabel =
    currentPhase === 'workflow'
      ? '🔍 Monitoring workflow'
      : currentPhase === 'logs'
        ? '📋 Fetching logs'
        : currentPhase === 'analysis'
          ? '🔎 Analyzing error'
          : currentPhase === 'context'
            ? '📂 Loading files'
            : currentPhase === 'fix_agent'
              ? '🤖 Fix Agent working'
              : currentPhase === 'commit'
                ? '📝 Committing fix'
                : '⚙️ Working'

  return (
    <div
      style={{
        padding: '1rem',
        background: done ? statusColor.bg : 'rgba(13,21,38,0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        border: `1px solid ${done ? statusColor.border : 'rgba(30,58,95,0.7)'}`,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#f59e0b',
          marginBottom: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        🔄 Run &amp; Fix Until Stable
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {!running && (
          <button onClick={run} style={btnStyle(done ? '#3b82f6' : '#f59e0b')}>
            {done ? '↺ Re-run' : '🔄 Run & Fix'}
          </button>
        )}
        {running && (
          <>
            <button onClick={stop} style={btnStyle('#ef4444')}>
              ⏹ Stop
            </button>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              {phaseLabel}...
            </span>
          </>
        )}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.75rem',
              color: '#60a5fa',
              textDecoration: 'none',
            }}
          >
            View PR →
          </a>
        )}
      </div>

      {/* Final status banner */}
      {done && finalStatus && (
        <div
          style={{
            padding: '0.65rem 0.9rem',
            borderRadius: 8,
            background: statusColor.bg,
            border: `1px solid ${statusColor.border}`,
            color: statusColor.text,
            fontWeight: 600,
            fontSize: '0.82rem',
            marginBottom: '0.75rem',
          }}
        >
          {finalStatus === 'passed' && '✅ All tests passing! Pipeline is stable.'}
          {finalStatus === 'needs_human_review' &&
            '⚠️ Needs human review — auto-fix could not resolve the issue.'}
          {finalStatus === 'failed' && '❌ Could not auto-fix. Manual intervention required.'}
        </div>
      )}

      {/* Error banners */}
      {errors.map((e, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            color: '#f87171',
            fontSize: '0.75rem',
            marginBottom: '0.5rem',
          }}
        >
          {e}
        </div>
      ))}

      {/* Fix attempt cards */}
      {attempts.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          {attempts.map((a) => {
            const aColor =
              a.status === 'passed' || a.status === 'committed'
                ? '#34d399'
                : a.status === 'rejected' || a.status === 'needs_human_review'
                  ? '#fbbf24'
                  : a.status === 'failed'
                    ? '#f87171'
                    : '#94a3b8'

            return (
              <div
                key={a.number}
                style={{
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(7,13,26,0.6)',
                  borderRadius: 8,
                  border: `1px solid ${aColor}30`,
                  borderLeft: `3px solid ${aColor}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.3rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#e2e8f0',
                    }}
                  >
                    Attempt #{a.number}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: aColor,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {a.status === 'needs_human_review'
                      ? '⚠️ review'
                      : a.status === 'committed'
                        ? '📝 committed'
                        : a.status === 'passed'
                          ? '✅ passed'
                          : a.status === 'rejected'
                            ? '🚫 rejected'
                            : a.status === 'failed'
                              ? '❌ failed'
                              : '⏳ running'}
                  </span>
                </div>

                {a.errorCategory && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Error:{' '}
                    <span
                      style={{
                        color: '#94a3b8',
                        background: 'rgba(30,58,95,0.4)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontSize: '0.65rem',
                      }}
                    >
                      {a.errorCategory}
                    </span>
                  </div>
                )}

                {a.fixSummary && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Fix: <span style={{ color: '#94a3b8' }}>{a.fixSummary}</span>
                  </div>
                )}

                {a.confidence !== undefined && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Confidence:{' '}
                    <span
                      style={{
                        color:
                          a.confidence >= 0.8
                            ? '#34d399'
                            : a.confidence >= 0.65
                              ? '#fbbf24'
                              : '#f87171',
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(a.confidence * 100)}%
                    </span>
                    {a.riskLevel && (
                      <span style={{ marginLeft: 8, color: '#475569' }}>
                        Risk: {a.riskLevel}
                      </span>
                    )}
                  </div>
                )}

                {a.filesUpdated && a.filesUpdated.length > 0 && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: '#475569',
                      marginTop: '0.2rem',
                    }}
                  >
                    📁 Files: {a.filesUpdated.map((f) => f.split('/').pop()).join(', ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Status log (terminal) */}
      {statusLog.length > 0 && (
        <div
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid rgba(30,58,95,0.5)',
          }}
        >
          {statusLog.map((msg, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                color: '#94a3b8',
                lineHeight: 1.7,
              }}
            >
              {msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '0.45rem 1.1rem',
    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
    color: color === '#f59e0b' ? '#000' : '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 700,
    transition: 'opacity 0.15s',
  }
}
