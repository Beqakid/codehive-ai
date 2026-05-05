'use client'

import React, { useState, useRef, useEffect } from 'react'

type Mode = 'plan_only' | 'plan_code' | 'full_build'
type RunStatus = 'idle' | 'coaching' | 'questions' | 'enriched' | 'streaming' | 'done' | 'error'

interface LogEntry {
  type: string
  text: string
  agent?: string
  timestamp: string
  phase?: string
  planId?: number
  prUrl?: string
}

interface CoachQuestion {
  id: string
  question: string
  hint: string
}

interface CoachAnalysis {
  mode: 'auto' | 'interactive'
  completenessScore: number
  detectedIntent: string
  enrichedPrompt?: string
  questions?: CoachQuestion[]
  assumptions?: string[]
}

const MODES: { value: Mode; label: string; icon: string; desc: string }[] = [
  { value: 'plan_only', label: 'Plan Only', icon: '📋', desc: 'AI agents generate plan + open PR' },
  { value: 'plan_code', label: 'Plan + Code', icon: '⚡', desc: 'Plan + generate all implementation files' },
  { value: 'full_build', label: 'Full Build', icon: '🚀', desc: 'Plan + code + run sandbox tests' },
]

const MODE_COLORS: Record<Mode, { border: string; bg: string; glow: string; check: string }> = {
  plan_only: { border: 'rgba(59,130,246,0.45)', bg: 'rgba(59,130,246,0.08)', glow: 'rgba(59,130,246,0.1)', check: '#60a5fa' },
  plan_code: { border: 'rgba(139,92,246,0.45)', bg: 'rgba(139,92,246,0.08)', glow: 'rgba(139,92,246,0.1)', check: '#a78bfa' },
  full_build: { border: 'rgba(245,158,11,0.45)', bg: 'rgba(245,158,11,0.08)', glow: 'rgba(245,158,11,0.1)', check: '#fbbf24' },
}

const AGENT_COLORS: Record<string, string> = {
  product: '#60a5fa',
  architect: '#a78bfa',
  uiux: '#f472b6',
  reviewer: '#34d399',
  codegen: '#fbbf24',
  sandbox: '#f472b6',
}

const AGENT_ICONS: Record<string, string> = {
  product: '🗂️',
  architect: '🏗️',
  uiux: '🎨',
  reviewer: '🔎',
  codegen: '💻',
  sandbox: '🧪',
}

const REVIEW_AGENTS: { key: string; icon: string; label: string; editable: boolean; color: string }[] = [
  { key: 'product', icon: '🗂️', label: 'Product Agent', editable: true, color: '#60a5fa' },
  { key: 'architect', icon: '🏗️', label: 'Architect Agent', editable: true, color: '#a78bfa' },
  { key: 'uiux', icon: '🎨', label: 'UI/UX Designer', editable: true, color: '#f472b6' },
  { key: 'reviewer', icon: '🔎', label: 'Reviewer Agent', editable: false, color: '#34d399' },
]

const REPOS: { value: string; label: string; icon: string; desc: string }[] = [
  { value: 'https://github.com/Beqakid/codehive-sanbox', label: 'codehive-sanbox', icon: '🧪', desc: 'Default AI sandbox' },
  { value: 'https://github.com/Beqakid/viliniu', label: 'viliniu', icon: '🌾', desc: 'Farmers platform (PayloadCMS)' },
  { value: 'https://github.com/Beqakid/gotocare', label: 'gotocare', icon: '🏥', desc: 'Healthcare app (React + Supabase)' },
]

