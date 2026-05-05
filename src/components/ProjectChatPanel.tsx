'use client'

/**
 * ProjectChatPanel — Tasklet-grade Project Manager Agent UI
 *
 * Identical to Tasklet in 3 key ways (previously missing):
 * 1. PERSISTENT MEMORY — chat history saved to localStorage per project
 * 2. DIRECT ACTION TRIGGERS — agent can approve plans & queue fix/codegen/sandbox
 * 3. WEB SEARCH — agent can search DuckDuckGo and fetch any URL
 *
 * Plus: tool call cards, context-aware suggestions, streaming, health briefings.
 *
 * mode="terminal" — fills its parent container (used inside HiveTerminal)
 * mode="panel"    — default; standalone card with fixed max-height scroll
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCallDisplay {
  toolId: string
  tool: string
  input: Record<string, unknown>
  output?: string
  loading: boolean
  collapsed: boolean
}

interface ActionCard {
  action: string
  label: string
  detail: string
  planId?: number
  prUrl?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCallDisplay[]
  actionCard?: ActionCard
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
  onAction?: (action: string, params: Record<string, unknown>) => void
  /** "terminal" = fills parent height; "panel" = standalone card (default) */
  mode?: 'terminal' | 'panel'
}

// ─── Tool display helpers ─────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: string; label: string }> = {
  read_repo_file:   { icon: '📄', label: 'Reading file' },
  list_repo_files:  { icon: '📁', label: 'Listing directory' },
  get_ci_status:    { icon: '🔄', label: 'Checking CI status' },
  get_ci_job_steps: { icon: '🔍', label: 'Inspecting job steps' },
  search_web:       { icon: '🌐', label: 'Searching the web' },
  fetch_url:        { icon: '🔗', label: 'Fetching URL' },
  approve_plan:     { icon: '✅', label: 'Approving plan' },
  trigger_fix:      { icon: '🔧', label: 'Triggering fix loop' },
  trigger_codegen:  { icon: '💻', label: 'Triggering codegen' },
  trigger_sandbox:  { icon: '🧪', label: 'Triggering sandbox' },
}

function getToolLabel(tool: string, input: Record<string, unknown>): string {
  const meta = TOOL_META[tool] || { icon: '🔧', label: tool }
  if (tool === 'read_repo_file') return `${meta.icon} Reading \`${input.path || '...'}\``
  if (tool === 'list_repo_files') return `${meta.icon} Listing \`${input.path || '/'}\``
  if (tool === 'get_ci_status') return `${meta.icon} Checking CI${input.branch ? ` (${input.branch})` : ''}`
  if (tool === 'get_ci_job_steps') return `${meta.icon} Inspecting run #${input.run_id || 'latest'}`
  if (tool === 'search_web') return `${meta.icon} Searching: "${String(input.query || '').slice(0, 40)}"`
  if (tool === 'fetch_url') return `${meta.icon} Fetching ${String(input.url || '').slice(0, 50)}`
  if (tool === 'approve_plan') return `${meta.icon} Approving plan #${input.plan_id || '...'}`
  if (tool === 'trigger_fix') return `${meta.icon} Queuing fix loop`
  if (tool === 'trigger_codegen') return `${meta.icon} Queuing code generation`
  if (tool === 'trigger_sandbox') return `${meta.icon} Queuing sandbox run`
  return `${meta.icon} ${meta.label}`
}

function isActionTool(tool: string): boolean {
  return ['approve_plan', 'trigger_fix', 'trigger_codegen', 'trigger_sandbox'].includes(tool)
}

// ─── Context-aware suggestions ────────────────────────────────────────────────

