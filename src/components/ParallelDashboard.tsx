'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'

interface Project {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
}

interface RunState {
  status: 'idle' | 'running' | 'done' | 'error'
  logs: string[]
  currentStep: string
  progress: number // 0-100
  planId?: number
  error?: string
}

const STEPS = ['Product Agent', 'Architect Agent', 'Reviewer Agent', 'Creating PR', 'Done']

const stepKeywords: Record<string, number> = {
  'product': 0,
  'architect': 1,
  'reviewer': 2,
  'pull request': 3,
  'pr created': 4,
  'complete': 4,
}

function detectStep(log: string): number {
  const lower = log.toLowerCase()
  for (const [kw, idx] of Object.entries(stepKeywords)) {
    if (lower.includes(kw)) return idx
  }
  return -1
}

function StepBadges({ currentStep, status }: { currentStep: number; status: RunState['status'] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
      {STEPS.map((label, i) => {
        const done = i < currentStep || (status === 'done' && i <= currentStep)
        const active = i === currentStep && status === 'running'
        return (
          <span
            key={label}
            style={{
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: 9999,
              fontWeight: 600,
              background: done ? '#dcfce7' : active ? '#fef9c3' : '#f3f4f6',
              color: done ? '#166534' : active ? '#713f12' : '#9ca3af',
              border: active ? '1px solid #fde047' : '1px solid transparent',
            }}
          >
            {active ? '⚡ ' : done ? '✅ ' : '○ '}
            {label}
          </span>
        )
      })}
    </div>
  )
}

function ProjectRunCard({
  project,
  selected,
  onToggle,
  run,
}: {
  project: Project
  selected: boolean
  onToggle: () => void
  run: RunState
}) {
  const logsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [run.logs])

  const borderColor =
    run.status === 'running'
      ? '#f59e0b'
      : run.status === 'done'
      ? '#10b981'
      : run.status === 'error'
      ? '#ef4444'
      : selected
      ? '#3b82f6'
      : '#e5e7eb'

  const statusBadge = {
    idle: { bg: '#f3f4f6', color: '#6b7280', label: 'Idle' },
    running: { bg: '#fef3c7', color: '#92400e', label: '⚡ Running' },
    done: { bg: '#dcfce7', color: '#166534', label: '✅ Done' },
    error: { bg: '#fee2e2', color: '#991b1b', label: '❌ Error' },
  }[run.status]

  return (
    <div
      style={{
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        padding: '1rem',
        background: '#fff',
        transition: 'border-color 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={run.status === 'running'}
            style={{ cursor: 'pointer', width: 16, height: 16 }}
          />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{project.name}</h3>
            {project.description && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.3 }}>
                {project.description.length > 80
                  ? project.description.substring(0, 80) + '...'
                  : project.description}
              </p>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: 9999,
            background: statusBadge.bg,
            color: statusBadge.color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Progress bar */}
      {run.status === 'running' && (
        <div style={{ background: '#f3f4f6', borderRadius: 9999, height: 4, overflow: 'hidden' }}>
          <div
            style={{
              background: '#f59e0b',
              height: '100%',
              width: `${run.progress}%`,
              transition: 'width 0.4s ease',
              borderRadius: 9999,
            }}
          />
        </div>
      )}

      {/* Step badges */}
      {run.status !== 'idle' && (
        <StepBadges currentStep={run.progress >= 100 ? 4 : Math.floor((run.progress / 100) * 4)} status={run.status} />
      )}

      {/* Log tail */}
      {run.logs.length > 0 && (
        <div
          ref={logsRef}
          style={{
            background: '#0f172a',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            maxHeight: 120,
            overflowY: 'auto',
            fontSize: '0.7rem',
            fontFamily: 'monospace',
            color: '#94a3b8',
            lineHeight: 1.5,
          }}
        >
          {run.logs.slice(-20).map((log, i) => (
            <div key={i} style={{ color: log.includes('error') || log.includes('Error') ? '#f87171' : '#94a3b8' }}>
              {log}
            </div>
          ))}
        </div>
      )}

      {/* View link */}
      {(run.status === 'done' || run.planId) && (
        <a
          href={`/projects/${project.id}`}
          style={{ fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}
        >
          View project →
        </a>
      )}

      {run.error && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#ef4444' }}>{run.error}</p>
      )}
    </div>
  )
}

