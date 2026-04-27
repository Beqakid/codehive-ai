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

const MODES: { value: Mode; label: string; desc: string; color: string }[] = [
  {
    value: 'plan_only',
    label: '\ud83d\udccb Plan Only',
    desc: 'Run all 3 AI agents \u2192 generate plan + open PR',
    color: 'border-blue-500 bg-blue-500/10 text-blue-300',
  },
  {
    value: 'plan_code',
    label: '\u26a1 Plan + Code',
    desc: 'Plan + generate all implementation files',
    color: 'border-purple-500 bg-purple-500/10 text-purple-300',
  },
  {
    value: 'full_build',
    label: '\ud83d\ude80 Full Build',
    desc: 'Plan + code + run sandbox tests automatically',
    color: 'border-amber-500 bg-amber-500/10 text-amber-300',
  },
]

const AGENT_COLORS: Record<string, string> = {
  product: 'text-blue-400',
  architect: 'text-purple-400',
  reviewer: 'text-green-400',
  codegen: 'text-amber-400',
  sandbox: 'text-pink-400',
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
      // Coach failed — fall through to pipeline with original prompt
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
      // Fall through with original prompt
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
    // Clear coach state
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
                  text: `\u2705 Created project #${event.projectId} + coding request #${event.codingRequestId}`,
                })
                addLog({
                  type: 'start',
                  text: `\ud83d\udd0c Starting ${mode.replace('_', ' ')} pipeline...`,
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
                  text: `\u2705 ${event.agent} agent done`,
                  agent: String(event.agent ?? ''),
                })
                setCurrentAgent(null)
                break
              case 'chunk':
                break
              case 'github_context':
                addLog({ type: 'github_context', text: `\ud83d\udcc2 Loaded ${event.files} repo files` })
                break
              case 'pr_created':
                addLog({ type: 'pr_created', text: `\ud83d\udd17 PR created: ${event.url}` })
                break
              case 'plan_saved':
                addLog({ type: 'plan_saved', text: `\ud83d\udcbe Plan #${event.planId} saved` })
                break
              case 'file_done':
                addLog({ type: 'file_committed', text: `\ud83d\udcc4 Committed: ${event.file}` })
                break
              case 'sandbox_step':
                addLog({ type: 'sandbox_step', text: `\ud83e\uddea ${event.step}: ${event.status}` })
                break
              case 'codegen_blocked':
                addLog({ type: 'error', text: `\u26a0\ufe0f Code generation blocked — reviewer requested revisions` })
                break
              case 'done':
                setResult({
                  planId: event.planId as number | undefined,
                  prUrl: event.prUrl as string | undefined,
                  projectId: currentProjectId,
                })
                setStatus('done')
                streamDone = true
                addLog({ type: 'done', text: '\ud83c\udf89 Pipeline complete!' })
                break
              case 'error':
                setError(String(event.message ?? 'Unknown error'))
                setStatus('error')
                streamDone = true
                addLog({ type: 'error', text: `\u274c ${event.message ?? 'Unknown error'}` })
                break
            }
          } catch (handlerErr) {
            addLog({ type: 'error', text: `\u274c Event handler error: ${String(handlerErr)}` })
          }
        }
      }

      if (!streamDone) {
        setStatus('done')
        addLog({ type: 'done', text: '\ud83c\udf89 Stream ended' })
      }
    } catch (err) {
      if (String(err).includes('AbortError') || String(err).includes('abort')) return
      const msg = String(err)
      setError(msg)
      setStatus('error')
      addLog({ type: 'error', text: `\u274c ${msg}` })
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStatus('idle')
    addLog({ type: 'start', text: '\u23f9 Stopped by user' })
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
      ? 'text-green-400'
      : (coachAnalysis?.completenessScore ?? 0) >= 0.4
        ? 'text-yellow-400'
        : 'text-red-400'

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-sm">
          \u2318
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm">Global Command Interface</h2>
          <p className="text-gray-400 text-xs">Type a prompt \u2192 AI agents build it end-to-end</p>
        </div>
        {isRunning && (
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-mono">
              {currentAgent ? `${currentAgent} agent running\u2026` : 'initializing\u2026'}
            </span>
          </div>
        )}
        {status === 'coaching' && (
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-400 text-xs font-mono">analyzing prompt\u2026</span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Prompt input */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
            What do you want to build?
          </label>
          <textarea
            className="w-full bg-gray-800 border border-gray-600 rounded-xl text-white text-sm p-4 resize-none focus:outline-none focus:border-yellow-500 transition-colors placeholder-gray-500"
            rows={4}
            placeholder="e.g. Add user authentication with JWT tokens, refresh token rotation, and rate limiting\u2026"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning || isCoaching}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
            }}
          />
          <p className="text-xs text-gray-600 mt-1">\u2318 + Enter to submit</p>
        </div>

        {/* Optional project name */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
            Project name{' '}
            <span className="text-gray-600">(optional \u2014 auto-generated if blank)</span>
          </label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg text-white text-sm px-4 py-2.5 focus:outline-none focus:border-yellow-500 transition-colors placeholder-gray-500"
            placeholder="My Awesome Feature"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={isRunning || isCoaching}
          />
        </div>

        {/* Mode selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
            Build mode
          </label>
          <div className="grid grid-cols-3 gap-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => !isRunning && !isCoaching && setMode(m.value)}
                className={`border rounded-xl p-3 text-left transition-all ${
                  mode === m.value
                    ? m.color
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                } ${isRunning || isCoaching ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-xs mb-1">{m.label}</div>
                <div className="text-xs opacity-75 leading-tight">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit / Stop / Coach toggle */}
        <div className="flex gap-3 items-center">
          {/* Coach toggle */}
          <button
            onClick={() => !isRunning && !isCoaching && setCoachEnabled(!coachEnabled)}
            disabled={isRunning || isCoaching}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
              coachEnabled
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-gray-700 bg-gray-800 text-gray-500'
            } ${isRunning || isCoaching ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <span className={`w-2 h-2 rounded-full ${coachEnabled ? 'bg-cyan-400' : 'bg-gray-600'}`} />
            \ud83c\udfaf Coach
          </button>

          <button
            onClick={isRunning ? handleStop : handleSubmit}
            disabled={!isRunning && !prompt.trim()}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              isRunning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : status === 'coaching'
                  ? 'bg-cyan-600 text-white cursor-wait'
                  : prompt.trim()
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isRunning
              ? '\u23f9 Stop'
              : status === 'coaching'
                ? '\ud83c\udfaf Analyzing prompt\u2026'
                : coachEnabled
                  ? '\ud83c\udfaf Analyze & Run'
                  : '\u2318 Run Command'}
          </button>

          {(status === 'done' || status === 'error') && (
            <button
              onClick={resetAll}
              className="px-4 py-3 rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 text-sm"
            >
              Reset
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/*  COACH: Questions panel                                       */}
        {/* ============================================================ */}
        {status === 'questions' && coachAnalysis?.questions && (
          <div className="bg-cyan-950/30 border border-cyan-700/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-cyan-700/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">\ud83c\udfaf</span>
                <span className="text-cyan-300 font-semibold text-sm">Prompt Coach</span>
                <span className={`text-xs font-mono ${scoreColor}`}>
                  {Math.round((coachAnalysis.completenessScore ?? 0) * 100)}% complete
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {coachAnalysis.detectedIntent}
              </span>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-gray-300 text-sm">
                Your prompt needs a bit more detail. Answer these questions so the AI agents can build exactly what you want:
              </p>

              {coachAnalysis.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm text-cyan-200 mb-1.5 font-medium">{q.question}</label>
                  <input
                    type="text"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg text-white text-sm px-4 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors placeholder-gray-500"
                    placeholder={q.hint}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitAnswers()
                    }}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSubmitAnswers}
                  disabled={coachLoading}
                  className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {coachLoading ? 'Enriching\u2026' : '\u2705 Submit Answers'}
                </button>
                <button
                  onClick={() => runPipeline(prompt.trim())}
                  className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 text-sm transition-all"
                >
                  Skip \u2192 Run directly
                </button>
                <button
                  onClick={() => { setStatus('idle'); setCoachAnalysis(null) }}
                  className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 text-sm transition-all"
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
          <div className="bg-cyan-950/30 border border-cyan-700/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-cyan-700/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">\ud83c\udfaf</span>
                <span className="text-cyan-300 font-semibold text-sm">Enhanced Prompt</span>
                {coachAnalysis && (
                  <span className={`text-xs font-mono ${scoreColor}`}>
                    {Math.round((coachAnalysis.completenessScore ?? 0) * 100)}% \u2192 enriched
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditingEnriched(!editingEnriched)}
                className="text-xs text-gray-400 hover:text-cyan-300 transition-colors"
              >
                {editingEnriched ? '\ud83d\udc41 Preview' : '\u270f\ufe0f Edit'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editingEnriched ? (
                <textarea
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg text-white text-sm p-4 resize-none focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                  rows={12}
                  value={enrichedPrompt}
                  onChange={(e) => setEnrichedPrompt(e.target.value)}
                />
              ) : (
                <div className="bg-gray-800/60 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <pre className="text-gray-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {enrichedPrompt}
                  </pre>
                </div>
              )}

              {/* Assumptions badges */}
              {assumptions.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Assumptions made:</p>
                  <div className="flex flex-wrap gap-2">
                    {assumptions.map((a, i) => (
                      <span
                        key={i}
                        className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 rounded-full px-3 py-1"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleApproveEnriched}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold text-sm transition-all"
                >
                  \u2705 Approve & Run Pipeline
                </button>
                <button
                  onClick={() => runPipeline(prompt.trim())}
                  className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 text-sm transition-all"
                >
                  Skip \u2192 Use original
                </button>
                <button
                  onClick={() => { setStatus('idle'); setCoachAnalysis(null); setEnrichedPrompt('') }}
                  className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 text-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live log panel */}
        {logs.length > 0 && (
          <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">EXECUTION LOG</span>
              {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <div className="h-56 overflow-y-auto p-4 space-y-1 font-mono text-xs">
              {logs.map((entry, i) => (
                <div key={i} className="flex gap-3 leading-relaxed">
                  <span className="text-gray-600 shrink-0">{entry.timestamp}</span>
                  <span
                    className={
                      entry.type === 'error'
                        ? 'text-red-400'
                        : entry.type === 'done'
                          ? 'text-green-400'
                          : entry.type === 'phase'
                            ? 'text-yellow-400'
                            : entry.type === 'agent_start'
                              ? (AGENT_COLORS[entry.agent ?? ''] ?? 'text-cyan-400')
                              : entry.type === 'agent_done'
                                ? 'text-green-300'
                                : entry.type === 'pr_created' || entry.type === 'plan_saved'
                                  ? 'text-emerald-400'
                                  : 'text-gray-300'
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

        {/* Result card */}
        {status === 'done' && result && (
          <div className="bg-green-950/40 border border-green-700/50 rounded-xl p-4">
            <div className="text-green-400 font-semibold text-sm mb-3">\ud83c\udf89 Build Complete!</div>
            <div className="space-y-2">
              {result.projectId && (
                <a
                  href={`/projects/${result.projectId}`}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  \ud83d\udcc1 View project #{result.projectId}
                </a>
              )}
              {result.planId && (
                <div className="text-gray-400 text-sm">\ud83d\udcbe Agent Plan #{result.planId} saved</div>
              )}
              {result.prUrl && (
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  \ud83d\udd17 View PR on GitHub \u2197
                </a>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div className="bg-red-950/40 border border-red-700/50 rounded-xl p-4 text-red-400 text-sm font-mono break-all">
            \u274c {error}
          </div>
        )}
      </div>
    </div>
  )
}
