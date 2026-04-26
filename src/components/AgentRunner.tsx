'use client'

/**
 * AgentRunner — Phase 2 live streaming UI
 *
 * Client component that connects to /api/agent-plan/stream via SSE
 * and renders each agent's output in real time as they think.
 */

import React, { useState, useRef } from 'react'

interface AgentRunnerProps {
  codingRequestId: number
  title: string
}

type SSEEvent =
  | { type: 'start'; message: string }
  | { type: 'github_context'; files: number; structure: string }
  | { type: 'agent_start'; agent: string; message: string }
  | { type: 'chunk'; agent: string; text: string }
  | { type: 'agent_done'; agent: string }
  | { type: 'pr_created'; url: string }
  | { type: 'plan_saved'; planId: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

const AGENT_LABELS: Record<string, string> = {
  product: '📋 Product Agent',
  architect: '🏗️ Architect Agent',
  reviewer: '🔎 Reviewer Agent',
}

const AGENT_COLORS: Record<string, string> = {
  product: '#3b82f6',
  architect: '#8b5cf6',
  reviewer: '#10b981',
}

export function AgentRunner({ codingRequestId, title }: AgentRunnerProps) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLog, setStatusLog] = useState<string[]>([])
  const [currentAgent, setCurrentAgent] = useState<string | null>(null)
  const [agentOutputs, setAgentOutputs] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<string>('product')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [planId, setPlanId] = useState<number | null>(null)
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
    setError(null)
    setStatusLog([])
    setCurrentAgent(null)
    setAgentOutputs({})
    setPrUrl(null)
    setPlanId(null)
    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/agent-plan/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codingRequestId }),
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
            const event = JSON.parse(line.slice(6)) as SSEEvent

            if (event.type === 'start') {
              addLog(event.message)
            } else if (event.type === 'github_context') {
              addLog(`✅ Repo context loaded — ${event.files} file(s) read`)
            } else if (event.type === 'agent_start') {
              setCurrentAgent(event.agent)
              setActiveTab(event.agent)
              addLog(event.message)
            } else if (event.type === 'chunk') {
              setAgentOutputs((prev) => ({
                ...prev,
                [event.agent]: (prev[event.agent] || '') + event.text,
              }))
            } else if (event.type === 'agent_done') {
              addLog(`✅ ${AGENT_LABELS[event.agent] || event.agent} complete`)
              setCurrentAgent(null)
            } else if (event.type === 'pr_created') {
              setPrUrl(event.url)
              addLog(`🔗 GitHub PR created!`)
            } else if (event.type === 'plan_saved') {
              setPlanId(event.planId)
              addLog(`💾 Plan #${event.planId} saved to database`)
            } else if (event.type === 'done') {
              setDone(true)
              setRunning(false)
            } else if (event.type === 'error') {
              setError(event.message)
              setRunning(false)
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(String(err))
      }
      setRunning(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    addLog('⏹ Stopped by user')
  }

  const hasOutput = Object.keys(agentOutputs).length > 0
  const tabs = (['product', 'architect', 'reviewer'] as const).filter((a) => agentOutputs[a])

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Title */}
      <div
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#666',
          marginBottom: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        🤖 AI Agent Pipeline — {title}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {!running && (
          <button onClick={run} style={btnStyle(done ? '#3b82f6' : '#10b981')}>
            {done ? '🔄 Re-run Agents' : '🤖 Run AI Agents'}
          </button>
        )}
        {running && (
          <>
            <button onClick={stop} style={btnStyle('#ef4444')}>
              ⏹ Stop
            </button>
            <span
              style={{
                fontSize: '0.82rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙️</span>
              {currentAgent
                ? `${AGENT_LABELS[currentAgent] || currentAgent} thinking...`
                : 'Running pipeline...'}
            </span>
          </>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '0.65rem 0.9rem',
            color: '#991b1b',
            fontSize: '0.82rem',
            marginBottom: '0.75rem',
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* Success banner */}
      {done && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 6,
            padding: '0.65rem 0.9rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#15803d', fontWeight: 600, fontSize: '0.85rem' }}>
            🎉 Pipeline complete!
          </span>
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#16a34a', fontSize: '0.82rem', textDecoration: 'underline' }}
            >
              View GitHub PR →
            </a>
          )}
          {planId && (
            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Plan #{planId} saved</span>
          )}
        </div>
      )}

      {/* Output panel */}
      {(statusLog.length > 0 || hasOutput) && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {/* Status log */}
          {statusLog.length > 0 && (
            <div
              style={{
                background: '#0f172a',
                padding: '0.75rem 1rem',
                maxHeight: 140,
                overflowY: 'auto',
                borderBottom: hasOutput ? '1px solid #1e293b' : 'none',
              }}
            >
              {statusLog.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    color: '#86efac',
                    lineHeight: 1.7,
                  }}
                >
                  {msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Agent output tabs */}
          {hasOutput && (
            <>
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f9fafb',
                }}
              >
                {tabs.map((agent) => (
                  <button
                    key={agent}
                    onClick={() => setActiveTab(agent)}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: activeTab === agent ? 700 : 400,
                      color: activeTab === agent ? AGENT_COLORS[agent] : '#6b7280',
                      borderBottom:
                        activeTab === agent
                          ? `2px solid ${AGENT_COLORS[agent]}`
                          : '2px solid transparent',
                      transition: 'color 0.15s',
                    }}
                  >
                    {AGENT_LABELS[agent]}
                    {currentAgent === agent && (
                      <span style={{ marginLeft: 4, fontSize: '0.7rem' }}>✍️</span>
                    )}
                  </button>
                ))}
              </div>
              <div
                style={{
                  padding: '0.9rem 1rem',
                  maxHeight: 420,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.79rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.75,
                  color: '#1e293b',
                }}
              >
                {agentOutputs[activeTab] || ''}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '0.45rem 1.1rem',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    transition: 'opacity 0.15s',
  }
}
