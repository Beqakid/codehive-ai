'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

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
  progress: number
  planId?: number
  projectId?: number
  error?: string
}

const STEPS = ['Product Agent', 'Architect Agent', 'Reviewer Agent', 'Creating PR', 'Done']

const agentToStep: Record<string, number> = {
  product: 0,
  architect: 1,
  reviewer: 2,
}

function StepBadges({ currentStep, status }: { currentStep: number; status: RunState['status'] }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
      {STEPS.map((label, i) => {
        const done = i < currentStep || (status === 'done' && i <= currentStep)
        const active = i === currentStep && status === 'running'
        return (
          <span
            key={label}
            style={{
              fontSize: '0.62rem',
              padding: '3px 9px',
              borderRadius: 9999,
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: done
                ? 'rgba(16,185,129,0.14)'
                : active
                  ? 'rgba(245,158,11,0.14)'
                  : 'rgba(13,21,38,0.7)',
              color: done ? '#34d399' : active ? '#fbbf24' : '#64748b',
              border: `1px solid ${done ? 'rgba(52,211,153,0.35)' : active ? 'rgba(251,191,36,0.4)' : 'rgba(30,58,95,0.5)'}`,
              transition: 'all 0.25s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {active ? '⚡ ' : done ? '✓ ' : '○ '}
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
      ? 'rgba(245,158,11,0.6)'
      : run.status === 'done'
        ? 'rgba(52,211,153,0.5)'
        : run.status === 'error'
          ? 'rgba(239,68,68,0.5)'
          : selected
            ? 'rgba(96,165,250,0.5)'
            : 'rgba(30,58,95,0.7)'

  const glowColor =
    run.status === 'running'
      ? '0 0 24px rgba(245,158,11,0.12), 0 4px 20px rgba(0,0,0,0.3)'
      : run.status === 'done'
        ? '0 0 24px rgba(52,211,153,0.08), 0 4px 20px rgba(0,0,0,0.3)'
        : run.status === 'error'
          ? '0 0 24px rgba(239,68,68,0.08), 0 4px 20px rgba(0,0,0,0.3)'
          : '0 4px 20px rgba(0,0,0,0.3)'

  const accentGradient =
    run.status === 'running'
      ? 'linear-gradient(to right, #f59e0b, #fb923c)'
      : run.status === 'done'
        ? 'linear-gradient(to right, #10b981, #34d399)'
        : run.status === 'error'
          ? 'linear-gradient(to right, #ef4444, #f87171)'
          : selected
            ? 'linear-gradient(to right, #3b82f6, #60a5fa)'
            : 'linear-gradient(to right, rgba(30,58,95,0.5), rgba(30,58,95,0.3))'

  const statusBadge = {
    idle: { bg: 'rgba(30,41,59,0.6)', color: '#64748b', label: 'Idle', dot: '#475569' },
    running: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', label: 'Running', dot: '#f59e0b' },
    done: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Done', dot: '#10b981' },
    error: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', label: 'Error', dot: '#ef4444' },
  }[run.status]

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: 0,
        background: 'rgba(13,21,38,0.8)',
        backdropFilter: 'blur(14px)',
        boxShadow: glowColor,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          height: 2,
          background: accentGradient,
          width: '100%',
        }}
      />

      <div style={{ padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              disabled={run.status === 'running'}
              style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#f59e0b' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.85rem' }}>📂</span>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#f1f5f9' }}>{project.name}</h3>
              </div>
              {project.description && (
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                  {project.description.length > 80
                    ? project.description.substring(0, 80) + '…'
                    : project.description}
                </p>
              )}
            </div>
          </div>
          <span
            style={{
              fontSize: '0.66rem',
              padding: '3px 10px',
              borderRadius: 9999,
              background: statusBadge.bg,
              color: statusBadge.color,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: `1px solid ${statusBadge.dot}40`,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {run.status === 'running' && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: statusBadge.dot,
                  display: 'inline-block',
                  animation: 'pulse 1s infinite',
                }}
              />
            )}
            {run.status === 'done' && <span style={{ fontSize: '0.6rem' }}>✓</span>}
            {run.status === 'error' && <span style={{ fontSize: '0.6rem' }}>✕</span>}
            {statusBadge.label}
          </span>
        </div>

        {/* Progress bar */}
        {run.status === 'running' && (
          <div style={{ background: 'rgba(7,13,26,0.8)', borderRadius: 9999, height: 3, overflow: 'hidden' }}>
            <div
              style={{
                background: 'linear-gradient(to right, #f59e0b, #fb923c)',
                height: '100%',
                width: `${run.progress}%`,
                transition: 'width 0.4s ease',
                borderRadius: 9999,
                boxShadow: '0 0 8px rgba(245,158,11,0.6)',
              }}
            />
          </div>
        )}

        {/* Step badges */}
        {run.status !== 'idle' && (
          <StepBadges
            currentStep={run.progress >= 100 ? 4 : Math.floor((run.progress / 100) * 4)}
            status={run.status}
          />
        )}

        {/* Log tail */}
        {run.logs.length > 0 && (
          <div
            ref={logsRef}
            style={{
              background: 'rgba(2,6,23,0.9)',
              border: '1px solid rgba(30,58,95,0.4)',
              borderRadius: 10,
              padding: '0.55rem 0.8rem',
              maxHeight: 110,
              overflowY: 'auto',
              fontSize: '0.68rem',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              color: '#94a3b8',
              lineHeight: 1.7,
            }}
          >
            {run.logs.slice(-20).map((log, i) => (
              <div
                key={i}
                style={{
                  color:
                    log.toLowerCase().includes('error')
                      ? '#f87171'
                      : log.includes('✅') || log.includes('done')
                        ? '#34d399'
                        : '#94a3b8',
                }}
              >
                <span style={{ color: '#475569', marginRight: 6 }}>›</span>
                {log}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(30,58,95,0.3)' }}>
          {(run.status === 'done' || run.planId) ? (
            <Link
              href={`/projects/${run.projectId ?? project.id}`}
              style={{
                fontSize: '0.72rem',
                color: '#60a5fa',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              View project
              <span style={{ fontSize: '0.72rem' }}>→</span>
            </Link>
          ) : (
            <div />
          )}
          {run.error && (
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.65rem' }}>⚠</span>
              {run.error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ParallelDashboard({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [runs, setRuns] = useState<Record<number, RunState>>({})
  const [prompt, setPrompt] = useState(
    'Add user authentication with JWT tokens, login/logout, and protected routes',
  )
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
        logs: [`Starting agents for "${project.name}"…`],
        currentStep: 'Product Agent',
        progress: 5,
      })

      try {
        // Uses the unified /api/command SSE endpoint
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            prompt,
            mode: 'plan_only',
            projectName: project.name,
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
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as Record<string, unknown>

              switch (event.type) {
                case 'created':
                  updateRun(project.id, { projectId: event.projectId as number })
                  break

                case 'agent_start': {
                  const agent = String(event.agent ?? '')
                  const stepIdx = agentToStep[agent] ?? -1
                  setRuns((prev) => {
                    const cur = prev[project.id]
                    if (!cur) return prev
                    return {
                      ...prev,
                      [project.id]: {
                        ...cur,
                        logs: [...cur.logs, String(event.message ?? '')].slice(-50),
                        currentStep: stepIdx >= 0 ? STEPS[stepIdx] : cur.currentStep,
                        progress: stepIdx >= 0 ? Math.max(cur.progress, Math.round(((stepIdx + 0.5) / 4) * 100)) : cur.progress,
                      },
                    }
                  })
                  break
                }

                case 'agent_done': {
                  const agent = String(event.agent ?? '')
                  const stepIdx = agentToStep[agent] ?? -1
                  setRuns((prev) => {
                    const cur = prev[project.id]
                    if (!cur) return prev
                    return {
                      ...prev,
                      [project.id]: {
                        ...cur,
                        logs: [...cur.logs, `✅ ${agent} agent done`].slice(-50),
                        progress: stepIdx >= 0 ? Math.max(cur.progress, Math.round(((stepIdx + 1) / 4) * 100)) : cur.progress,
                      },
                    }
                  })
                  break
                }

                case 'pr_created':
                  setRuns((prev) => {
                    const cur = prev[project.id]
                    if (!cur) return prev
                    return {
                      ...prev,
                      [project.id]: {
                        ...cur,
                        logs: [...cur.logs, `🔗 PR created: ${event.url}`].slice(-50),
                        progress: Math.max(cur.progress, 90),
                      },
                    }
                  })
                  break

                case 'plan_saved':
                  updateRun(project.id, { planId: event.planId as number })
                  break

                case 'start':
                  setRuns((prev) => {
                    const cur = prev[project.id]
                    if (!cur) return prev
                    return {
                      ...prev,
                      [project.id]: {
                        ...cur,
                        logs: [...cur.logs, String(event.message ?? '')].slice(-50),
                      },
                    }
                  })
                  break

                case 'done':
                  updateRun(project.id, { status: 'done', progress: 100 })
                  break

                case 'error':
                  throw new Error(String(event.message ?? 'Unknown error'))
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.name !== 'SyntaxError') {
                throw parseErr
              }
            }
          }
        }

        setRuns((prev) => {
          const cur = prev[project.id]
          if (cur && cur.status === 'running') {
            return { ...prev, [project.id]: { ...cur, status: 'done', progress: 100 } }
          }
          return prev
        })
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return
        updateRun(project.id, { status: 'error', error: (err as Error).message })
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
    <div
      style={{
        background: 'rgba(13,21,38,0.8)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(30,58,95,0.7)',
        borderRadius: 16,
        padding: 0,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header section */}
      <div style={{ padding: '1.5rem 1.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
              border: '1px solid rgba(139,92,246,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
          >
            🚀
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
              Parallel Runner
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
              Run AI agents across multiple projects simultaneously
            </p>
          </div>
        </div>
      </div>

      {/* Rainbow accent line */}
      <div
        style={{
          height: 2,
          background: 'linear-gradient(to right, #3b82f6, #8b5cf6, #f59e0b, #ef4444)',
          margin: '0 0 0',
        }}
      />

      <div style={{ padding: '1.5rem 1.75rem' }}>
        {/* Stats bar */}
        {(anyRunning || doneCount > 0) && (
          <div
            style={{
              display: 'flex',
              gap: '1.25rem',
              marginBottom: '1.25rem',
              padding: '0.7rem 1rem',
              background: 'rgba(7,13,26,0.6)',
              borderRadius: 10,
              border: '1px solid rgba(30,58,95,0.5)',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {runningCount > 0 && (
              <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'inline-block',
                    boxShadow: '0 0 6px rgba(245,158,11,0.6)',
                    animation: 'pulse 1s infinite',
                  }}
                />
                {runningCount} running
              </span>
            )}
            {doneCount > 0 && (
              <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.7rem' }}>✓</span>
                {doneCount} completed
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: '#475569' }}>
              {selected.size} of {projects.length} selected
            </span>
          </div>
        )}

        {/* Prompt input */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))',
                border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.6rem',
              }}
            >
              💬
            </div>
            <label
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Coding Request
            </label>
            <span style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 500 }}>
              — sent to all selected projects
            </span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={anyRunning}
            rows={2}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: 10,
              border: '1px solid rgba(30,58,95,0.8)',
              background: 'rgba(7,13,26,0.7)',
              color: '#e2e8f0',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
              opacity: anyRunning ? 0.5 : 1,
              outline: 'none',
              lineHeight: 1.6,
              transition: 'border-color 0.2s',
            }}
          />
        </div>

        {/* Action bar */}
        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            onClick={selectAll}
            disabled={anyRunning}
            style={darkGhostBtn}
          >
            Select All
          </button>
          <button onClick={selectNone} disabled={anyRunning} style={darkGhostBtn}>
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
            {selected.size} / {projects.length} selected
          </span>
          {anyRunning ? (
            <button
              onClick={stopAll}
              style={{
                padding: '0.5rem 1.2rem',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2))',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 0 16px rgba(239,68,68,0.1)',
              }}
            >
              ⏹ Stop All
            </button>
          ) : (
            <button
              onClick={runSelected}
              disabled={selected.size === 0}
              style={{
                padding: '0.5rem 1.4rem',
                background: selected.size === 0
                  ? 'rgba(30,41,59,0.5)'
                  : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: selected.size === 0 ? '#475569' : '#000',
                border: selected.size === 0
                  ? '1px solid rgba(30,58,95,0.5)'
                  : '1px solid rgba(245,158,11,0.6)',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: selected.size === 0 ? 'none' : '0 0 20px rgba(245,158,11,0.2)',
                opacity: selected.size === 0 ? 0.6 : 1,
              }}
            >
              ▶ Run {selected.size > 0 ? `${selected.size} Selected` : 'Selected'}
            </button>
          )}
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 2rem',
              background: 'rgba(7,13,26,0.5)',
              borderRadius: 14,
              border: '1px dashed rgba(30,58,95,0.6)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🐝</div>
            <p style={{ color: '#94a3b8', margin: '0 0 0.3rem', fontSize: '0.95rem', fontWeight: 600 }}>
              No projects yet
            </p>
            <p style={{ color: '#475569', margin: '0 0 1.25rem', fontSize: '0.8rem' }}>
              Create your first project to start running AI agents
            </p>
            <Link
              href="/projects/new"
              style={{
                display: 'inline-block',
                padding: '0.55rem 1.5rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
                boxShadow: '0 0 20px rgba(245,158,11,0.2)',
                transition: 'all 0.2s',
              }}
            >
              + New Project
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1rem',
            }}
          >
            {projects.map((p) => (
              <ProjectRunCard
                key={p.id}
                project={p}
                selected={selected.has(p.id)}
                onToggle={() => toggleSelect(p.id)}
                run={
                  runs[p.id] || { status: 'idle', logs: [], currentStep: '', progress: 0 }
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const darkActionBtn: React.CSSProperties = {
  padding: '0.5rem 1.2rem',
  background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))',
  color: '#fbbf24',
  border: '1px solid rgba(245,158,11,0.4)',
  borderRadius: 10,
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const darkGhostBtn: React.CSSProperties = {
  padding: '0.45rem 0.95rem',
  background: 'rgba(13,21,38,0.7)',
  color: '#94a3b8',
  border: '1px solid rgba(30,58,95,0.6)',
  borderRadius: 10,
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
}
