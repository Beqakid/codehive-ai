'use client'

/**
 * ChatFixPanel — Interactive Fix Chat UI
 *
 * Client component that provides a conversational interface for debugging CI/CD
 * failures. Connects to /api/chat-fix for AI-powered analysis and fix proposals.
 * Features: streaming chat, code block rendering, fix proposal cards with
 * "Apply & Re-run" functionality.
 */

import React, { useState, useRef, useEffect } from 'react'

interface ChatFixPanelProps {
  planId: number
  projectName: string
  fixAttemptCount: number
  latestError?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  fixProposal?: {
    summary: string
    files: Array<{ path: string; content: string }>
  }
}

export function ChatFixPanel({
  planId,
  projectName,
  fixAttemptCount,
  latestError,
}: ChatFixPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyLog, setApplyLog] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, applyLog])

  const send = async () => {
    if (!input.trim() || streaming) return

    const userMsg: Message = { role: 'user', content: input.trim() }
    const updated = [...messages, userMsg]
    setMessages([...updated, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    abortRef.current = new AbortController()

    try {
      const resp = await fetch('/api/chat-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          planId,
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullText = ''
      let proposal: Message['fixProposal'] | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'chunk') {
              fullText += ev.text
              setMessages((prev) => {
                const u = [...prev]
                u[u.length - 1] = { ...u[u.length - 1], content: fullText }
                return u
              })
            } else if (ev.type === 'fix_proposal') {
              proposal = { summary: ev.summary, files: ev.files }
            } else if (ev.type === 'done') {
              setMessages((prev) => {
                const u = [...prev]
                u[u.length - 1] = {
                  ...u[u.length - 1],
                  content: ev.fullText || fullText,
                  fixProposal: proposal,
                }
                return u
              })
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => {
          const u = [...prev]
          u[u.length - 1] = { ...u[u.length - 1], content: `❌ ${String(err)}` }
          return u
        })
      }
    } finally {
      setStreaming(false)
    }
  }

  const applyFix = async (files: Array<{ path: string; content: string }>) => {
    setApplying(true)
    setApplyLog([])

    try {
      const resp = await fetch('/api/chat-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', planId, files }),
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'status' || ev.type === 'sandbox_triggered') {
              setApplyLog((p) => [...p, ev.message])
            } else if (ev.type === 'file_committed') {
              setApplyLog((p) => [...p, `✅ ${ev.path}`])
            } else if (ev.type === 'error') {
              setApplyLog((p) => [...p, `❌ ${ev.message}`])
            } else if (ev.type === 'done') {
              setApplyLog((p) => [
                ...p,
                `✅ Done — ${ev.filesCommitted?.length || 0} file(s) committed`,
              ])
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setApplyLog((p) => [...p, `❌ ${String(err)}`])
    } finally {
      setApplying(false)
    }
  }

  // Simple renderer: detect ``` code blocks and render them styled
  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
        return (
          <pre
            key={i}
            style={{
              background: 'rgba(0,0,0,0.5)',
              padding: '0.6rem 0.8rem',
              borderRadius: 6,
              fontSize: '0.72rem',
              overflowX: 'auto',
              margin: '0.4rem 0',
              fontFamily: '"SF Mono", "Fira Code", monospace',
              color: '#e2e8f0',
              lineHeight: 1.5,
              border: '1px solid rgba(30,58,95,0.4)',
            }}
          >
            {code}
          </pre>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div
      style={{
        background: 'rgba(13,21,38,0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.85rem 1.25rem',
          borderBottom: '1px solid rgba(30,58,95,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          background: 'rgba(7,13,26,0.4)',
        }}
      >
        <span style={{ fontSize: '1rem' }}>💬</span>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>
          Interactive Fix Chat
        </span>
        <span
          style={{
            fontSize: '0.62rem',
            padding: '2px 8px',
            borderRadius: 9999,
            background: 'rgba(249,115,22,0.12)',
            color: '#fb923c',
            fontWeight: 700,
            border: '1px solid rgba(249,115,22,0.3)',
          }}
        >
          {fixAttemptCount} failed attempt{fixAttemptCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Welcome / context area when no messages yet */}
      {messages.length === 0 && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid rgba(30,58,95,0.3)',
            background: 'rgba(7,13,26,0.3)',
          }}
        >
          <div
            style={{
              fontSize: '0.78rem',
              color: '#94a3b8',
              marginBottom: '0.6rem',
              lineHeight: 1.6,
            }}
          >
            🤖 I have full context on{' '}
            <strong style={{ color: '#e2e8f0' }}>{projectName}</strong>&apos;s CI
            failures — error logs, fix attempts, and source files. Ask me anything.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: latestError ? '0.6rem' : 0 }}>
            {['What went wrong?', 'Show me the error', 'Suggest a fix'].map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: '0.72rem',
                  background: 'rgba(30,58,95,0.4)',
                  border: '1px solid rgba(30,58,95,0.6)',
                  borderRadius: 6,
                  color: '#60a5fa',
                  cursor: 'pointer',
                }}
              >
                {q}
              </button>
            ))}
          </div>
          {latestError && (
            <div
              style={{
                fontSize: '0.72rem',
                color: '#f87171',
                background: 'rgba(239,68,68,0.06)',
                padding: '0.45rem 0.7rem',
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.15)',
                fontFamily: 'monospace',
                lineHeight: 1.5,
              }}
            >
              {latestError}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          maxHeight: 420,
          overflowY: 'auto',
          padding: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        {messages.map((msg, i) => (
          <div key={i}>
            {/* Message bubble */}
            <div
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '0.4rem',
                alignItems: 'flex-start',
              }}
            >
              {msg.role === 'assistant' && (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: 'rgba(30,58,95,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  🤖
                </div>
              )}
              <div
                style={{
                  maxWidth: '82%',
                  padding: '0.6rem 0.85rem',
                  borderRadius:
                    msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background:
                    msg.role === 'user'
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'rgba(30,58,95,0.35)',
                  color: msg.role === 'user' ? '#000' : '#cbd5e1',
                  fontSize: '0.8rem',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content ? (
                  renderContent(msg.content)
                ) : streaming && i === messages.length - 1 ? (
                  <span style={{ color: '#64748b' }}>Thinking...</span>
                ) : (
                  ''
                )}
              </div>
              {msg.role === 'user' && (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: 'rgba(245,158,11,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  👤
                </div>
              )}
            </div>

            {/* Fix proposal card */}
            {msg.fixProposal && (
              <div
                style={{
                  marginTop: '0.5rem',
                  marginLeft: 32,
                  padding: '0.75rem 0.9rem',
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: 10,
                  borderLeft: '3px solid #10b981',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.35rem',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.8rem' }}>
                    🔧 Proposed Fix
                  </span>
                  <button
                    onClick={() => applyFix(msg.fixProposal!.files)}
                    disabled={applying}
                    style={{
                      padding: '0.35rem 0.9rem',
                      background: applying
                        ? 'rgba(71,85,105,0.5)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: applying ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                    }}
                  >
                    {applying ? '⏳ Applying...' : '✅ Apply & Re-run'}
                  </button>
                </div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.76rem',
                    marginBottom: '0.3rem',
                    lineHeight: 1.5,
                  }}
                >
                  {msg.fixProposal.summary}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {msg.fixProposal.files.map((f, fi) => (
                    <span
                      key={fi}
                      style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(30,58,95,0.5)',
                        color: '#60a5fa',
                        fontFamily: 'monospace',
                      }}
                    >
                      📄 {f.path}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Apply status log */}
        {applyLog.length > 0 && (
          <div
            style={{
              padding: '0.6rem 0.8rem',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              border: '1px solid rgba(30,58,95,0.4)',
            }}
          >
            {applyLog.map((msg, i) => (
              <div
                key={i}
                style={{
                  fontSize: '0.72rem',
                  color: msg.startsWith('❌') ? '#f87171' : '#34d399',
                  fontFamily: 'monospace',
                  lineHeight: 1.7,
                }}
              >
                {msg}
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '0.7rem 0.85rem',
          borderTop: '1px solid rgba(30,58,95,0.5)',
          display: 'flex',
          gap: '0.5rem',
          background: 'rgba(7,13,26,0.3)',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask about the error or request a fix..."
          disabled={streaming}
          style={{
            flex: 1,
            padding: '0.5rem 0.8rem',
            background: 'rgba(7,13,26,0.8)',
            border: '1px solid rgba(30,58,95,0.6)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          style={{
            padding: '0.5rem 1rem',
            background:
              streaming || !input.trim()
                ? 'rgba(71,85,105,0.3)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: streaming || !input.trim() ? '#475569' : '#000',
            border: 'none',
            borderRadius: 8,
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {streaming ? '●●●' : '↑ Send'}
        </button>
      </div>
    </div>
  )
}
