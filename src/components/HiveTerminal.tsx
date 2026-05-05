'use client'

/**
 * HiveTerminal — CodeHive AI Command Center redesign
 *
 * 3-panel layout:
 *  LEFT  (240px) — project navigator, plan status, repo link
 *  CENTER (flex) — Project Manager chat (THE hero)
 *  RIGHT (320px) — AI brain stats, runners, plan history
 *
 * Both sidebars are collapsible. Chat always occupies remaining width and
 * fills the full height (calc(100vh - 52px) nav bar).
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { ProjectChatPanel } from './ProjectChatPanel'
import { CodeGenRunner } from './CodeGenRunner'
import { SandboxRunner } from './SandboxRunner'
import { FixRunner } from './FixRunner'
import { ChatFixPanel } from './ChatFixPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectDoc {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
}

interface AgentPlanDoc {
  id: number
  status: string
  verdictReason?: string | null
  reviewScore?: number | null
  finalPlan?: { prUrl?: string } | null
  createdAt?: string
}

interface HiveTerminalProps {
  project: ProjectDoc
  allProjects: ProjectDoc[]
  plans: AgentPlanDoc[]
  showFixChat: boolean
  fixAttemptCount: number
  latestErrorSummary: string
  memoryCount: number
  lessonsCount: number
}

// ─── Status config ────────────────────────────────────────────────────────────

function getStatusCfg(status: string) {
  const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    active:         { label: 'Active',         color: '#34d399', bg: 'rgba(16,185,129,0.12)',  dot: '#10b981' },
    planning:       { label: 'Planning',        color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  dot: '#f59e0b' },
    submitted:      { label: 'Submitted',       color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  dot: '#3b82f6' },
    approved:       { label: 'Approved',        color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#a855f7' },
    needs_revision: { label: 'Needs Revision',  color: '#fb923c', bg: 'rgba(249,115,22,0.12)',  dot: '#f97316' },
    draft:          { label: 'Draft',           color: '#94a3b8', bg: 'rgba(71,85,105,0.12)',   dot: '#475569' },
    rejected:       { label: 'Rejected',        color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#ef4444' },
    archived:       { label: 'Archived',        color: '#475569', bg: 'rgba(71,85,105,0.12)',   dot: '#334155' },
  }
  return map[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(30,41,59,0.5)', dot: '#475569' }
}

// ─── Shared mini-styles ────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: '0.6rem',
  color: '#334155',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 6,
}

const divider: React.CSSProperties = {
  borderTop: '1px solid rgba(20,40,80,0.5)',
  marginTop: 14,
  paddingTop: 14,
}

const iconBtn: React.CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  border: '1px solid rgba(30,58,95,0.5)',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#475569',
  fontSize: '0.85rem',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 9999,
      background: `${color}18`, border: `1px solid ${color}30`,
      fontSize: '0.68rem', color, fontWeight: 600,
    }}>
      {icon} {label}
    </span>
  )
}

function CollapsibleRunner({
  label, icon, accent, expanded, onToggle, children,
}: {
  label: string; icon: string; accent: string
  expanded: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderRadius: 9, border: `1px solid rgba(20,40,80,0.7)`, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          width: '100%', background: expanded ? `${accent}12` : 'rgba(10,16,30,0.7)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          color: expanded ? accent : '#64748b', fontSize: '0.78rem', fontWeight: 600,
          borderBottom: expanded ? `1px solid ${accent}25` : 'none',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{
          fontSize: '0.6rem', color: expanded ? accent : '#334155',
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▼</span>
      </button>
      {expanded && (
        <div style={{ padding: 10, background: 'rgba(7,13,26,0.9)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HiveTerminal({
  project,
  allProjects,
  plans,
  showFixChat,
  fixAttemptCount,
  latestErrorSummary,
  memoryCount,
  lessonsCount,
}: HiveTerminalProps) {
  const latestPlan = plans[0] ?? null
  const isApproved = latestPlan?.status === 'approved'
  const isNeedsRevision = latestPlan?.status === 'needs_revision'
  const latestPrUrl = latestPlan?.finalPlan?.prUrl ?? undefined

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  const cfg = getStatusCfg(project.status)
  const planCfg = latestPlan ? getStatusCfg(latestPlan.status) : null

  // ── Shared sidebar header style ──────────────────────────────────────────
  const sidebarStyle: React.CSSProperties = {
    flexShrink: 0,
    overflowY: 'auto',
    background: 'rgba(5,9,18,0.98)',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  }

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 52px)',
      overflow: 'hidden',
      background: '#050912',
      fontFamily: 'inherit',
    }}>

      {/* ══════════════════ LEFT SIDEBAR ══════════════════ */}
      {leftOpen && (
        <aside style={{ ...sidebarStyle, width: 240, borderRight: '1px solid rgba(20,40,80,0.55)' }}>

          {/* Sidebar header */}
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(20,40,80,0.4)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.62rem', color: '#1e3a5f', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Navigator</span>
            <button onClick={() => setLeftOpen(false)} style={iconBtn} title="Collapse sidebar">‹</button>
          </div>

          <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Project list */}
            <div style={{ marginBottom: 4 }}>
              <div style={sectionLabel}>📁 Projects</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {allProjects.map(p => {
                  const pCfg = getStatusCfg(p.status)
                  const isActive = p.id === project.id
                  return (
                    <a
                      key={p.id}
                      href={`/projects/${p.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '6px 8px', borderRadius: 7,
                        background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                        border: isActive ? '1px solid rgba(99,102,241,0.22)' : '1px solid transparent',
                        textDecoration: 'none',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: pCfg.dot, flexShrink: 0 }} />
                      <span style={{
                        fontSize: '0.76rem',
                        color: isActive ? '#c7d2fe' : '#4b5563',
                        fontWeight: isActive ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {p.name}
                      </span>
                    </a>
                  )
                })}
              </div>
              <Link href="/projects/new" style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 7, textDecoration: 'none',
                color: '#334155', fontSize: '0.74rem', marginTop: 2,
              }}>
                <span style={{ fontSize: '0.8rem' }}>＋</span> New Project
              </Link>
            </div>

            {/* Current plan */}
            <div style={divider}>
              <div style={sectionLabel}>📋 Current Plan</div>
              {latestPlan && planCfg ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.73rem', color: '#94a3b8', fontWeight: 600 }}>#{latestPlan.id}</span>
                    <span style={{
                      fontSize: '0.62rem', padding: '2px 6px', borderRadius: 9999,
                      background: planCfg.bg, color: planCfg.color,
                      fontWeight: 700, border: `1px solid ${planCfg.dot}40`,
                    }}>
                      {planCfg.label}
                    </span>
                    {latestPlan.reviewScore != null && (
                      <span style={{
                        fontSize: '0.64rem', fontWeight: 700,
                        color: latestPlan.reviewScore >= 7.5 ? '#34d399' : '#fb923c',
                      }}>
                        {latestPlan.reviewScore}/10
                      </span>
                    )}
                  </div>
                  {latestPrUrl && (
                    <a href={latestPrUrl} target="_blank" rel="noreferrer" style={{
                      fontSize: '0.72rem', color: '#60a5fa',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      🔗 View PR ↗
                    </a>
                  )}
                  {!isApproved && !isNeedsRevision && (
                    <form action={`/api/plans/${latestPlan.id}/approve`} method="POST">
                      <button type="submit" style={{
                        padding: '5px 0', width: '100%',
                        background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                        color: '#000', border: 'none', borderRadius: 6,
                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                      }}>
                        ✅ Approve Plan
                      </button>
                    </form>
                  )}
                  {isNeedsRevision && (
                    <form action={`/api/plans/${latestPlan.id}/approve`} method="POST">
                      <button type="submit" style={{
                        padding: '5px 0', width: '100%',
                        background: 'linear-gradient(135deg, #ea580c, #f97316)',
                        color: '#000', border: 'none', borderRadius: 6,
                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                      }}>
                        ⚡ Override & Approve
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.72rem', color: '#334155', padding: '4px 0' }}>
                  No plans yet.{' '}
                  <Link href="/dashboard" style={{ color: '#f59e0b', textDecoration: 'none' }}>Run pipeline ↗</Link>
                </div>
              )}
            </div>

            {/* Repository */}
            {project.repoUrl && (
              <div style={divider}>
                <div style={sectionLabel}>⎇ Repository</div>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '0.72rem', color: '#60a5fa',
                    textDecoration: 'none', display: 'block', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {project.repoUrl.replace('https://github.com/', '')} ↗
                </a>
              </div>
            )}

            {/* Description */}
            {project.description && (
              <div style={divider}>
                <div style={sectionLabel}>ℹ About</div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#4b5563', lineHeight: 1.55 }}>
                  {project.description}
                </p>
              </div>
            )}

          </div>
        </aside>
      )}

      {/* ══════════════════ CENTER: CHAT ══════════════════ */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minWidth: 0, position: 'relative',
      }}>

        {/* ── Slim top bar ───────────────────────────────────── */}
        <div style={{
          height: 44, flexShrink: 0,
          borderBottom: '1px solid rgba(20,40,80,0.5)',
          display: 'flex', alignItems: 'center',
          padding: '0 14px', gap: 10,
          background: 'rgba(5,9,18,0.92)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Left sidebar toggle */}
          {!leftOpen && (
            <button onClick={() => setLeftOpen(true)} style={iconBtn} title="Open navigator">›</button>
          )}

          {/* Rainbow accent dot → project name → status pill */}
          <div style={{
            width: 8, height: 8, borderRadius: 4,
            background: `radial-gradient(circle, ${cfg.dot}, ${cfg.dot}88)`,
            boxShadow: `0 0 6px ${cfg.dot}88`,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
            {project.name}
          </span>
          <span style={{
            fontSize: '0.64rem', padding: '2px 7px', borderRadius: 9999,
            background: cfg.bg, color: cfg.color,
            fontWeight: 700, border: `1px solid ${cfg.dot}40`,
          }}>
            {cfg.label}
          </span>
          {project.repoUrl && (
            <span style={{ fontSize: '0.7rem', color: '#334155' }}>
              ⎇ {project.repoUrl.replace('https://github.com/', '')}
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Rainbow accent line — the identity mark */}
          <div style={{
            width: 3, height: 18, borderRadius: 2,
            background: 'linear-gradient(to bottom, #6366f1, #8b5cf6, #06b6d4)',
          }} />

          {/* Pipeline shortcut */}
          <Link
            href="/dashboard"
            style={{
              fontSize: '0.72rem', color: '#64748b',
              textDecoration: 'none', padding: '4px 10px',
              borderRadius: 6, border: '1px solid rgba(30,58,95,0.5)',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 0.15s',
            }}
          >
            ⚡ Pipeline
          </Link>

          {/* Right sidebar toggle */}
          {!rightOpen && (
            <button onClick={() => setRightOpen(true)} style={iconBtn} title="Open control panel">‹</button>
          )}
        </div>

        {/* ── CHAT (fills all remaining height) ──────────────── */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ProjectChatPanel
            projectId={project.id}
            projectName={project.name}
            planId={latestPlan?.id ?? null}
            planStatus={latestPlan?.status ?? null}
            reviewScore={latestPlan?.reviewScore ?? null}
            prUrl={latestPrUrl ?? null}
            fixAttemptCount={fixAttemptCount}
            hasFailedFixes={showFixChat}
            mode="terminal"
          />
        </div>
      </main>

      {/* ══════════════════ RIGHT SIDEBAR ══════════════════ */}
      {rightOpen && (
        <aside style={{ ...sidebarStyle, width: 320, borderLeft: '1px solid rgba(20,40,80,0.55)' }}>

          {/* Sidebar header */}
          <div style={{
            padding: '10px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid rgba(20,40,80,0.4)', flexShrink: 0,
          }}>
            <button onClick={() => setRightOpen(false)} style={iconBtn} title="Collapse panel">›</button>
            <span style={{ fontSize: '0.62rem', color: '#1e3a5f', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Control Panel</span>
          </div>

          <div style={{ padding: '14px 14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── AI Brain stats ──────────────────────────────── */}
            <div>
              <div style={sectionLabel}>🧬 AI Brain</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <StatBadge icon="💾" label={`${memoryCount} memor${memoryCount === 1 ? 'y' : 'ies'}`} color="#34d399" />
                <StatBadge icon="📚" label={`${lessonsCount} lesson${lessonsCount === 1 ? '' : 's'}`} color="#818cf8" />
                {fixAttemptCount > 0 && (
                  <StatBadge
                    icon="🔧"
                    label={`${fixAttemptCount} fix${fixAttemptCount === 1 ? '' : 'es'}`}
                    color={showFixChat ? '#f87171' : '#475569'}
                  />
                )}
              </div>
            </div>

            {/* ── Runners (only when plan is approved) ───────────── */}
            {isApproved && latestPlan && (
              <div>
                <div style={sectionLabel}>🚀 Runners</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <CollapsibleRunner
                    label="Code Generation" icon="💻" accent="#6366f1"
                    expanded={!!expanded['codegen']} onToggle={() => toggle('codegen')}
                  >
                    <CodeGenRunner planId={latestPlan.id} prUrl={latestPrUrl} />
                  </CollapsibleRunner>

                  <CollapsibleRunner
                    label="Sandbox Tests" icon="🧪" accent="#06b6d4"
                    expanded={!!expanded['sandbox']} onToggle={() => toggle('sandbox')}
                  >
                    <SandboxRunner planId={latestPlan.id} />
                  </CollapsibleRunner>

                  <CollapsibleRunner
                    label="Fix Loop" icon="🔧" accent="#f59e0b"
                    expanded={!!expanded['fix']} onToggle={() => toggle('fix')}
                  >
                    <FixRunner planId={latestPlan.id} prUrl={latestPrUrl} />
                  </CollapsibleRunner>

                  {showFixChat && (
                    <CollapsibleRunner
                      label="Interactive Fix Chat" icon="💬" accent="#f87171"
                      expanded={!!expanded['fixchat']} onToggle={() => toggle('fixchat')}
                    >
                      <ChatFixPanel
                        planId={latestPlan.id}
                        projectName={project.name}
                        fixAttemptCount={fixAttemptCount}
                        latestError={latestErrorSummary}
                      />
                    </CollapsibleRunner>
                  )}
                </div>
              </div>
            )}

            {/* ── Needs Revision banner ──────────────────────────── */}
            {isNeedsRevision && latestPlan && (
              <div style={{
                background: 'rgba(249,115,22,0.06)',
                border: '1px solid rgba(249,115,22,0.25)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ color: '#fb923c', fontWeight: 700, fontSize: '0.82rem', marginBottom: 6 }}>
                  ⚠️ Reviewer flagged this plan
                </div>
                {latestPlan.reviewScore != null && (
                  <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginBottom: 6 }}>
                    Score: <strong style={{ color: '#fb923c' }}>{latestPlan.reviewScore}/10</strong> (threshold: 7.5)
                  </div>
                )}
                {latestPlan.verdictReason && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5, marginBottom: 10 }}>
                    {latestPlan.verdictReason.slice(0, 220)}{latestPlan.verdictReason.length > 220 ? '…' : ''}
                  </div>
                )}
                <form action={`/api/plans/${latestPlan.id}/approve`} method="POST">
                  <button type="submit" style={{
                    padding: '7px 0', width: '100%',
                    background: 'linear-gradient(135deg, #ea580c, #f97316)',
                    color: '#000', border: 'none', borderRadius: 7,
                    fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                  }}>
                    ⚡ Override & Approve
                  </button>
                </form>
              </div>
            )}

            {/* ── No plan / awaiting approval ────────────────────── */}
            {!latestPlan && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>🤖</div>
                <div style={{ color: '#4b5563', fontSize: '0.78rem', marginBottom: 12 }}>
                  No plans yet — run the AI pipeline to get started.
                </div>
                <Link href="/dashboard" style={{
                  display: 'inline-block', padding: '7px 16px',
                  background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                  color: '#000', borderRadius: 7,
                  fontSize: '0.76rem', fontWeight: 700, textDecoration: 'none',
                  boxShadow: '0 0 18px rgba(245,158,11,0.2)',
                }}>
                  ⚡ Run Pipeline
                </Link>
              </div>
            )}

            {!isApproved && !isNeedsRevision && latestPlan && (
              <div style={{
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.78rem', marginBottom: 8 }}>
                  ⏳ Awaiting approval
                </div>
                <div style={{ fontSize: '0.72rem', color: '#4b5563', marginBottom: 10, lineHeight: 1.5 }}>
                  Plan #{latestPlan.id} is in <strong style={{ color: '#94a3b8' }}>{latestPlan.status}</strong> state.
                  Approve to unlock runners.
                </div>
                <form action={`/api/plans/${latestPlan.id}/approve`} method="POST">
                  <button type="submit" style={{
                    padding: '7px 0', width: '100%',
                    background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                    color: '#000', border: 'none', borderRadius: 7,
                    fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                  }}>
                    ✅ Approve Plan
                  </button>
                </form>
              </div>
            )}

            {/* ── Plan history ─────────────────────────────────────── */}
            {plans.length > 0 && (
              <div>
                <div style={sectionLabel}>📋 Plan History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {plans.slice(0, 6).map(plan => {
                    const pCfg = getStatusCfg(plan.status)
                    return (
                      <div key={plan.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 0',
                        borderBottom: '1px solid rgba(20,40,80,0.3)',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: 3, background: pCfg.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.72rem', color: '#4b5563' }}>#{plan.id}</span>
                        <span style={{
                          fontSize: '0.62rem', padding: '1px 5px', borderRadius: 9999,
                          background: pCfg.bg, color: pCfg.color, fontWeight: 700,
                        }}>
                          {pCfg.label}
                        </span>
                        {plan.reviewScore != null && (
                          <span style={{
                            fontSize: '0.65rem', marginLeft: 'auto',
                            color: plan.reviewScore >= 7.5 ? '#34d399' : '#fb923c', fontWeight: 600,
                          }}>
                            {plan.reviewScore}/10
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        </aside>
      )}
    </div>
  )
}
