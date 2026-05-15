'use client'

/**
 * RepoIntelligenceDashboard — M2 component
 * Displays repo architecture, tech stack, protected files, dependency summary,
 * env vars, routes, and auth system.
 * Uses full inline styles — Tailwind gets purged on CF Workers build.
 */

import { useState, useEffect } from 'react'
import type { ProtectedFile } from '../../lib/protectedFiles'
import { getProtectionBadge } from '../../lib/protectedFiles'
import type { CentralFile } from '../../lib/repoIntelligence'

interface IntelligenceData {
  owner: string
  repo: string
  frameworkSummary: string
  architectureSummary: string
  techStack: string[]
  importantFiles: string[]
  protectedAreas: string[]
  envVarsDetected: string[]
  routeStructure: string[]
  authSystem: string | null
  lastIndexedAt: string | number | null
}

interface RepoIntelligenceDashboardProps {
  projectId: string
  initialIntelligence?: IntelligenceData | null
  protectedFiles?: ProtectedFile[]
  centralFiles?: CentralFile[]
  stats?: {
    totalFiles: number
    highPriorityFiles: number
    dependencyEdges: number
    protectedFileCount: number
  }
}

type Tab = 'overview' | 'protected' | 'routes' | 'dependencies'

export function RepoIntelligenceDashboard({
  projectId: _projectId,
  initialIntelligence,
  protectedFiles = [],
  centralFiles = [],
  stats,
}: RepoIntelligenceDashboardProps) {
  const [intel, setIntel] = useState<IntelligenceData | null>(initialIntelligence ?? null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(!initialIntelligence)

  useEffect(() => {
    if (intel || !_projectId) return
    setLoading(true)
    fetch(`/api/m2/repo-intelligence/${_projectId}`)
      .then((r) => r.json())
      .then((data: { intelligence?: IntelligenceData }) => {
        if (data.intelligence) setIntel(data.intelligence as IntelligenceData)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [_projectId, intel])

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>
        🔬 Scanning repository intelligence…
      </div>
    )
  }

  if (!intel) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>
        No intelligence data available yet. Run a plan to index this repository.
      </div>
    )
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: '📋 Overview' },
    { id: 'protected', label: '🛡️ Protected', count: protectedFiles.length },
    { id: 'routes', label: '🗺️ Routes', count: intel.routeStructure.length },
    { id: 'dependencies', label: '🔗 Dependencies', count: centralFiles.length },
  ]

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: 14,
        overflow: 'hidden',
        fontFamily: 'monospace',
        color: '#e2e8f0',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(148, 163, 184, 0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
              🔬 Repo Intelligence — {intel.owner}/{intel.repo}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              {intel.frameworkSummary}
            </div>
          </div>
          {intel.authSystem && (
            <div
              style={{
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                background: 'rgba(99,102,241,0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.3)',
              }}
            >
              🔐 {intel.authSystem}
            </div>
          )}
        </div>

        {/* Stats bar */}
        {stats && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {[
              { label: 'Total Files', value: stats.totalFiles },
              { label: 'High Priority', value: stats.highPriorityFiles },
              { label: 'Dep. Edges', value: stats.dependencyEdges },
              { label: 'Protected', value: stats.protectedFileCount, warn: stats.protectedFileCount > 0 },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.warn ? '#fbbf24' : '#f1f5f9' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 8px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === tab.id ? '#93c5fd' : '#64748b',
              fontSize: 11,
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'monospace',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{ marginLeft: 5, padding: '1px 6px', background: 'rgba(59,130,246,0.2)', borderRadius: 10, fontSize: 10, color: '#93c5fd' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '16px 20px' }}>
        {/* Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Architecture</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{intel.architectureSummary}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tech Stack</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {intel.techStack.map((t) => (
                  <span key={t} style={{ padding: '3px 10px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, fontSize: 11, color: '#a5b4fc' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Protected Areas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {intel.protectedAreas.map((a) => (
                  <span key={a} style={{ padding: '3px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, fontSize: 11, color: '#fca5a5' }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
            {intel.envVarsDetected.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Env Vars Detected ({intel.envVarsDetected.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {intel.envVarsDetected.slice(0, 16).map((v) => (
                    <span key={v} style={{ padding: '2px 8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontSize: 10, color: '#fcd34d', letterSpacing: '0.03em' }}>
                      {v}
                    </span>
                  ))}
                  {intel.envVarsDetected.length > 16 && (
                    <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>+{intel.envVarsDetected.length - 16} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Protected files */}
        {activeTab === 'protected' && (
          <div>
            {protectedFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: '20px 0' }}>
                ✅ No protected files classified yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {protectedFiles.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: f.riskLevel === 'CRITICAL' ? 'rgba(124,58,237,0.07)' : 'rgba(239,68,68,0.06)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${f.riskLevel === 'CRITICAL' ? '#7c3aed' : f.riskLevel === 'HIGH' ? '#ef4444' : '#f59e0b'}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{f.path}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{f.reason}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: f.riskLevel === 'CRITICAL' ? 'rgba(124,58,237,0.2)' : f.riskLevel === 'HIGH' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                        color: f.riskLevel === 'CRITICAL' ? '#c4b5fd' : f.riskLevel === 'HIGH' ? '#fca5a5' : '#fcd34d',
                      }}>
                        {f.riskLevel}
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{getProtectionBadge(f.protectionType)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Routes */}
        {activeTab === 'routes' && (
          <div>
            {intel.routeStructure.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: '20px 0' }}>
                No routes detected
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {intel.routeStructure.map((route) => (
                  <div
                    key={route}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(59,130,246,0.06)',
                      borderRadius: 6,
                      borderLeft: '2px solid rgba(59,130,246,0.3)',
                      fontSize: 12,
                      color: '#93c5fd',
                      fontFamily: 'monospace',
                    }}
                  >
                    {route}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dependencies */}
        {activeTab === 'dependencies' && (
          <div>
            {centralFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: '20px 0' }}>
                No central files detected
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                  Central files are imported by many others — modifying them has high blast radius:
                </div>
                {centralFiles.map((f) => (
                  <div
                    key={f.filePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: f.isCritical ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${f.isCritical ? '#ef4444' : '#3b82f6'}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>{f.filePath}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {f.isCritical && (
                        <span style={{ fontSize: 10, color: '#fca5a5', fontWeight: 700 }}>CRITICAL</span>
                      )}
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: f.isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                        color: f.isCritical ? '#fca5a5' : '#93c5fd',
                      }}>
                        {f.inboundCount} deps
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