export default function ParallelDashboard({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [runs, setRuns] = useState<Record<number, RunState>>({})
  const [prompt, setPrompt] = useState('Add user authentication with JWT tokens, login/logout, and protected routes')
  const abortRefs = useRef<Record<number, AbortController>>({})

  const updateRun = useCallback((id: number, patch: Partial<RunState>) => {
    setRuns((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }, [])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(projects.map((p) => p.id)))
  const selectNone = () => setSelected(new Set())

  const runProject = useCallback(
    async (project: Project) => {
      const ctrl = new AbortController()
      abortRefs.current[project.id] = ctrl

      updateRun(project.id, {
        status: 'running',
        logs: [`Starting agents for "${project.name}"...`],
        currentStep: 'Product Agent',
        progress: 5,
      })

      try {
        const res = await fetch('/api/agent-plan/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            prompt,
            repoUrl: project.repoUrl || 'https://github.com/Beqakid/codehive-sanbox',
          }),
          signal: ctrl.signal,
        })

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
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
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const msg = JSON.parse(raw)
              const text: string = msg.text || msg.content || msg.message || ''
              if (!text) continue

              const stepIdx = detectStep(text)
              setRuns((prev) => {
                const cur = prev[project.id] || { status: 'running', logs: [], currentStep: '', progress: 5 }
                const newProgress =
                  stepIdx >= 0
                    ? Math.max(cur.progress, Math.round((stepIdx / 4) * 100))
                    : Math.min(cur.progress + 1, 95)
                return {
                  ...prev,
                  [project.id]: {
                    ...cur,
                    logs: [...cur.logs, text].slice(-50),
                    currentStep: stepIdx >= 0 ? STEPS[stepIdx] : cur.currentStep,
                    progress: newProgress,
                    planId: msg.planId || cur.planId,
                  },
                }
              })
            } catch {}
          }
        }

        updateRun(project.id, { status: 'done', progress: 100 })
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return
        updateRun(project.id, {
          status: 'error',
          error: (err as Error).message,
        })
      }
    },
    [prompt, updateRun],
  )

  const runSelected = () => {
    const toRun = projects.filter((p) => selected.has(p.id) && runs[p.id]?.status !== 'running')
    toRun.forEach((p) => runProject(p))
  }

  const stopAll = () => {
    Object.values(abortRefs.current).forEach((c) => c.abort())
    setRuns((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (next[Number(id)].status === 'running') {
          next[Number(id)] = { ...next[Number(id)], status: 'idle' }
        }
      }
      return next
    })
  }

  const anyRunning = Object.values(runs).some((r) => r.status === 'running')
  const doneCount = Object.values(runs).filter((r) => r.status === 'done').length
  const runningCount = Object.values(runs).filter((r) => r.status === 'running').length

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.75rem' }}>⚡ Parallel Runs Dashboard</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          Run multiple AI agent pipelines simultaneously. Select projects → set the prompt → fire away.
        </p>
      </div>

      {/* Stats bar */}
      {anyRunning || doneCount > 0 ? (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          {runningCount > 0 && (
            <span style={{ color: '#d97706', fontWeight: 600, fontSize: '0.85rem' }}>
              ⚡ {runningCount} running
            </span>
          )}
          {doneCount > 0 && (
            <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.85rem' }}>
              ✅ {doneCount} completed
            </span>
          )}
        </div>
      ) : null}

      {/* Prompt input */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
          Coding Request (sent to all selected projects)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={anyRunning}
          rows={2}
          style={{
            width: '100%',
            padding: '0.625rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            opacity: anyRunning ? 0.6 : 1,
          }}
        />
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={selectAll} disabled={anyRunning} style={ghostBtn}>
          Select All
        </button>
        <button onClick={selectNone} disabled={anyRunning} style={ghostBtn}>
          Clear
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          {selected.size} of {projects.length} selected
        </span>
        {anyRunning ? (
          <button onClick={stopAll} style={{ ...actionBtn, background: '#ef4444' }}>
            ⏹ Stop All
          </button>
        ) : (
          <button
            onClick={runSelected}
            disabled={selected.size === 0}
            style={{ ...actionBtn, opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}
          >
            ▶ Run {selected.size > 0 ? `${selected.size} Selected` : 'Selected'}
          </button>
        )}
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <p style={{ color: '#6b7280', margin: 0 }}>No projects yet. <a href="/admin/collections/projects/create" style={{ color: '#3b82f6' }}>Create one</a></p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1rem',
          }}
        >
          {projects.map((p) => (
            <ProjectRunCard
              key={p.id}
              project={p}
              selected={selected.has(p.id)}
              onToggle={() => toggleSelect(p.id)}
              run={runs[p.id] || { status: 'idle', logs: [], currentStep: '', progress: 0 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  background: '#10b981',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  padding: '0.4rem 0.875rem',
  background: 'transparent',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.8rem',
  cursor: 'pointer',
}