export default function CommandInterface() {
  const [prompt, setPrompt] = useState('')
  const [projectName, setProjectName] = useState('')
  const [mode, setMode] = useState<Mode>('plan_only')
  const [status, setStatus] = useState<RunStatus>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<{ planId?: number; prUrl?: string; projectId?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentAgent, setCurrentAgent] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [coachEnabled, setCoachEnabled] = useState(true)
  const [coachAnalysis, setCoachAnalysis] = useState<CoachAnalysis | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [enrichedPrompt, setEnrichedPrompt] = useState('')
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [editingEnriched, setEditingEnriched] = useState(false)
  const [coachLoading, setCoachLoading] = useState(false)
  const [targetRepo, setTargetRepo] = useState(REPOS[0].value)
  const [autopilot, setAutopilot] = useState(false)

  // Agent output review state
  const [agentOutputs, setAgentOutputs] = useState<Record<string, string>>({})
  const [editedOutputs, setEditedOutputs] = useState<Record<string, string>>({})
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [showReviewPanel, setShowReviewPanel] = useState(false)
  const [reReviewRunning, setReReviewRunning] = useState(false)
  const [reReviewResult, setReReviewResult] = useState<{ approved: boolean; score: number | null; reason: string } | null>(null)
  const [hasEdits, setHasEdits] = useState(false)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (entry: Omit<LogEntry, 'timestamp'>) => {
    setLogs((prev) => [...prev, { ...entry, timestamp: new Date().toLocaleTimeString() }])
  }

  /* ---------------------------------------------------------------- */
  /*  Coach flow                                                       */
  /* ---------------------------------------------------------------- */

  const handleCoachAnalyze = async () => {
    if (!prompt.trim()) return
    setStatus('coaching')
    setCoachLoading(true)
    setCoachAnalysis(null)
    setAnswers({})
    setEnrichedPrompt('')
    setAssumptions([])
    setEditingEnriched(false)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Coach failed' })) as { error?: string }
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const analysis = (await res.json()) as CoachAnalysis
      setCoachAnalysis(analysis)
      if (analysis.mode === 'interactive' && analysis.questions?.length) {
        setStatus('questions')
      } else {
        setEnrichedPrompt(analysis.enrichedPrompt || prompt.trim())
        setAssumptions(analysis.assumptions || [])
        setStatus('enriched')
      }
    } catch (err) {
      console.error('[coach] error:', err)
      runPipeline(prompt.trim())
    } finally {
      setCoachLoading(false)
    }
  }

  const handleSubmitAnswers = async () => {
    if (!coachAnalysis?.questions?.length) return
    setCoachLoading(true)
    try {
      const res = await fetch('/api/coach/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), questions: coachAnalysis.questions, answers }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = (await res.json()) as { enrichedPrompt: string; assumptions: string[] }
      setEnrichedPrompt(result.enrichedPrompt)
      setAssumptions(result.assumptions || [])
      setStatus('enriched')
    } catch (err) {
      console.error('[coach/refine] error:', err)
      runPipeline(prompt.trim())
    } finally {
      setCoachLoading(false)
    }
  }

  const handleApproveEnriched = () => { runPipeline(enrichedPrompt || prompt.trim()) }

  /* ---------------------------------------------------------------- */
  /*  Main pipeline                                                    */
  /* ---------------------------------------------------------------- */

  const handleSubmit = () => {
    if (!prompt.trim() || status === 'streaming' || status === 'coaching') return
    if (coachEnabled) { handleCoachAnalyze() } else { runPipeline(prompt.trim()) }
  }

  const runPipeline = async (finalPrompt: string) => {
    setStatus('streaming')
    setLogs([])
    setResult(null)
    setError(null)
    setCurrentAgent(null)
    setCoachAnalysis(null)
    setEditingEnriched(false)
    setAgentOutputs({})
    setEditedOutputs({})
    setExpandedAgent(null)
    setEditingAgent(null)
    setShowReviewPanel(false)
    setReReviewResult(null)
    setHasEdits(false)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt: finalPrompt, mode, projectName: projectName.trim() || undefined, targetRepo, autopilot }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) {
        let errDetail = `HTTP ${res.status}`
        try {
          const errBody = await res.text()
          try { const parsed = JSON.parse(errBody) as { error?: string }; if (parsed.error) errDetail = parsed.error } catch { if (errBody.length > 0 && errBody.length < 500) errDetail = errBody }
        } catch { /* ignore */ }
        throw new Error(errDetail)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentProjectId: number | undefined
      let streamDone = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(line.slice(6)) as Record<string, unknown> } catch { continue }

          try {
            switch (event.type) {
              case 'created':
                currentProjectId = event.projectId as number
                addLog({ type: 'start', text: `✅ Created project #${event.projectId} + coding request #${event.codingRequestId}` })
                addLog({ type: 'start', text: `🔌 Starting ${mode.replace('_', ' ')} pipeline...` })
                break
              case 'start': addLog({ type: 'start', text: String(event.message ?? '') }); break
              case 'phase': addLog({ type: 'phase', text: String(event.message ?? ''), phase: String(event.phase ?? '') }); break
              case 'agent_start':
                setCurrentAgent(String(event.agent ?? ''))
                addLog({ type: 'agent_start', text: String(event.message ?? ''), agent: String(event.agent ?? '') })
                break
              case 'agent_done':
                addLog({ type: 'agent_done', text: `✅ ${AGENT_ICONS[String(event.agent ?? '')] || '🤖'} ${event.agent} agent done`, agent: String(event.agent ?? '') })
                setCurrentAgent(null)
                break
              case 'agent_output':
                if (event.agent && event.content) {
                  setAgentOutputs(prev => ({ ...prev, [String(event.agent)]: String(event.content) }))
                }
                break
              case 'chunk': break
              case 'github_context': addLog({ type: 'github_context', text: `📂 Loaded ${event.files} repo files` }); break
              case 'pr_created': addLog({ type: 'pr_created', text: `🔗 PR created: ${event.url}` }); break
              case 'plan_saved': addLog({ type: 'plan_saved', text: `💾 Plan #${event.planId} saved` }); break
              case 'file_done': addLog({ type: 'file_committed', text: `📄 Committed: ${event.file}` }); break
              case 'sandbox_step': addLog({ type: 'sandbox_step', text: `🧪 ${event.step}: ${event.status}` }); break
              case 'autopilot_proceed': addLog({ type: 'phase', text: `🤖 ${String(event.message ?? '')}` }); break
              case 'codegen_blocked': addLog({ type: 'error', text: '⚠️ Code generation blocked — reviewer requested revisions' }); break
              case 'done':
                setResult({ planId: event.planId as number | undefined, prUrl: event.prUrl as string | undefined, projectId: currentProjectId })
                setStatus('done')
                setShowReviewPanel(true)
                streamDone = true
                addLog({ type: 'done', text: '🎉 Pipeline complete!' })
                break
              case 'error':
                setError(String(event.message ?? 'Unknown error')); setStatus('error'); streamDone = true
                addLog({ type: 'error', text: `❌ ${event.message ?? 'Unknown error'}` })
                break
            }
          } catch (handlerErr) { addLog({ type: 'error', text: `❌ Event handler error: ${String(handlerErr)}` }) }
        }
      }

      if (!streamDone) { setStatus('done'); setShowReviewPanel(true); addLog({ type: 'done', text: '🎉 Stream ended' }) }
    } catch (err) {
      if (String(err).includes('AbortError') || String(err).includes('abort')) return
      const msg = String(err)
      setError(msg); setStatus('error')
      addLog({ type: 'error', text: `❌ ${msg}` })
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Re-review flow                                                   */
  /* ---------------------------------------------------------------- */

  const handleReReview = async () => {
    const planId = result?.planId
    if (!planId) return
    setReReviewRunning(true)
    setReReviewResult(null)

    try {
      const body: Record<string, string> = {}
      if (editedOutputs['product']) body.productSpec = editedOutputs['product']
      if (editedOutputs['architect']) body.architectureDesign = editedOutputs['architect']
      if (editedOutputs['uiux']) body.uiuxDesign = editedOutputs['uiux']

      const res = await fetch(`/api/plans/${planId}/re-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(line.slice(6)) as Record<string, unknown> } catch { continue }

          if (event.type === 'agent_output' && event.agent === 'reviewer') {
            setAgentOutputs(prev => ({ ...prev, reviewer: String(event.content ?? '') }))
          }
          if (event.type === 'verdict') {
            setReReviewResult({
              approved: Boolean(event.approved),
              score: typeof event.score === 'number' ? event.score : null,
              reason: String(event.reason ?? ''),
            })
          }
        }
      }
    } catch (err) {
      console.error('[re-review] error:', err)
    } finally {
      setReReviewRunning(false)
    }
  }

  const saveEdit = (agent: string) => {
    setEditingAgent(null)
    setHasEdits(true)
    addLog({ type: 'start', text: `✏️ Saved edits to ${agent} output` })
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStatus('idle')
    addLog({ type: 'start', text: '⏹ Stopped by user' })
  }

  const resetAll = () => {
    setStatus('idle'); setLogs([]); setResult(null); setError(null)
    setPrompt(''); setProjectName(''); setCoachAnalysis(null)
    setAnswers({}); setEnrichedPrompt(''); setAssumptions([]); setEditingEnriched(false)
    setAgentOutputs({}); setEditedOutputs({}); setExpandedAgent(null)
    setEditingAgent(null); setShowReviewPanel(false); setReReviewResult(null); setHasEdits(false)
  }

  const isRunning = status === 'streaming'
  const isCoaching = status === 'coaching' || status === 'questions' || status === 'enriched'
  const disabled = isRunning || isCoaching
  const score = coachAnalysis?.completenessScore ?? 0
  const scoreColor = score >= 0.7 ? '#34d399' : score >= 0.4 ? '#fbbf24' : '#f87171'

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div style={{
      borderRadius: 16,
      overflow: 'hidden',
      background: 'linear-gradient(145deg, rgba(15,23,42,0.97), rgba(8,15,30,0.95))',
      border: '1px solid rgba(51,65,85,0.45)',
      boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(148,163,184,0.04)',
    }}>
      {/* Top gradient accent */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #f472b6, #f59e0b, #ef4444)', opacity: 0.75 }} />

      {/* Header */}
      <div style={{
        padding: '18px 24px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid rgba(51,65,85,0.3)',
        background: 'rgba(15,23,42,0.4)',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
          fontSize: 18, position: 'relative',
        }}>
          ⌘
          {isRunning && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              width: 10, height: 10, borderRadius: '50%',
              background: '#34d399', border: '2px solid #0f172a',
              animation: 'pulse 1.5s infinite',
            }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
            Global Command Interface
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
            Describe what to build → 5 AI agents handle the rest
          </p>
        </div>
        {isRunning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 20,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>
              {currentAgent ? `${AGENT_ICONS[currentAgent] || '🤖'} ${currentAgent} running…` : 'Initializing…'}
            </span>
          </div>
        )}
        {status === 'coaching' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 20,
            background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#06b6d4', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 11, color: '#06b6d4', fontWeight: 600 }}>🎯 Analyzing prompt…</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── Prompt textarea ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              What do you want to build?
            </label>
            <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>⌘ + Enter to submit</span>
          </div>
          <textarea
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(15,23,42,0.6)',
              border: '1px solid rgba(51,65,85,0.5)',
              borderRadius: 12, color: '#f1f5f9', fontSize: 14,
              padding: '14px 16px', resize: 'none', outline: 'none',
              lineHeight: 1.65, fontFamily: 'inherit',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            rows={4}
            placeholder="e.g. Build a project management SaaS with Kanban boards, task assignments, team workspaces, due dates, and user auth…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08), inset 0 2px 4px rgba(0,0,0,0.15)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(51,65,85,0.5)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        {/* ── Project name + Build mode ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Project name <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(optional)</span>
            </label>
            <input
              type="text"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(51,65,85,0.5)',
                borderRadius: 10, color: '#f1f5f9', fontSize: 13,
                padding: '10px 14px', outline: 'none',
                transition: 'border-color 0.2s',
              }}
              placeholder="My Awesome Project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={disabled}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(51,65,85,0.5)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Build mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {MODES.map((m) => {
                const active = mode === m.value
                const colors = MODE_COLORS[m.value]
                return (
                  <button
                    key={m.value}
                    onClick={() => !disabled && setMode(m.value)}
                    disabled={disabled}
                    style={{
                      position: 'relative',
                      padding: '12px 14px', borderRadius: 12,
                      textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      background: active ? colors.bg : 'rgba(15,23,42,0.3)',
                      border: `1px solid ${active ? colors.border : 'rgba(51,65,85,0.35)'}`,
                      boxShadow: active ? `0 4px 14px ${colors.glow}` : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {active && (
                      <span style={{ position: 'absolute', top: 8, right: 10 }}>
                        <svg style={{ width: 14, height: 14, display: 'block' }} fill={colors.check} viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{m.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 12, color: active ? '#f1f5f9' : '#94a3b8' }}>{m.label}</span>
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: active ? '#cbd5e1' : '#475569' }}>{m.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Target repository ── */}
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Target repository
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {REPOS.map((r) => {
              const active = targetRepo === r.value
              return (
                <button
                  key={r.value}
                  onClick={() => !disabled && setTargetRepo(r.value)}
                  disabled={disabled}
                  style={{
                    position: 'relative',
                    padding: '10px 14px', borderRadius: 12,
                    textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    background: active ? 'rgba(16,185,129,0.07)' : 'rgba(15,23,42,0.3)',
                    border: `1px solid ${active ? 'rgba(16,185,129,0.4)' : 'rgba(51,65,85,0.35)'}`,
                    boxShadow: active ? '0 4px 14px rgba(16,185,129,0.08)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {active && (
                    <span style={{ position: 'absolute', top: 7, right: 9 }}>
                      <svg style={{ width: 12, height: 12, display: 'block' }} fill="#34d399" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{r.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: active ? '#6ee7b7' : '#94a3b8', fontFamily: 'monospace' }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: active ? '#4ade80' : '#475569', lineHeight: 1.4 }}>{r.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Action bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 2 }}>
          <button
            onClick={() => !disabled && setCoachEnabled(!coachEnabled)}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderRadius: 12,
              background: coachEnabled ? 'rgba(6,182,212,0.08)' : 'rgba(15,23,42,0.3)',
              border: `1px solid ${coachEnabled ? 'rgba(6,182,212,0.3)' : 'rgba(51,65,85,0.35)'}`,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.2s', fontSize: 12, fontWeight: 700,
              color: coachEnabled ? '#67e8f9' : '#64748b',
            }}
          >
            <div style={{ position: 'relative', width: 28, height: 16, borderRadius: 8, background: coachEnabled ? 'rgba(6,182,212,0.35)' : 'rgba(51,65,85,0.5)', transition: 'background 0.2s' }}>
              <div style={{
                position: 'absolute', top: 2, width: 12, height: 12, borderRadius: 6,
                background: coachEnabled ? '#06b6d4' : '#475569',
                left: coachEnabled ? 14 : 2,
                boxShadow: coachEnabled ? '0 0 8px rgba(6,182,212,0.5)' : 'none',
                transition: 'all 0.2s',
              }} />
            </div>
            🎯 Coach
          </button>

          <button
            onClick={() => !disabled && setAutopilot(!autopilot)}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderRadius: 12,
              background: autopilot ? 'rgba(168,85,247,0.08)' : 'rgba(15,23,42,0.3)',
              border: `1px solid ${autopilot ? 'rgba(168,85,247,0.3)' : 'rgba(51,65,85,0.35)'}`,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.2s', fontSize: 12, fontWeight: 700,
              color: autopilot ? '#d8b4fe' : '#64748b',
            }}
          >
            <div style={{ position: 'relative', width: 28, height: 16, borderRadius: 8, background: autopilot ? 'rgba(168,85,247,0.35)' : 'rgba(51,65,85,0.5)', transition: 'background 0.2s' }}>
              <div style={{
                position: 'absolute', top: 2, width: 12, height: 12, borderRadius: 6,
                background: autopilot ? '#a855f7' : '#475569',
                left: autopilot ? 14 : 2,
                boxShadow: autopilot ? '0 0 8px rgba(168,85,247,0.5)' : 'none',
                transition: 'all 0.2s',
              }} />
            </div>
            🤖 Autopilot
          </button>

          <button
            onClick={isRunning ? handleStop : handleSubmit}
            disabled={!isRunning && !prompt.trim()}
            style={{
              flex: 1, padding: '12px 20px', borderRadius: 12,
              fontWeight: 800, fontSize: 13, border: 'none',
              cursor: (!isRunning && !prompt.trim()) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              ...(isRunning
                ? { background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', boxShadow: '0 4px 16px rgba(220,38,38,0.3)' }
                : status === 'coaching'
                  ? { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#67e8f9', cursor: 'wait' }
                  : prompt.trim()
                    ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', boxShadow: '0 4px 16px rgba(245,158,11,0.25)' }
                    : { background: 'rgba(30,41,59,0.4)', color: '#475569', border: '1px solid rgba(51,65,85,0.3)' }
              ),
            }}
          >
            {isRunning ? '⏹ Stop Pipeline' : status === 'coaching' ? '🎯 Analyzing…' : coachEnabled ? '🎯 Analyze & Build' : '⌘ Run Pipeline'}
          </button>

          {(status === 'done' || status === 'error') && (
            <button onClick={resetAll} style={secondaryBtnStyle}>↺ New</button>
          )}
        </div>

        {/* ============================================================ */}
        {/*  COACH: Questions                                             */}
        {/* ============================================================ */}
        {status === 'questions' && coachAnalysis?.questions && (
          <div style={{
            borderRadius: 12, overflow: 'hidden',
            background: 'linear-gradient(145deg, rgba(6,182,212,0.05), rgba(8,15,30,0.8))',
            border: '1px solid rgba(6,182,212,0.2)',
          }}>
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,182,212,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,182,212,0.12)', fontSize: 14 }}>🎯</div>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#67e8f9' }}>Prompt Coach</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: scoreColor, padding: '2px 10px', borderRadius: 20, background: `${scoreColor}15`, border: `1px solid ${scoreColor}30` }}>
                  {Math.round(score * 100)}% complete
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{coachAnalysis.detectedIntent}</span>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>A few quick questions to help the AI agents build exactly what you need:</p>
              {coachAnalysis.questions.map((q, idx) => (
                <div key={q.id}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#67e8f9', marginBottom: 8, fontWeight: 600 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,182,212,0.12)', color: '#67e8f9' }}>{idx + 1}</span>
                    {q.question}
                  </label>
                  <input
                    type="text"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: 10, color: '#f1f5f9', fontSize: 13, padding: '10px 14px', outline: 'none', transition: 'border-color 0.2s' }}
                    placeholder={q.hint}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitAnswers() }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(6,182,212,0.5)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(51,65,85,0.5)' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={handleSubmitAnswers} disabled={coachLoading} style={{ flex: 1, padding: '11px 16px', borderRadius: 12, fontWeight: 800, fontSize: 13, border: 'none', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff', boxShadow: '0 4px 14px rgba(6,182,212,0.2)', cursor: coachLoading ? 'wait' : 'pointer', opacity: coachLoading ? 0.6 : 1 }}>
                  {coachLoading ? '✨ Enriching…' : '✅ Submit Answers'}
                </button>
                <button onClick={() => runPipeline(prompt.trim())} style={secondaryBtnStyle}>Skip →</button>
                <button onClick={() => { setStatus('idle'); setCoachAnalysis(null) }} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  COACH: Enriched prompt review                               */}
        {/* ============================================================ */}
        {status === 'enriched' && enrichedPrompt && (
          <div style={{
            borderRadius: 12, overflow: 'hidden',
            background: 'linear-gradient(145deg, rgba(16,185,129,0.05), rgba(8,15,30,0.8))',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(16,185,129,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.12)', fontSize: 14 }}>✨</div>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#6ee7b7' }}>Enhanced Prompt</span>
                {coachAnalysis && (
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: scoreColor, padding: '2px 10px', borderRadius: 20, background: `${scoreColor}15`, border: `1px solid ${scoreColor}30` }}>
                    {Math.round(score * 100)}% → enriched
                  </span>
                )}
              </div>
              <button onClick={() => setEditingEnriched(!editingEnriched)} style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, cursor: 'pointer', padding: '4px 12px', borderRadius: 8, background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.35)' }}>
                {editingEnriched ? '👁 Preview' : '✏️ Edit'}
              </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {editingEnriched ? (
                <textarea style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: 10, color: '#f1f5f9', fontSize: 13, padding: 14, resize: 'none', outline: 'none', fontFamily: 'monospace', lineHeight: 1.6 }} rows={12} value={enrichedPrompt} onChange={(e) => setEnrichedPrompt(e.target.value)} />
              ) : (
                <div style={{ background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(51,65,85,0.25)', borderRadius: 10, padding: 16, maxHeight: 260, overflowY: 'auto' }}>
                  <pre style={{ margin: 0, color: '#e2e8f0', fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>{enrichedPrompt}</pre>
                </div>
              )}
              {assumptions.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assumptions made</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {assumptions.map((a, i) => (
                      <span key={i} style={{ fontSize: 11, borderRadius: 20, padding: '3px 12px', fontWeight: 600, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={handleApproveEnriched} style={{ flex: 1, padding: '11px 16px', borderRadius: 12, fontWeight: 800, fontSize: 13, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', boxShadow: '0 4px 16px rgba(245,158,11,0.25)', cursor: 'pointer' }}>
                  ✅ Approve & Run Pipeline
                </button>
                <button onClick={() => runPipeline(prompt.trim())} style={secondaryBtnStyle}>Skip → Original</button>
                <button onClick={() => { setStatus('idle'); setCoachAnalysis(null); setEnrichedPrompt('') }} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Execution log                                               */}
        {/* ============================================================ */}
        {logs.length > 0 && (
          <div style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(2,6,23,0.75)', border: '1px solid rgba(30,41,59,0.45)' }}>
            <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(30,41,59,0.4)' }}>
              <svg style={{ width: 14, height: 14, display: 'block', color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Execution Log</span>
              {isRunning && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', animation: 'pulse 1.5s infinite' }} />}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#334155', fontFamily: 'monospace' }}>{logs.length} events</span>
            </div>
            <div style={{ height: 240, overflowY: 'auto', padding: 16, fontFamily: 'monospace', fontSize: 12 }}>
              {logs.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, lineHeight: 1.7, padding: '1px 0' }}>
                  <span style={{ color: '#334155', flexShrink: 0, userSelect: 'none' }}>{entry.timestamp}</span>
                  <span style={{
                    color: entry.type === 'error' ? '#f87171'
                      : entry.type === 'done' ? '#34d399'
                      : entry.type === 'phase' ? '#fbbf24'
                      : entry.type === 'agent_start' ? (AGENT_COLORS[entry.agent ?? ''] ?? '#22d3ee')
                      : entry.type === 'agent_done' ? '#6ee7b7'
                      : (entry.type === 'pr_created' || entry.type === 'plan_saved') ? '#34d399'
                      : '#cbd5e1',
                    fontWeight: entry.type === 'done' ? 700 : 400,
                  }}>
                    {entry.text}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Result card                                                 */}
        {/* ============================================================ */}
        {status === 'done' && result && (
          <div style={{
            borderRadius: 12, padding: 20,
            background: 'linear-gradient(145deg, rgba(16,185,129,0.06), rgba(8,15,30,0.6))',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.12)', fontSize: 15 }}>🎉</div>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#34d399' }}>Build Complete!</span>
            </div>
            <div style={{ paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.projectId && (
                <a href={`/projects/${result.projectId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}>
                  📁 View project #{result.projectId}
                  <svg style={{ width: 12, height: 12, display: 'inline-block' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              )}
              {result.planId && <div style={{ color: '#64748b', fontSize: 13 }}>💾 Agent Plan #{result.planId} saved</div>}
              {result.prUrl && (
                <a href={result.prUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}>
                  🔗 View PR on GitHub
                  <svg style={{ width: 12, height: 12, display: 'inline-block' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Agent Output Review Panel                                   */}
        {/* ============================================================ */}
        {status === 'done' && showReviewPanel && Object.keys(agentOutputs).length > 0 && (
          <div style={{
            borderRadius: 12, overflow: 'hidden',
            background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(8,15,30,0.85))',
            border: '1px solid rgba(51,65,85,0.4)',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(51,65,85,0.3)',
              background: 'rgba(15,23,42,0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14 }}>📋</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Review Agent Outputs</span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa',
                }}>
                  {Object.keys(agentOutputs).length} agents
                </span>
                {hasEdits && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24',
                  }}>
                    ✏️ Edited
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowReviewPanel(false)}
                style={{ fontSize: 12, color: '#475569', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Agent cards */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REVIEW_AGENTS.filter(a => agentOutputs[a.key]).map((agentInfo) => {
                const content = editedOutputs[agentInfo.key] ?? agentOutputs[agentInfo.key] ?? ''
                const isExpanded = expandedAgent === agentInfo.key
                const isEditing = editingAgent === agentInfo.key
                const wasEdited = !!editedOutputs[agentInfo.key]

                return (
                  <div
                    key={agentInfo.key}
                    style={{
                      borderRadius: 10, overflow: 'hidden',
                      border: `1px solid ${wasEdited ? 'rgba(245,158,11,0.3)' : 'rgba(51,65,85,0.3)'}`,
                      background: wasEdited ? 'rgba(245,158,11,0.03)' : 'rgba(15,23,42,0.4)',
                    }}
                  >
                    {/* Card header */}
                    <div
                      style={{
                        padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer',
                      }}
                      onClick={() => setExpandedAgent(isExpanded ? null : agentInfo.key)}
                    >
                      <span style={{ fontSize: 14 }}>{agentInfo.icon}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: agentInfo.color }}>
                        {agentInfo.label}
                      </span>
                      {wasEdited && (
                        <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 600 }}>✏️ edited</span>
                      )}
                      <span style={{
                        fontSize: 10, color: '#475569', fontFamily: 'monospace',
                      }}>
                        {content.length.toLocaleString()} chars
                      </span>
                      <span style={{ fontSize: 12, color: '#475569', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid rgba(51,65,85,0.2)', padding: 14 }}>
                        {isEditing ? (
                          <textarea
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: 'rgba(8,15,30,0.8)',
                              border: `1px solid ${agentInfo.color}40`,
                              borderRadius: 8, color: '#e2e8f0', fontSize: 12,
                              padding: 12, resize: 'vertical', outline: 'none',
                              fontFamily: 'monospace', lineHeight: 1.6, minHeight: 280,
                            }}
                            value={content}
                            onChange={(e) => setEditedOutputs(prev => ({ ...prev, [agentInfo.key]: e.target.value }))}
                          />
                        ) : (
                          <div style={{
                            maxHeight: 320, overflowY: 'auto',
                            background: 'rgba(8,15,30,0.5)',
                            borderRadius: 8, padding: 12,
                          }}>
                            <pre style={{ margin: 0, color: '#94a3b8', fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6 }}>
                              {content}
                            </pre>
                          </div>
                        )}

                        {/* Card actions */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          {agentInfo.editable && (
                            isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(agentInfo.key)}
                                  style={{
                                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    background: `${agentInfo.color}15`, border: `1px solid ${agentInfo.color}40`,
                                    color: agentInfo.color, cursor: 'pointer',
                                  }}
                                >
                                  ✅ Save Edits
                                </button>
                                <button
                                  onClick={() => { setEditingAgent(null); setEditedOutputs(prev => { const n = {...prev}; delete n[agentInfo.key]; return n }) }}
                                  style={smallSecondaryBtn}
                                >
                                  ✕ Discard
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingAgent(agentInfo.key)
                                  if (!editedOutputs[agentInfo.key]) {
                                    setEditedOutputs(prev => ({ ...prev, [agentInfo.key]: agentOutputs[agentInfo.key] ?? '' }))
                                  }
                                }}
                                style={smallSecondaryBtn}
                              >
                                ✏️ Edit
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Panel footer actions */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(51,65,85,0.3)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Re-review button */}
              {hasEdits && result?.planId && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    onClick={handleReReview}
                    disabled={reReviewRunning}
                    style={{
                      flex: 1, padding: '10px 16px', borderRadius: 10,
                      fontWeight: 700, fontSize: 13, border: 'none',
                      background: reReviewRunning ? 'rgba(139,92,246,0.1)' : 'linear-gradient(135deg, rgba(139,92,246,0.8), rgba(109,40,217,0.8))',
                      color: '#fff',
                      boxShadow: reReviewRunning ? 'none' : '0 4px 14px rgba(139,92,246,0.2)',
                      cursor: reReviewRunning ? 'wait' : 'pointer',
                      opacity: reReviewRunning ? 0.7 : 1,
                    }}
                  >
                    {reReviewRunning ? '🔎 Re-running Reviewer…' : '🔄 Re-run Reviewer with Edits'}
                  </button>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Applies your edits and re-evaluates the plan
                  </span>
                </div>
              )}

              {/* Re-review result */}
              {reReviewResult && (
                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: reReviewResult.approved ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
                  border: `1px solid ${reReviewResult.approved ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{reReviewResult.approved ? '✅' : '⚠️'}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: reReviewResult.approved ? '#34d399' : '#fbbf24' }}>
                      Re-review: {reReviewResult.approved ? 'APPROVED' : 'NEEDS REVISION'}
                    </span>
                    {reReviewResult.score !== null && (
                      <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                        {reReviewResult.score}/10
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                    {reReviewResult.reason}
                  </p>
                </div>
              )}

              {/* Hint */}
              <p style={{ margin: 0, fontSize: 11, color: '#334155', lineHeight: 1.5 }}>
                💡 View the full plan, run codegen, and manage fix attempts on the{' '}
                {result?.projectId ? (
                  <a href={`/projects/${result.projectId}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                    project detail page →
                  </a>
                ) : 'project detail page.'}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div style={{
            borderRadius: 12, padding: 20,
            background: 'linear-gradient(145deg, rgba(239,68,68,0.06), rgba(8,15,30,0.6))',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.12)', fontSize: 15 }}>❌</div>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#f87171' }}>Pipeline Error</span>
            </div>
            <p style={{ margin: 0, paddingLeft: 44, color: '#fca5a5', fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{error}</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '11px 16px', borderRadius: 12,
  fontSize: 13, fontWeight: 600, color: '#94a3b8',
  background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(51,65,85,0.35)',
  cursor: 'pointer', transition: 'all 0.2s',
}

const smallSecondaryBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8,
  fontSize: 11, fontWeight: 600, color: '#64748b',
  background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.3)',
  cursor: 'pointer',
}