function getSuggestions(
  planStatus: string | null | undefined,
  reviewScore: number | null | undefined,
  hasFailedFixes: boolean,
  fixAttemptCount: number,
  prUrl: string | null | undefined,
): string[] {
  if (!planStatus) return ['How do I get started?', 'What can CodeHive build for me?', 'Check the repo structure']
  if (planStatus === 'needs_revision') return [
    'What did the reviewer flag?',
    'How do I fix the reviewer concerns?',
    reviewScore != null && reviewScore >= 6 ? 'The score is close — can we override?' : 'What would get this approved?',
    'Approve the plan anyway',
  ]
  if (hasFailedFixes || fixAttemptCount > 0) return [
    'Why are the tests failing?',
    'Get the latest CI error',
    'Suggest a fix for the failures',
    'Run the fix loop again',
  ]
  if (planStatus === 'approved' && prUrl) return [
    'Check CI status',
    'What does the generated code look like?',
    'Run the sandbox tests',
    "What's next after tests pass?",
  ]
  if (planStatus === 'approved') return [
    'Is CI set up correctly?',
    'Check the repository structure',
    'Run the code generator',
  ]
  return [
    '📊 Give me a project briefing',
    'What should I do next?',
    'Check the CI status',
    'Read the architecture plan',
  ]
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderContent(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const firstLine = part.split('\n')[0].replace('```', '').trim()
      const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return (
        <div key={i} style={{ margin: '0.4rem 0' }}>
          {firstLine && (
            <div style={{ fontSize: '0.62rem', color: '#64748b', fontFamily: 'monospace', padding: '2px 8px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px 6px 0 0', borderBottom: '1px solid rgba(30,58,95,0.5)' }}>
              {firstLine}
            </div>
          )}
          <pre style={{ background: 'rgba(0,0,0,0.45)', padding: '0.65rem 0.9rem', borderRadius: firstLine ? '0 0 6px 6px' : 6, fontSize: '0.71rem', overflowX: 'auto', margin: 0, fontFamily: '"SF Mono","Fira Code","Cascadia Code",monospace', color: '#e2e8f0', lineHeight: 1.6, border: '1px solid rgba(30,58,95,0.4)', borderTop: firstLine ? 'none' : undefined, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {code}
          </pre>
        </div>
      )
    }
    // Bold + inline code
    const inlineParts = part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return (
      <span key={i}>
        {inlineParts.map((bp, bi) => {
          if (bp.startsWith('**') && bp.endsWith('**')) return <strong key={bi} style={{ color: '#e2e8f0', fontWeight: 700 }}>{bp.slice(2, -2)}</strong>
          if (bp.startsWith('`') && bp.endsWith('`')) return <code key={bi} style={{ background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', padding: '1px 5px', borderRadius: 4, fontSize: '0.85em', fontFamily: 'monospace' }}>{bp.slice(1, -1)}</code>
          return <span key={bi}>{bp}</span>
        })}
      </span>
    )
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectChatPanel({
  projectId,
  projectName,
  planId,
  planStatus,
  reviewScore,
  prUrl,
  fixAttemptCount,
  hasFailedFixes,
  onAction,
  mode = 'panel',
}: ProjectChatPanelProps) {
  const STORAGE_KEY = `codehive-chat-${projectId}`
  const isTerminal = mode === 'terminal'

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mounted, setMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const suggestions = getSuggestions(planStatus, reviewScore, hasFailedFixes, fixAttemptCount, prUrl)

  // ── Persistent memory: load from localStorage on mount ───────────────────
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Message[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.map(m => ({ ...m, streaming: false })))
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [projectId])

  // ── Persistent memory: save to localStorage on change ────────────────────
  useEffect(() => {
    if (!mounted || messages.length === 0) return
    try {
      const toSave = messages.map(m => ({ ...m, streaming: false }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // ignore
    }
  }, [messages, mounted, STORAGE_KEY])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Clear chat ────────────────────────────────────────────────────────────
  const clearChat = () => {
    setMessages([])
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // ── Toggle tool card collapse ─────────────────────────────────────────────
  const toggleToolCard = (msgIdx: number, toolId: string) => {
    setMessages(prev => {
      const u = [...prev]
      const msg = { ...u[msgIdx] }
      msg.toolCalls = msg.toolCalls.map(tc =>
        tc.toolId === toolId ? { ...tc, collapsed: !tc.collapsed } : tc,
      )
      u[msgIdx] = msg
      return u
    })
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim()
    if (!text || streaming) return

    const userMsg: Message = { role: 'user', content: text, toolCalls: [], streaming: false }
    const assistantMsg: Message = { role: 'assistant', content: '', toolCalls: [], streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    abortRef.current = new AbortController()

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

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
              setMessages(prev => {
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
              setMessages(prev => {
                const u = [...prev]
                const last = { ...u[u.length - 1] }
                last.toolCalls = [...last.toolCalls, newTool]
                u[u.length - 1] = last
                return u
              })
            } else if (ev.type === 'tool_result') {
              setMessages(prev => {
                const u = [...prev]
                const last = { ...u[u.length - 1] }
                last.toolCalls = last.toolCalls.map(tc =>
                  tc.toolId === ev.toolId ? { ...tc, output: ev.output, loading: false } : tc,
                )
                u[u.length - 1] = last
                return u
              })
            } else if (ev.type === 'action') {
              const card: ActionCard = {
                action: ev.action,
                label: ev.label,
                detail: ev.detail,
                planId: ev.planId,
                prUrl: ev.prUrl,
              }
              setMessages(prev => {
                const u = [...prev]
                const last = { ...u[u.length - 1] }
                last.actionCard = card
                u[u.length - 1] = last
                return u
              })
              if (onAction) onAction(ev.action, { planId: ev.planId, prUrl: ev.prUrl })
            } else if (ev.type === 'done') {
              setMessages(prev => {
                const u = [...prev]
                u[u.length - 1] = { ...u[u.length - 1], content: ev.fullText || fullText, streaming: false }
                return u
              })
            } else if (ev.type === 'error') {
              setMessages(prev => {
                const u = [...prev]
                u[u.length - 1] = { ...u[u.length - 1], content: `❌ ${ev.message}`, streaming: false }
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
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { ...u[u.length - 1], content: `❌ ${String(err)}`, streaming: false }
          return u
        })
      }
    } finally {
      setStreaming(false)
    }
  }, [input, messages, streaming, projectId, onAction])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — terminal mode: full-height flex column, no card wrapper
  // ─────────────────────────────────────────────────────────────────────────

  const outerStyle: React.CSSProperties = isTerminal
    ? {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(5,9,18,0.97)',
        overflow: 'hidden',
      }
    : {
        background: 'rgba(13,21,38,0.85)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.1)',
      }

  return (
    <div style={outerStyle}>

      {/* Rainbow accent line — only in panel mode */}
      {!isTerminal && (
        <div style={{ height: 2, background: 'linear-gradient(to right, #6366f1, #8b5cf6, #3b82f6, #06b6d4)', flexShrink: 0 }} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: isTerminal ? '10px 16px' : '1rem 1.4rem',
        borderBottom: '1px solid rgba(30,58,95,0.5)',
        background: isTerminal ? 'rgba(5,9,18,0.95)' : 'rgba(7,13,26,0.5)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        flexShrink: 0,
      }}>
        {/* Avatar */}
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
          🧠
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '0.88rem', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            Project Manager Agent
            <span style={{ fontSize: '0.58rem', padding: '2px 7px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, border: '1px solid rgba(99,102,241,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
              claude sonnet
            </span>
            {mounted && messages.length > 0 && (
              <span style={{ fontSize: '0.58rem', padding: '2px 7px', borderRadius: 9999, background: 'rgba(16,185,129,0.1)', color: '#34d399', fontWeight: 700, border: '1px solid rgba(16,185,129,0.2)', letterSpacing: '0.04em' }}>
                💾 {messages.filter(m => !m.streaming).length} saved
              </span>
            )}
          </div>
          <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 1 }}>
            Full context · web search · direct actions · persistent memory
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => send('Give me a complete project health briefing: plan status, CI health, what was built, what failed, and the top 3 things I should do next.')}
            disabled={streaming}
            style={{ padding: '0.4rem 0.9rem', background: streaming ? 'rgba(71,85,105,0.3)' : 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, color: streaming ? '#475569' : '#818cf8', fontSize: '0.72rem', fontWeight: 700, cursor: streaming ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            📊 Briefing
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={streaming}
              title="Clear chat history"
              style={{ padding: '0.4rem 0.75rem', background: 'rgba(30,41,59,0.4)', border: '1px solid rgba(30,58,95,0.5)', borderRadius: 8, color: '#475569', fontSize: '0.7rem', fontWeight: 600, cursor: streaming ? 'not-allowed' : 'pointer' }}
            >
              ↺ New
            </button>
          )}
        </div>
      </div>

      {/* ── Welcome / suggestions (shown when no messages) ──────────────────── */}
      {messages.length === 0 && (
        <div style={{ padding: '1.25rem 1.4rem', borderBottom: '1px solid rgba(30,58,95,0.35)', background: 'rgba(7,13,26,0.3)', flexShrink: 0 }}>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.65, marginBottom: '0.85rem' }}>
            I have full context on <strong style={{ color: '#c7d2fe' }}>{projectName}</strong> — plans, architecture, CI history, fix attempts.
            I can read your repo, check CI live, search the web, and take actions like approving plans or triggering runs.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.4rem' }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)} style={{ padding: '0.35rem 0.85rem', fontSize: '0.73rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, color: '#818cf8', cursor: 'pointer', fontWeight: 600 }}>
                {s}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.4rem', marginTop: '0.75rem' }}>
            {planStatus && (
              <span style={{ fontSize: '0.64rem', padding: '2px 8px', borderRadius: 9999, background: planStatus === 'approved' ? 'rgba(16,185,129,0.1)' : planStatus === 'needs_revision' ? 'rgba(249,115,22,0.1)' : 'rgba(30,58,95,0.4)', color: planStatus === 'approved' ? '#34d399' : planStatus === 'needs_revision' ? '#fb923c' : '#64748b', border: `1px solid ${planStatus === 'approved' ? '#10b98130' : planStatus === 'needs_revision' ? '#f9731630' : '#1e3a5f80'}`, fontWeight: 600 }}>
                Plan: {planStatus}
              </span>
            )}
            {reviewScore != null && (
              <span style={{ fontSize: '0.64rem', padding: '2px 8px', borderRadius: 9999, background: reviewScore >= 7.5 ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)', color: reviewScore >= 7.5 ? '#34d399' : '#fb923c', border: `1px solid ${reviewScore >= 7.5 ? '#10b98130' : '#f9731630'}`, fontWeight: 600 }}>
                Score: {reviewScore}/10
              </span>
            )}
            {fixAttemptCount > 0 && (
              <span style={{ fontSize: '0.64rem', padding: '2px 8px', borderRadius: 9999, background: hasFailedFixes ? 'rgba(239,68,68,0.1)' : 'rgba(30,58,95,0.4)', color: hasFailedFixes ? '#f87171' : '#64748b', border: `1px solid ${hasFailedFixes ? '#ef444430' : '#1e3a5f80'}`, fontWeight: 600 }}>
                {fixAttemptCount} fix{fixAttemptCount !== 1 ? 'es' : ''}{hasFailedFixes ? ' ⚠️' : ''}
              </span>
            )}
            {prUrl && (
              <a href={prUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.64rem', padding: '2px 8px', borderRadius: 9999, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', fontWeight: 600, textDecoration: 'none' }}>
                PR ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div style={{
        // Terminal: flex-grow + scroll; Panel: fixed max-height
        ...(isTerminal
          ? { flex: 1, overflowY: 'auto' as const }
          : { maxHeight: 540, overflowY: 'auto' as const }
        ),
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}>
        {messages.map((msg, msgIdx) => (
          <div key={msgIdx}>
            {/* Tool call cards */}
            {msg.role === 'assistant' && msg.toolCalls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {msg.toolCalls.map(tc => (
                  <div key={tc.toolId}>
                    <button
                      onClick={() => toggleToolCard(msgIdx, tc.toolId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.35rem 0.75rem',
                        background: isActionTool(tc.tool)
                          ? tc.loading ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)'
                          : tc.loading ? 'rgba(99,102,241,0.08)' : 'rgba(30,58,95,0.25)',
                        border: `1px solid ${isActionTool(tc.tool) ? 'rgba(16,185,129,0.3)' : tc.loading ? 'rgba(99,102,241,0.3)' : 'rgba(30,58,95,0.5)'}`,
                        borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem',
                        color: isActionTool(tc.tool) ? '#34d399' : tc.loading ? '#818cf8' : '#64748b',
                        fontWeight: 600, textAlign: 'left' as const, width: 'auto', maxWidth: '100%',
                      }}
                    >
                      {tc.loading
                        ? <span style={{ fontSize: '0.65rem' }}>⏳</span>
                        : <span style={{ fontSize: '0.65rem' }}>{isActionTool(tc.tool) ? '⚡' : '✓'}</span>
                      }
                      <span>{getToolLabel(tc.tool, tc.input)}</span>
                      {!tc.loading && tc.output && (
                        <span style={{ color: '#334155', fontSize: '0.65rem', marginLeft: 'auto' }}>
                          {tc.collapsed ? '▶' : '▼'}
                        </span>
                      )}
                    </button>

                    {!tc.collapsed && tc.output && (
                      <div style={{ marginTop: 4, padding: '0.55rem 0.8rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(30,58,95,0.4)', borderRadius: '0 0 8px 8px', fontSize: '0.68rem', fontFamily: 'monospace', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const, maxHeight: 200, overflowY: 'auto' }}>
                        {tc.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action card */}
            {msg.role === 'assistant' && msg.actionCard && (
              <div style={{ marginBottom: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                  {msg.actionCard.action === 'plan_approved' ? '✅'
                    : msg.actionCard.action === 'trigger_fix' ? '🔧'
                    : msg.actionCard.action === 'trigger_codegen' ? '💻'
                    : '🧪'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                    {msg.actionCard.label}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.74rem', lineHeight: 1.5 }}>
                    {msg.actionCard.detail}
                  </div>
                  {msg.actionCard.action !== 'plan_approved' && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#475569' }}>
                      ↓ Expand a Runner in the control panel to execute
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Message bubble */}
            {msg.content !== '' || msg.streaming ? (
              <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: '0.5rem' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, marginTop: 2 }}>
                    🧠
                  </div>
                )}

                <div style={{
                  maxWidth: '82%', padding: '0.65rem 0.95rem',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(30,41,59,0.5)',
                  border: msg.role === 'user' ? 'none' : '1px solid rgba(30,58,95,0.5)',
                  color: msg.role === 'user' ? '#000' : '#cbd5e1',
                  fontSize: '0.82rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const,
                  boxShadow: msg.role === 'user' ? '0 2px 12px rgba(245,158,11,0.2)' : '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                  {msg.content
                    ? renderContent(msg.content)
                    : msg.streaming
                    ? <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '0.75rem' }}>🧠</span>
                        <span style={{ fontSize: '0.72rem' }}>Thinking…</span>
                      </span>
                    : null}
                </div>

                {msg.role === 'user' && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, marginTop: 2 }}>
                    👤
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '0.85rem 1.1rem', borderTop: '1px solid rgba(30,58,95,0.5)', background: 'rgba(7,13,26,0.4)', display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about the project, CI failures, architecture, approve plans, trigger runs… (Enter to send)"
          rows={2}
          disabled={streaming}
          style={{ flex: 1, padding: '0.55rem 0.85rem', background: 'rgba(7,13,26,0.8)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', resize: 'none', lineHeight: 1.5, fontFamily: 'inherit', transition: 'border-color 0.2s' }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)' }}
        />
        <button
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          style={{
            padding: '0.55rem 1.15rem',
            background: streaming || !input.trim() ? 'rgba(71,85,105,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: streaming || !input.trim() ? '#475569' : '#fff',
            border: 'none', borderRadius: 10,
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' as const,
            alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: '0.35rem',
            boxShadow: streaming || !input.trim() ? 'none' : '0 0 16px rgba(99,102,241,0.35)',
            transition: 'all 0.2s',
          }}
        >
          {streaming ? '●●●' : '↑ Ask'}
        </button>
      </div>

      {/* Footer hint */}
      <div style={{ padding: '0.3rem 1.1rem 0.5rem', background: 'rgba(7,13,26,0.4)', borderTop: '1px solid rgba(30,58,95,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.62rem', color: '#334155' }}>
          Enter to send · Shift+Enter for new line
        </span>
        <span style={{ fontSize: '0.62rem', color: '#1e3a5f' }}>
          💾 memory · 🌐 web search · ⚡ actions
        </span>
      </div>
    </div>
  )
}
