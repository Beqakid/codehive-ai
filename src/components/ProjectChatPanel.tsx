'use client'

/**
 * ProjectChatPanel — Project Manager Agent UI
 *
 * A Tasklet-inspired conversational agent embedded in the project detail page.
 * Features: tool use display, context-aware suggestions, streaming responses,
 * project health briefings, and rich action-oriented conversations.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'

interface ToolCallDisplay {
  toolId: string
  tool: string
  input: Record<string, unknown>
  output?: string
  loading: boolean
  collapsed: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCallDisplay[]
  streaming: boolean
}

interface ProjectChatPanelProps {
  projectId: number
  projectName: string
  planId?: number | null
  planStatus?: string | null
  reviewScore?: number | null
  prUrl?: string | null
  fixAttemptCount: number
  hasFailedFixes: boolean
}

const TOOL_META: Record<string, { icon: string; label: string }> = {
  read_repo_file: { icon: '📄', label: 'Reading file' },
  list_repo_files: { icon: '📁', label: 'Listing files' },
  get_ci_status: { icon: '🔄', label: 'Checking CI status' },
  get_ci_job_steps: { icon: '🔍', label: 'Inspecting job steps' },
}

function getToolLabel(tool: string, input: Record<string, unknown>): string {
  const meta = TOOL_META[tool] || { icon: '🔧', label: tool }
  if (tool === 'read_repo_file') return `${meta.icon} Reading \`${input.path || '...'}\``
  if (tool === 'list_repo_files') return `${meta.icon} Listing \`${input.path || '/'}\``
  if (tool === 'get_ci_status') return `${meta.icon} Checking CI runs`
  if (tool === 'get_ci_job_steps') return `${meta.icon} Inspecting run #${input.run_id || 'latest'}`
  return `${meta.icon} ${meta.label}`
}

function getContextSuggestions(
  planStatus: string | null | undefined,
  reviewScore: number | null | undefined,
  hasFailedFixes: boolean,
  fixAttemptCount: number,
  prUrl: string | null | undefined,
): string[] {
  if (!planStatus) {
    return ['How do I get started?', 'What can CodeHive build for me?']
  }
  if (planStatus === 'needs_revision') {
    return [
      'What did the reviewer flag?',
      'How do I fix the reviewer concerns?',
      reviewScore != null && reviewScore >= 6
        ? 'The score is close — can we override?'
        : 'What changes would get this approved?',
    ]
  }
  if (hasFailedFixes || fixAttemptCount > 0) {
    return [
      'Why are the tests failing?',
      'Get the latest CI error logs',
      'Suggest a specific fix for the errors',
      'Read the test file',
    ]
  }
  if (planStatus === 'approved' && prUrl) {
    return [
      'What does the generated code look like?',
      'Check CI run status',
      'Review the architecture',
      "What's next after tests pass?",
    ]
  }
  if (planStatus === 'approved') {
    return [
      'Is CI set up correctly?',
      'Check the repository structure',
      "What's in the plan?",
    ]
  }
  if (planStatus === 'draft' || planStatus === 'submitted') {
    return [
      "What's in the current plan?",
      'Explain the architecture decision',
      'What would the reviewer flag?',
    ]
  }
  return [
    'Give me a project health briefing',
    'What should I do next?',
    'Check the CI status',
  ]
}

function renderContent(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const firstLine = part.split('\n')[0].replace('```', '').trim()
      const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return (
        <div key={i} style={{ margin: '0.4rem 0' }}>
          {firstLine && (
            <div
              style={{
                fontSize: '0.62rem',
                color: '#64748b',
                fontFamily: 'monospace',
                padding: '2px 8px',
                background: 'rgba(0,0,0,0.4)',
                borderRadius: '6px 6px 0 0',
                borderBottom: '1px solid rgba(30,58,95,0.5)',
              }}
            >
              {firstLine}
            </div>
          )}
          <pre
            style={{
              background: 'rgba(0,0,0,0.45)',
              padding: '0.65rem 0.9rem',
              borderRadius: firstLine ? '0 0 6px 6px' : 6,
              fontSize: '0.71rem',
              overflowX: 'auto',
              margin: 0,
              fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
              color: '#e2e8f0',
              lineHeight: 1.6,
              border: '1px solid rgba(30,58,95,0.4)',
              borderTop: firstLine ? 'none' : undefined,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {code}
          </pre>
        </div>
      )
    }
    // Render bold **text** inline
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {boldParts.map((bp, bi) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return (
              <strong key={bi} style={{ color: '#e2e8f0', fontWeight: 700 }}>
                {bp.slice(2, -2)}
              </strong>
            )
          }
          return <span key={bi}>{bp}</span>
        })}
      </span>
    )
  })
}

export function ProjectChatPanel({
  projectId,
  projectName,
  planId,
  planStatus,
  reviewScore,
  prUrl,
  fixAttemptCount,
  hasFailedFixes,
}: ProjectChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const suggestions = getContextSuggestions(
    planStatus,
    reviewScore,
    hasFailedFixes,
    fixAttemptCount,
    prUrl,
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || input).trim()
      if (!text || streaming) return

      const userMsg: Message = { role: 'user', content: text, toolCalls: [], streaming: false }
      const assistantMsg: Message = {
        role: 'assistant',
        content: '',
        toolCalls: [],
        streaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')
      setStreaming(true)

      abortRef.current = new AbortController()

      // Build history for the API (exclude the current empty assistant msg)
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))

      try {
        const resp = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
          signal: abortRef.current.signal,
        })

        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let fullText = ''

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
              } else if (ev.type === 'tool_start') {
                const newTool: ToolCallDisplay = {
                  toolId: ev.toolId,
                  tool: ev.tool,
                  input: ev.input || {},
                  loading: true,
                  collapsed: true,
                }
                setMessages((prev) => {
                  const u = [...prev]
                  const last = { ...u[u.length - 1] }
                  last.toolCalls = [...last.toolCalls, newTool]
                  u[u.length - 1] = last
                  return u
                })
              } else if (ev.type === 'tool_result') {
                setMessages((prev) => {
                  const u = [...prev]
                  const last = { ...u[u.length - 1] }
                  last.toolCalls = last.toolCalls.map((tc) =>
                    tc.toolId === ev.toolId
                      ? { ...tc, output: ev.output, loading: false }
                      : tc,
                  )
                  u[u.length - 1] = last
                  return u
                })
              } else if (ev.type === 'done') {
                setMessages((prev) => {
                  const u = [...prev]
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    content: ev.fullText || fullText,
                    streaming: false,
                  }
                  return u
                })
              } else if (ev.type === 'error') {
                setMessages((prev) => {
                  const u = [...prev]
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    content: `❌ ${ev.message}`,
                    streaming: false,
                  }
                  return u
                })
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => {
            const u = [...prev]
            u[u.length - 1] = {
              ...u[u.length - 1],
              content: `❌ ${String(err)}`,
              streaming: false,
            }
            return u
          })
        }
      } finally {
        setStreaming(false)
      }
    },
    [input, messages, streaming, projectId],
  )

  const toggleToolCard = (msgIdx: number, toolId: string) => {
    setMessages((prev) => {
      const u = [...prev]
      const msg = { ...u[msgIdx] }
      msg.toolCalls = msg.toolCalls.map((tc) =>
        tc.toolId === toolId ? { ...tc, collapsed: !tc.collapsed } : tc,
      )
      u[msgIdx] = msg
      return u
    })
  }

  const clearChat = () => setMessages([])

  return (
    <div
      style={{
        background: 'rgba(13,21,38,0.85)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.1)',
      }}
    >
      {/* Top accent — purple/blue gradient distinguishes from orange AI Runners */}
      <div
        style={{
          height: 2,
          background: 'linear-gradient(to right, #6366f1, #8b5cf6, #3b82f6, #06b6d4)',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '1rem 1.4rem',
          borderBottom: '1px solid rgba(30,58,95,0.5)',
          background: 'rgba(7,13,26,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        {/* Agent avatar */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))',
            border: '1px solid rgba(99,102,241,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            flexShrink: 0,
          }}
        >
          🧠
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '0.88rem',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Project Manager Agent
            <span
              style={{
                fontSize: '0.58rem',
                padding: '2px 7px',
                borderRadius: 9999,
                background: 'rgba(99,102,241,0.15)',
                color: '#818cf8',
                fontWeight: 700,
                border: '1px solid rgba(99,102,241,0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              claude sonnet
            </span>
          </div>
          <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 1 }}>
            Full context on {projectName} — plans, code, CI, fixes
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          {/* Briefing button */}
          <button
            onClick={() =>
              send(
                'Give me a complete project health briefing: current status, what has been built, what failed, and the top 3 things I should do next.',
              )
            }
            disabled={streaming}
            style={{
              padding: '0.4rem 0.9rem',
              background: streaming
                ? 'rgba(71,85,105,0.3)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8,
              color: streaming ? '#475569' : '#818cf8',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: streaming ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            📊 Briefing
          </button>

          {/* Clear button */}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={streaming}
              style={{
                padding: '0.4rem 0.75rem',
                background: 'rgba(30,41,59,0.4)',
                border: '1px solid rgba(30,58,95,0.5)',
                borderRadius: 8,
                color: '#475569',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: streaming ? 'not-allowed' : 'pointer',
              }}
            >
              ↺ New
            </button>
          )}
        </div>
      </div>

      {/* Welcome state */}
      {messages.length === 0 && (
        <div
          style={{
            padding: '1.25rem 1.4rem',
            borderBottom: '1px solid rgba(30,58,95,0.35)',
            background: 'rgba(7,13,26,0.3)',
          }}
        >
          <div
            style={{
              fontSize: '0.82rem',
              color: '#94a3b8',
              lineHeight: 1.65,
              marginBottom: '0.85rem',
            }}
          >
            I have full context on{' '}
            <strong style={{ color: '#c7d2fe' }}>{projectName}</strong> —
            the agent plans, architecture decisions, CI run history, and all fix attempts.
            Ask me anything about the project or use the suggestions below.
          </div>

          {/* Context-aware quick suggestions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.73rem',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 20,
                  color: '#818cf8',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Project state summary pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
            {planStatus && (
              <span
                style={{
                  fontSize: '0.64rem',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background:
                    planStatus === 'approved'
                      ? 'rgba(16,185,129,0.1)'
                      : planStatus === 'needs_revision'
                        ? 'rgba(249,115,22,0.1)'
                        : 'rgba(30,58,95,0.4)',
                  color:
                    planStatus === 'approved'
                      ? '#34d399'
                      : planStatus === 'needs_revision'
                        ? '#fb923c'
                        : '#64748b',
                  border: `1px solid ${planStatus === 'approved' ? '#10b98130' : planStatus === 'needs_revision' ? '#f9731630' : '#1e3a5f80'}`,
                  fontWeight: 600,
                }}
              >
                Plan: {planStatus}
              </span>
            )}
            {reviewScore != null && (
              <span
                style={{
                  fontSize: '0.64rem',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background:
                    reviewScore >= 7.5 ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)',
                  color: reviewScore >= 7.5 ? '#34d399' : '#fb923c',
                  border: `1px solid ${reviewScore >= 7.5 ? '#10b98130' : '#f9731630'}`,
                  fontWeight: 600,
                }}
              >
                Score: {reviewScore}/10
              </span>
            )}
            {fixAttemptCount > 0 && (
              <span
                style={{
                  fontSize: '0.64rem',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: hasFailedFixes ? 'rgba(239,68,68,0.1)' : 'rgba(30,58,95,0.4)',
                  color: hasFailedFixes ? '#f87171' : '#64748b',
                  border: `1px solid ${hasFailedFixes ? '#ef444430' : '#1e3a5f80'}`,
                  fontWeight: 600,
                }}
              >
                {fixAttemptCount} fix attempt{fixAttemptCount !== 1 ? 's' : ''}
                {hasFailedFixes ? ' ⚠️' : ''}
              </span>
            )}
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.64rem',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: 'rgba(96,165,250,0.1)',
                  color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.25)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                PR ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          maxHeight: 500,
          overflowY: 'auto',
          padding: '1rem 1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        {messages.map((msg, msgIdx) => (
          <div key={msgIdx}>
            {/* Tool calls (shown before the assistant text they caused) */}
            {msg.role === 'assistant' && msg.toolCalls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {msg.toolCalls.map((tc) => (
                  <div key={tc.toolId}>
                    {/* Tool call pill */}
                    <button
                      onClick={() => toggleToolCard(msgIdx, tc.toolId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.75rem',
                        background: tc.loading
                          ? 'rgba(99,102,241,0.08)'
                          : 'rgba(30,58,95,0.25)',
                        border: `1px solid ${tc.loading ? 'rgba(99,102,241,0.3)' : 'rgba(30,58,95,0.5)'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        color: tc.loading ? '#818cf8' : '#64748b',
                        fontWeight: 600,
                        textAlign: 'left',
                        width: 'auto',
                        maxWidth: '100%',
                      }}
                    >
                      {tc.loading ? (
                        <span style={{ animation: 'pulse 1s infinite', fontSize: '0.65rem' }}>
                          ⏳
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.65rem' }}>✓</span>
                      )}
                      <span>{getToolLabel(tc.tool, tc.input)}</span>
                      {!tc.loading && tc.output && (
                        <span style={{ color: '#334155', fontSize: '0.65rem', marginLeft: 'auto' }}>
                          {tc.collapsed ? '▶' : '▼'}
                        </span>
                      )}
                    </button>

                    {/* Expanded output */}
                    {!tc.collapsed && tc.output && (
                      <div
                        style={{
                          marginTop: 4,
                          padding: '0.55rem 0.8rem',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid rgba(30,58,95,0.4)',
                          borderRadius: '0 0 8px 8px',
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          color: '#94a3b8',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 200,
                          overflowY: 'auto',
                        }}
                      >
                        {tc.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Message bubble */}
            <div
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              {msg.role === 'assistant' && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                    border: '1px solid rgba(99,102,241,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  🧠
                </div>
              )}

              <div
                style={{
                  maxWidth: '82%',
                  padding: '0.65rem 0.95rem',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background:
                    msg.role === 'user'
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'rgba(30,41,59,0.5)',
                  border: msg.role === 'user' ? 'none' : '1px solid rgba(30,58,95,0.5)',
                  color: msg.role === 'user' ? '#000' : '#cbd5e1',
                  fontSize: '0.82rem',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  boxShadow:
                    msg.role === 'user'
                      ? '0 2px 12px rgba(245,158,11,0.2)'
                      : '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                {msg.content ? (
                  renderContent(msg.content)
                ) : msg.streaming ? (
                  <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.75rem' }}>🧠</span>
                    <span style={{ fontSize: '0.72rem' }}>Thinking…</span>
                  </span>
                ) : null}
              </div>

              {msg.role === 'user' && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: 'rgba(245,158,11,0.15)',
                    border: '1px solid rgba(245,158,11,0.25)',
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
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '0.85rem 1.1rem',
          borderTop: '1px solid rgba(30,58,95,0.5)',
          background: 'rgba(7,13,26,0.4)',
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask about the project, CI failures, architecture, next steps… (Enter to send)"
          rows={2}
          disabled={streaming}
          style={{
            flex: 1,
            padding: '0.55rem 0.85rem',
            background: 'rgba(7,13,26,0.8)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 10,
            color: '#e2e8f0',
            fontSize: '0.8rem',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
          }}
        />

        <button
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          style={{
            padding: '0.55rem 1.15rem',
            background:
              streaming || !input.trim()
                ? 'rgba(71,85,105,0.3)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: streaming || !input.trim() ? '#475569' : '#fff',
            border: 'none',
            borderRadius: 10,
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            boxShadow:
              streaming || !input.trim() ? 'none' : '0 0 16px rgba(99,102,241,0.35)',
            transition: 'all 0.2s',
          }}
        >
          {streaming ? (
            <>
              <span style={{ fontSize: '0.7rem' }}>●●●</span>
            </>
          ) : (
            <>
              ↑ Ask
            </>
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <div
        style={{
          padding: '0.3rem 1.1rem 0.5rem',
          background: 'rgba(7,13,26,0.4)',
          borderTop: '1px solid rgba(30,58,95,0.2)',
        }}
      >
        <span style={{ fontSize: '0.62rem', color: '#334155' }}>
          Enter to send · Shift+Enter for new line · Can read your repo files and check CI live
        </span>
      </div>
    </div>
  )
}
