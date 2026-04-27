'use client'

import React, { useState, useRef, useEffect } from 'react'

type Mode = 'plan_only' | 'plan_code' | 'full_build'
type RunStatus = 'idle' | 'streaming' | 'done' | 'error'

interface LogEntry {
  type: string
  text: string
  agent?: string
  timestamp: string
  phase?: string
  planId?: number
  prUrl?: string
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

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (entry: Omit<LogEntry, 'timestamp'>) => {
    setLogs((prev) => [...prev, { ...entry, timestamp: new Date().toLocaleTimeString() }])
  }

  const handleSubmit = async () => {
    if (!prompt.trim() || status === 'streaming') return

    setStatus('streaming')
    setLogs([])
    setResult(null)
    setError(null)
    setCurrentAgent(null)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Single request — returns SSE stream directly
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          prompt: prompt.trim(),
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

          // Parse SSE data — skip malformed lines instead of crashing
          let event: Record<string, unknown>
          try {
            event = JSON.parse(line.slice(6)) as Record<string, unknown>
          } catch {
            // Malformed SSE data — skip this event, don't crash the stream
            continue
          }

          // Process the parsed event
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
                // Aggregate only — no individual log lines for streaming tokens
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
            // Event handler error — log it but don't crash the stream
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

  const isRunning = status === 'streaming'

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
            disabled={isRunning}
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
            disabled={isRunning}
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
                onClick={() => !isRunning && setMode(m.value)}
                className={`border rounded-xl p-3 text-left transition-all ${
                  mode === m.value
                    ? m.color
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                } ${isRunning ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-xs mb-1">{m.label}</div>
                <div className="text-xs opacity-75 leading-tight">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit / Stop */}
        <div className="flex gap-3">
          <button
            onClick={isRunning ? handleStop : handleSubmit}
            disabled={!isRunning && !prompt.trim()}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              isRunning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : prompt.trim()
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isRunning ? '\u23f9 Stop' : '\u2318 Run Command'}
          </button>
          {(status === 'done' || status === 'error') && (
            <button
              onClick={() => {
                setStatus('idle')
                setLogs([])
                setResult(null)
                setError(null)
                setPrompt('')
                setProjectName('')
              }}
              className="px-4 py-3 rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 text-sm"
            >
              Reset
            </button>
          )}
        </div>

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
