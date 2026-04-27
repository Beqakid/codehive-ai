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
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
      {STEPS.map((label, i) => {
        const done = i < currentStep || (status === 'done' && i <= currentStep)
        const active = i === currentStep && status === 'running'
        return (
          <span
            key={label}
            style={{
              fontSize: '0.62rem',
              padding: '2px 7px',
              borderRadius: 9999,
              fontWeight: 600,
              background: done
                ? 'rgba(16,185,129,0.15)'
                : active
                  ? 'rgba(245,158,11,0.15)'
                  : 'rgba(30,41,59,0.6)',
              color: done ? '#34d399' : active ? '#fbbf24' : '#475569',
              border: `1px solid ${done ? 'rgba(52,211,153,0.3)' : active ? 'rgba(251,191,36,0.4)' : 'rgba(30,58,95,0.4)'}`,
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
      ? '0 0 18px rgba(245,158,11,0.12)'
      : run.status === 'done'
        ? '0 0 18px rgba(52,211,153,0.08)'
        : 'none'

  const statusBadge = {
    idle: { bg: 'rgba(30,41,59,0.6)', color: '#475569', label: 'Idle', dot: '#475569' },
    running: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', label: 'Running', dot: '#f59e0b' },
    done: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Done', dot: '#10b981' },
    error: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', label: 'Error', dot: '#ef4444' },
  }[run.status]

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: '1.1rem',
        background: 'rgba(13,21,38,0.85)',
        backdropFilter: 'blur(10px)',
        boxShadow: glowColor,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={run.status === 'running'}
            style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#f59e0b' }}
          />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>{project.name}</h3>
            {project.description && (
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#475569', lineHeight: 1.4 }}>
                {project.description.length > 80
                  ? project.description.substring(0, 80) + '…'
                  : project.description}
              </p>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            padding: '3px 9px',
            borderRadius: 9999,
            background: statusBadge.bg,
            color: statusBadge.color,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${statusBadge.dot}40`,
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
          {statusBadge.label}
        </span>
      </div>

      {/* Progress bar */}
      {run.status === 'running' && (
        <div style={{ background: 'rgba(15,23,42,0.8)', borderRadius: 9999, height: 3, overflow: 'hidden' }}>
          <div
            style={{
              background: 'linear-gradient(to right, #f59e0b, #fb923c)',
              height: '100%',
              width: `${run.progress}%`,
              transition: 'width 0.4s ease',
              borderRadius: 9999,
              boxShadow: '0 0 6px rgba(245,158,11,0.6)',
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
            border: '1px solid rgba(30,58,95,0.5)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            maxHeight: 110,
            overflowY: 'auto',
            fontSize: '0.68rem',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            color: '#94a3b8',
            lineHeight: 1.6,
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
              <span style={{ color: '#334155', marginRight: 6 }}>›</span>
              {log}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        {(run.status === 'done' || run.planId) ? (
          <Link
            href={`/projects/${run.projectId ?? project.id}`}
            style={{ fontSize: '0.72rem', color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
          >
            View project →
          </Link>
        ) : (
          <div />
        )}
        {run.error && (
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#f87171' }}>{run.error}</p>
        )}
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
        background: 'rgba(13,21,38,0.75)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(30,58,95,0.7)',
        borderRadius: 16,
        padding: '1.75rem',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* Stats bar */}
      {(anyRunning || doneCount > 0) && (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.25rem',
            padding: '0.65rem 1rem',
            background: 'rgba(7,13,26,0.6)',
            borderRadius: 10,
            border: '1px solid rgba(30,58,95,0.5)',
            flexWrap: 'wrap',
          }}
        >
          {runningCount > 0 && (
            <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              {runningCount} running
            </span>
          )}
          {doneCount > 0 && (
            <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.8rem' }}>
              ✓ {doneCount} completed
            </span>
          )}
        </div>
      )}

      {/* Prompt input */}
      <div style={{ marginBottom: '1.1rem' }}>
        <label
          style={{
            display: 'block',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Coding request — sent to all selected projects
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={anyRunning}
          rows={2}
          style={{
            width: '100%',
            padding: '0.7rem 0.9rem',
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
        <span style={{ fontSize: '0.75rem', color: '#475569' }}>
          {selected.size} / {projects.length} selected
        </span>
        {anyRunning ? (
          <button
            onClick={stopAll}
            style={{
              ...darkActionBtn,
              background: 'rgba(239,68,68,0.15)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.4)',
            }}
          >
            ⏹ Stop All
          </button>
        ) : (
          <button
            onClick={runSelected}
            disabled={selected.size === 0}
            style={{
              ...darkActionBtn,
              opacity: selected.size === 0 ? 0.35 : 1,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
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
            borderRadius: 12,
            border: '1px dashed rgba(30,58,95,0.6)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🐝</div>
          <p style={{ color: '#475569', margin: '0 0 1rem', fontSize: '0.9rem' }}>No projects yet — start building</p>
          <Link
            href="/projects/new"
            style={{
              display: 'inline-block',
              padding: '0.5rem 1.25rem',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#000',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.85rem',
              textDecoration: 'none',
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
  )
}

const darkActionBtn: React.CSSProperties = {
  padding: '0.45rem 1.1rem',
  background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))',
  color: '#fbbf24',
  border: '1px solid rgba(245,158,11,0.4)',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const darkGhostBtn: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  background: 'rgba(30,41,59,0.5)',
  color: '#94a3b8',
  border: '1px solid rgba(30,58,95,0.6)',
  borderRadius: 8,
  fontSize: '0.78rem',
  cursor: 'pointer',
  transition: 'all 0.2s',
}
