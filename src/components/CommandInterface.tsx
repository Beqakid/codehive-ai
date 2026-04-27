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

const MODES: { value: Mode; label: string; icon: string; desc: string; gradient: string; border: string; glow: string }[] = [
  {
    value: 'plan_only',
    label: 'Plan Only',
    icon: '📋',
    desc: 'AI agents generate plan + open PR',
    gradient: 'from-blue-500/20 to-blue-600/5',
    border: 'border-blue-500/40',
    glow: 'shadow-blue-500/10',
  },
  {
    value: 'plan_code',
    label: 'Plan + Code',
    icon: '⚡',
    desc: 'Plan + generate all implementation files',
    gradient: 'from-violet-500/20 to-purple-600/5',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/10',
  },
  {
    value: 'full_build',
    label: 'Full Build',
    icon: '🚀',
    desc: 'Plan + code + run sandbox tests',
    gradient: 'from-amber-500/20 to-orange-600/5',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/10',
  },
]

const AGENT_COLORS: Record<string, string> = {
  product: 'text-blue-400',
  architect: 'text-violet-400',
  reviewer: 'text-emerald-400',
  codegen: 'text-amber-400',
  sandbox: 'text-rose-400',
}

const AGENT_ICONS: Record<string, string> = {
  product: '🗂️',
  architect: '🏗️',
  reviewer: '🔎',
  codegen: '💻',
  sandbox: '🧪',
}

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

  // Coach state
  const [coachEnabled, setCoachEnabled] = useState(true)
  const [coachAnalysis, setCoachAnalysis] = useState<CoachAnalysis | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [enrichedPrompt, setEnrichedPrompt] = useState('')
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [editingEnriched, setEditingEnriched] = useState(false)
  const [coachLoading, setCoachLoading] = useState(false)

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
        body: JSON.stringify({
          prompt: prompt.trim(),
          questions: coachAnalysis.questions,
          answers,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

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

  const handleApproveEnriched = () => {
    runPipeline(enrichedPrompt || prompt.trim())
  }

  /* ---------------------------------------------------------------- */
  /*  Main pipeline                                                    */
  /* ---------------------------------------------------------------- */

  const handleSubmit = () => {
    if (!prompt.trim() || status === 'streaming' || status === 'coaching') return

    if (coachEnabled) {
      handleCoachAnalyze()
    } else {
      runPipeline(prompt.trim())
    }
  }

  const runPipeline = async (finalPrompt: string) => {
    setStatus('streaming')
    setLogs([])
    setResult(null)
    setError(null)
    setCurrentAgent(null)
    setCoachAnalysis(null)
    setEditingEnriched(false)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          prompt: finalPrompt,
          mode,
          projectName: projectName.trim() || undefined,
        }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) {
        let errDetail = `HTTP ${res.status}`
        try {
          const errBody = await res.text()
          try {
            const parsed = JSON.parse(errBody) as { error?: string }
            if (parsed.error) errDetail = parsed.error
          } catch {
            if (errBody.length > 0 && errBody.length < 500) errDetail = errBody
          }
        } catch {
          // ignore
        }
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
          try {
            event = JSON.parse(line.slice(6)) as Record<string, unknown>
          } catch {
            continue
          }

          try {
            switch (event.type) {
              case 'created':
                currentProjectId = event.projectId as number
                addLog({
                  type: 'start',
                  text: `✅ Created project #${event.projectId} + coding request #${event.codingRequestId}`,
                })
                addLog({
                  type: 'start',
                  text: `🔌 Starting ${mode.replace('_', ' ')} pipeline...`,
                })
                break
              case 'start':
                addLog({ type: 'start', text: String(event.message ?? '') })
                break
              case 'phase':
                addLog({
                  type: 'phase',
                  text: String(event.message ?? ''),
                  phase: String(event.phase ?? ''),
                })
                break
              case 'agent_start':
                setCurrentAgent(String(event.agent ?? ''))
                addLog({
                  type: 'agent_start',
                  text: String(event.message ?? ''),
                  agent: String(event.agent ?? ''),
                })
                break
              case 'agent_done':
                addLog({
                  type: 'agent_done',
                  text: `✅ ${event.agent} agent done`,
                  agent: String(event.agent ?? ''),
                })
                setCurrentAgent(null)
                break
              case 'chunk':
                break
              case 'github_context':
                addLog({ type: 'github_context', text: `📂 Loaded ${event.files} repo files` })
                break
              case 'pr_created':
                addLog({ type: 'pr_created', text: `🔗 PR created: ${event.url}` })
                break
              case 'plan_saved':
                addLog({ type: 'plan_saved', text: `💾 Plan #${event.planId} saved` })
                break
              case 'file_done':
                addLog({ type: 'file_committed', text: `📄 Committed: ${event.file}` })
                break
              case 'sandbox_step':
                addLog({ type: 'sandbox_step', text: `🧪 ${event.step}: ${event.status}` })
                break
              case 'codegen_blocked':
                addLog({ type: 'error', text: `⚠️ Code generation blocked — reviewer requested revisions` })
                break
              case 'done':
                setResult({
                  planId: event.planId as number | undefined,
                  prUrl: event.prUrl as string | undefined,
                  projectId: currentProjectId,
                })
                setStatus('done')
                streamDone = true
                addLog({ type: 'done', text: '🎉 Pipeline complete!' })
                break
              case 'error':
                setError(String(event.message ?? 'Unknown error'))
                setStatus('error')
                streamDone = true
                addLog({ type: 'error', text: `❌ ${event.message ?? 'Unknown error'}` })
                break
            }
          } catch (handlerErr) {
            addLog({ type: 'error', text: `❌ Event handler error: ${String(handlerErr)}` })
          }
        }
      }

      if (!streamDone) {
        setStatus('done')
        addLog({ type: 'done', text: '🎉 Stream ended' })
      }
    } catch (err) {
      if (String(err).includes('AbortError') || String(err).includes('abort')) return
      const msg = String(err)
      setError(msg)
      setStatus('error')
      addLog({ type: 'error', text: `❌ ${msg}` })
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStatus('idle')
    addLog({ type: 'start', text: '⏹ Stopped by user' })
  }

  const resetAll = () => {
    setStatus('idle')
    setLogs([])
    setResult(null)
    setError(null)
    setPrompt('')
    setProjectName('')
    setCoachAnalysis(null)
    setAnswers({})
    setEnrichedPrompt('')
    setAssumptions([])
    setEditingEnriched(false)
  }

  const isRunning = status === 'streaming'
  const isCoaching = status === 'coaching' || status === 'questions' || status === 'enriched'
  const scoreColor =
    (coachAnalysis?.completenessScore ?? 0) >= 0.7
      ? 'text-emerald-400'
      : (coachAnalysis?.completenessScore ?? 0) >= 0.4
        ? 'text-amber-400'
        : 'text-rose-400'
  const scoreBg =
    (coachAnalysis?.completenessScore ?? 0) >= 0.7
      ? 'bg-emerald-500/10 border-emerald-500/30'
      : (coachAnalysis?.completenessScore ?? 0) >= 0.4
        ? 'bg-amber-500/10 border-amber-500/30'
        : 'bg-rose-500/10 border-rose-500/30'

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.85))', border: '1px solid rgba(51,65,85,0.5)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(51,65,85,0.3), inset 0 1px 0 rgba(148,163,184,0.05)' }}>
      {/* Top accent gradient line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #f59e0b, #ef4444)', opacity: 0.8 }} />

      {/* Header */}
      <div className="px-6 py-5 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(51,65,85,0.4)', background: 'rgba(15,23,42,0.5)' }}>
        <div className="relative">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            ⌘
          </div>
          {isRunning && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900 animate-pulse" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-white font-bold text-base tracking-tight" style={{ letterSpacing: '-0.01em' }}>
            Global Command Interface
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Describe what to build → AI agents handle the rest
          </p>
        </div>

        {/* Status indicators */}
        {isRunning && (
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 text-xs font-medium">
              {currentAgent ? `${AGENT_ICONS[currentAgent] || '🤖'} ${currentAgent} running…` : 'Initializing…'}
            </span>
          </div>
        )}
        {status === 'coaching' && (
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-cyan-400 text-xs font-medium">🎯 Analyzing prompt…</span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* ============================================================ */}
        {/*  Prompt input                                                 */}
        {/* ============================================================ */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
              What do you want to build?
            </label>
            <span className="text-[10px] text-slate-600 font-mono">⌘ + Enter to submit</span>
          </div>
          <div className="relative group">
            <textarea
              className="w-full rounded-xl text-white text-sm p-4 pr-5 resize-none focus:outline-none transition-all duration-200 placeholder-slate-600"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(51,65,85,0.5)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                lineHeight: 1.6,
              }}
              rows={4}
              placeholder="e.g. Build a project management SaaS with Kanban boards, task assignments, team workspaces, due dates, and user auth…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isRunning || isCoaching}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
              }}
              onFocus={(e) => {
                (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(245,158,11,0.5)'
                ;(e.target as HTMLTextAreaElement).style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.2), 0 0 0 3px rgba(245,158,11,0.08)'
              }}
              onBlur={(e) => {
                (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(51,65,85,0.5)'
                ;(e.target as HTMLTextAreaElement).style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Project name + Mode selector — side by side                  */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Project name */}
          <div className="lg:col-span-1">
            <label className="block text-xs text-slate-400 mb-2.5 font-semibold uppercase tracking-widest">
              Project name <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg text-white text-sm px-4 py-3 focus:outline-none transition-all duration-200 placeholder-slate-600"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(51,65,85,0.5)',
              }}
              placeholder="My Awesome Project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isRunning || isCoaching}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(245,158,11,0.5)' }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(51,65,85,0.5)' }}
            />
          </div>

          {/* Mode selector */}
          <div className="lg:col-span-2">
            <label className="block text-xs text-slate-400 mb-2.5 font-semibold uppercase tracking-widest">
              Build mode
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {MODES.map((m) => {
                const active = mode === m.value
                return (
                  <button
                    key={m.value}
                    onClick={() => !isRunning && !isCoaching && setMode(m.value)}
                    disabled={isRunning || isCoaching}
                    className={`relative rounded-xl p-3 text-left transition-all duration-200 group ${isRunning || isCoaching ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    style={{
                      background: active
                        ? `linear-gradient(135deg, ${m.value === 'plan_only' ? 'rgba(59,130,246,0.12)' : m.value === 'plan_code' ? 'rgba(139,92,246,0.12)' : 'rgba(245,158,11,0.12)'}, transparent)`
                        : 'rgba(15,23,42,0.4)',
                      border: `1px solid ${active
                        ? m.value === 'plan_only' ? 'rgba(59,130,246,0.4)' : m.value === 'plan_code' ? 'rgba(139,92,246,0.4)' : 'rgba(245,158,11,0.4)'
                        : 'rgba(51,65,85,0.4)'}`,
                      boxShadow: active
                        ? `0 4px 12px ${m.value === 'plan_only' ? 'rgba(59,130,246,0.08)' : m.value === 'plan_code' ? 'rgba(139,92,246,0.08)' : 'rgba(245,158,11,0.08)'}`
                        : 'none',
                    }}
                  >
                    {active && (
                      <div style={{ position: 'absolute', top: 8, right: 10 }}>
                        <svg style={{ width: 14, height: 14, color: m.value === 'plan_only' ? '#60a5fa' : m.value === 'plan_code' ? '#a78bfa' : '#fbbf24' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm">{m.icon}</span>
                      <span className={`font-semibold text-xs ${active ? 'text-white' : 'text-slate-400'}`}>{m.label}</span>
                    </div>
                    <div className={`text-[11px] leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>{m.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Action bar — Coach toggle + Submit + Reset                   */}
        {/* ============================================================ */}
        <div className="flex items-center gap-3 pt-1">
          {/* Coach toggle — pill style */}
          <button
            onClick={() => !isRunning && !isCoaching && setCoachEnabled(!coachEnabled)}
            disabled={isRunning || isCoaching}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 ${isRunning || isCoaching ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            style={{
              background: coachEnabled ? 'rgba(6,182,212,0.1)' : 'rgba(15,23,42,0.4)',
              border: `1px solid ${coachEnabled ? 'rgba(6,182,212,0.35)' : 'rgba(51,65,85,0.4)'}`,
            }}
          >
            <div className="relative">
              <div
                className="w-7 h-4 rounded-full transition-colors duration-200"
                style={{ background: coachEnabled ? 'rgba(6,182,212,0.4)' : 'rgba(51,65,85,0.6)' }}
              >
                <div
                  className="w-3 h-3 rounded-full absolute top-0.5 transition-all duration-200"
                  style={{
                    background: coachEnabled ? '#06b6d4' : '#475569',
                    left: coachEnabled ? '14px' : '2px',
                    boxShadow: coachEnabled ? '0 0 8px rgba(6,182,212,0.5)' : 'none',
                  }}
                />
              </div>
            </div>
            <span className={coachEnabled ? 'text-cyan-300' : 'text-slate-500'}>
              🎯 Coach
            </span>
          </button>

          {/* Main submit button */}
          <button
            onClick={isRunning ? handleStop : handleSubmit}
            disabled={!isRunning && !prompt.trim()}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm transition-all duration-200"
            style={
              isRunning
                ? { background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', boxShadow: '0 4px 15px rgba(220,38,38,0.3)' }
                : status === 'coaching'
                  ? { background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#67e8f9', cursor: 'wait' }
                  : prompt.trim()
                    ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', boxShadow: '0 4px 15px rgba(245,158,11,0.25), 0 0 0 1px rgba(245,158,11,0.1)' }
                    : { background: 'rgba(30,41,59,0.5)', color: '#475569', cursor: 'not-allowed', border: '1px solid rgba(51,65,85,0.3)' }
            }
          >
            {isRunning
              ? '⏹ Stop Pipeline'
              : status === 'coaching'
                ? '🎯 Analyzing…'
                : coachEnabled
                  ? '🎯 Analyze & Build'
                  : '⌘ Run Pipeline'}
          </button>

          {/* Reset button */}
          {(status === 'done' || status === 'error') && (
            <button
              onClick={resetAll}
              className="px-5 py-3.5 rounded-xl text-sm font-medium text-slate-400 transition-all duration-200 hover:text-white"
              style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
            >
              ↺ New
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/*  COACH: Questions panel                                       */}
        {/* ============================================================ */}
        {status === 'questions' && coachAnalysis?.questions && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(15,23,42,0.8))', border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 8px 32px rgba(6,182,212,0.05)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(6,182,212,0.15)' }}>
                  🎯
                </div>
                <div>
                  <span className="text-cyan-300 font-bold text-sm">Prompt Coach</span>
                  <span className={`ml-3 text-xs font-mono px-2 py-0.5 rounded-full border ${scoreBg} ${scoreColor}`}>
                    {Math.round((coachAnalysis.completenessScore ?? 0) * 100)}% complete
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {coachAnalysis.detectedIntent}
              </span>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                A few quick questions to help the AI agents build exactly what you need:
              </p>

              {coachAnalysis.questions.map((q, idx) => (
                <div key={q.id}>
                  <label className="flex items-center gap-2 text-sm text-cyan-200 mb-2 font-medium">
                    <span className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)', color: '#67e8f9' }}>
                      {idx + 1}
                    </span>
                    {q.question}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg text-white text-sm px-4 py-2.5 focus:outline-none transition-all duration-200 placeholder-slate-600"
                    style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)' }}
                    placeholder={q.hint}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitAnswers()
                    }}
                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(6,182,212,0.5)' }}
                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(51,65,85,0.5)' }}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmitAnswers}
                  disabled={coachLoading}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', boxShadow: '0 4px 12px rgba(6,182,212,0.2)' }}
                >
                  {coachLoading ? '✨ Enriching…' : '✅ Submit Answers'}
                </button>
                <button
                  onClick={() => runPipeline(prompt.trim())}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-all"
                  style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
                >
                  Skip →
                </button>
                <button
                  onClick={() => { setStatus('idle'); setCoachAnalysis(null) }}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-all"
                  style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  COACH: Enriched prompt review                                */}
        {/* ============================================================ */}
        {status === 'enriched' && enrichedPrompt && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(15,23,42,0.8))', border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 8px 32px rgba(6,182,212,0.05)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(16,185,129,0.15)' }}>
                  ✨
                </div>
                <div>
                  <span className="text-emerald-300 font-bold text-sm">Enhanced Prompt</span>
                  {coachAnalysis && (
                    <span className={`ml-3 text-xs font-mono px-2 py-0.5 rounded-full border ${scoreBg} ${scoreColor}`}>
                      {Math.round((coachAnalysis.completenessScore ?? 0) * 100)}% → enriched
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditingEnriched(!editingEnriched)}
                className="text-xs text-slate-400 hover:text-cyan-300 transition-colors font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
              >
                {editingEnriched ? '👁 Preview' : '✏️ Edit'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editingEnriched ? (
                <textarea
                  className="w-full rounded-lg text-white text-sm p-4 resize-none focus:outline-none transition-all font-mono"
                  style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)', lineHeight: 1.6 }}
                  rows={12}
                  value={enrichedPrompt}
                  onChange={(e) => setEnrichedPrompt(e.target.value)}
                />
              ) : (
                <div className="rounded-lg p-4 max-h-64 overflow-y-auto" style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.3)' }}>
                  <pre className="text-slate-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {enrichedPrompt}
                  </pre>
                </div>
              )}

              {assumptions.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest font-semibold">Assumptions made</p>
                  <div className="flex flex-wrap gap-2">
                    {assumptions.map((a, i) => (
                      <span
                        key={i}
                        className="text-xs rounded-full px-3 py-1 font-medium"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleApproveEnriched}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', boxShadow: '0 4px 15px rgba(245,158,11,0.25)' }}
                >
                  ✅ Approve & Run Pipeline
                </button>
                <button
                  onClick={() => runPipeline(prompt.trim())}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-all"
                  style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
                >
                  Skip → Original
                </button>
                <button
                  onClick={() => { setStatus('idle'); setCoachAnalysis(null); setEnrichedPrompt('') }}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-all"
                  style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(51,65,85,0.4)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Execution log                                                */}
        {/* ============================================================ */}
        {logs.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(30,41,59,0.5)' }}>
            <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
              <div className="flex items-center gap-2">
                <svg style={{ width: 14, height: 14, color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Execution Log</span>
              </div>
              {isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              <span className="ml-auto text-[10px] text-slate-600 font-mono">{logs.length} events</span>
            </div>
            <div className="h-60 overflow-y-auto p-4 space-y-0.5 font-mono text-xs">
              {logs.map((entry, i) => (
                <div key={i} className="flex gap-3 leading-relaxed py-0.5">
                  <span className="text-slate-600 shrink-0 select-none">{entry.timestamp}</span>
                  <span
                    className={
                      entry.type === 'error'
                        ? 'text-rose-400'
                        : entry.type === 'done'
                          ? 'text-emerald-400 font-semibold'
                          : entry.type === 'phase'
                            ? 'text-amber-400'
                            : entry.type === 'agent_start'
                              ? (AGENT_COLORS[entry.agent ?? ''] ?? 'text-cyan-400')
                              : entry.type === 'agent_done'
                                ? 'text-emerald-300'
                                : entry.type === 'pr_created' || entry.type === 'plan_saved'
                                  ? 'text-emerald-400'
                                  : 'text-slate-300'
                    }
                  >
                    {entry.text}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Result card                                                  */}
        {/* ============================================================ */}
        {status === 'done' && result && (
          <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(15,23,42,0.6))', border: '1px solid rgba(16,185,129,0.2)', boxShadow: '0 8px 32px rgba(16,185,129,0.05)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(16,185,129,0.15)' }}>
                🎉
              </div>
              <span className="text-emerald-400 font-bold text-sm">Build Complete!</span>
            </div>
            <div className="space-y-2.5 pl-11">
              {result.projectId && (
                <a
                  href={`/projects/${result.projectId}`}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  📁 View project #{result.projectId}
                  <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              )}
              {result.planId && (
                <div className="text-slate-400 text-sm">💾 Agent Plan #{result.planId} saved</div>
              )}
              {result.prUrl && (
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  🔗 View PR on GitHub
                  <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Error display                                                */}
        {/* ============================================================ */}
        {status === 'error' && error && (
          <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(15,23,42,0.6))', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(239,68,68,0.15)' }}>
                ❌
              </div>
              <span className="text-rose-400 font-bold text-sm">Pipeline Error</span>
            </div>
            <p className="text-rose-300 text-sm font-mono break-all pl-11">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
