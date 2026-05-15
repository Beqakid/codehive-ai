'use client'

/**
 * /projects/[id]/plan/[runId]/page.tsx (client component)
 * Displays full plan markdown, log history, and PR/branch info for a run.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface LogEntry {
  id: string | number
  level: string
  event: string
  message: string
  createdAt: string
}

interface RunDetail {
  id: string | number
  status: string
  agentName: string
  runType: string
  branchName: string
  prUrl: string
  planMarkdown: string
  output: Record<string, unknown>
  durationMs: number
  errorMessage: string
  createdAt: string
  userRequest: string
}

const LEVEL_COLOR: Record<string, string> = {
  info: '#94a3b8',
  success: '#4ade80',
  warn: '#facc15',
  error: '#f87171',
  debug: '#818cf8',
}

function MarkdownRenderer({ markdown }: { markdown: string }) {
  // Simple markdown to HTML — headings, bold, italic, code, lists, blockquotes, tables
  const html = markdown
    .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:700;color:#f59e0b;margin:24px 0 12px">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:600;color:#e2e8f0;margin:20px 0 10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;color:#94a3b8;margin:16px 0 8px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:#94a3b8">$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px;color:#a5b4fc">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #f59e0b;margin:12px 0;padding:8px 16px;background:rgba(245,158,11,0.05);color:#94a3b8">$1</blockquote>')
    .replace(/^- \[ \] (.+)$/gm, '<div style="padding:4px 0;color:#94a3b8">☐ $1</div>')
    .replace(/^- \[x\] (.+)$/gm, '<div style="padding:4px 0;color:#4ade80">☑ $1</div>')
    .replace(/^- (.+)$/gm, '<div style="padding:3px 0;color:#94a3b8;padding-left:16px">• $1</div>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:16px 0"/>')
    .replace(/\n\n/g, '<br/>')

  return (
    <div
      style={{ lineHeight: '1.7', fontSize: '14px', color: '#94a3b8' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function RunDetailPage({
  projectId,
  runId,
}: {
  projectId: string
  runId: string
}) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'plan' | 'logs'>('plan')

  useEffect(() => {
    const load = async () => {
      try {
        const [runResp, logsResp] = await Promise.all([
          fetch(`/api/m1/runs/${runId}`),
          fetch(`/api/m1/runs/${runId}/logs`),
        ])
        const runData = (await runResp.json()) as { run?: RunDetail; error?: string }
        const logsData = (await logsResp.json()) as { logs?: LogEntry[]; error?: string }

        if (runData.error) throw new Error(runData.error)
        setRun(runData.run || null)
        setLogs(logsData.logs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load run')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [runId])

  const statusColor =
    run?.status === 'completed' ? '#4ade80' : run?.status === 'failed' ? '#f87171' : '#facc15'

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Loading run details...
      </div>
    )
  }

  if (error || !run) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f87171',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {error || 'Run not found'}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: '24px',
        maxWidth: '960px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          href={`/projects/${projectId}/plan`}
          style={{ color: '#f59e0b', textDecoration: 'none', fontSize: '14px' }}
        >
          ← Planning
        </Link>
        <span style={{ color: '#334155' }}>/</span>
        <span style={{ color: '#64748b', fontSize: '14px', fontFamily: 'monospace' }}>
          run #{runId}
        </span>
      </div>

      {/* Run Header */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#e2e8f0' }}>
              {(run.output as Record<string, unknown>)?.title as string || 'Planning Run'}
            </h1>
            {run.userRequest && (
              <p
                style={{
                  color: '#64748b',
                  margin: '8px 0 0',
                  fontSize: '14px',
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{run.userRequest.slice(0, 200)}&rdquo;
              </p>
            )}
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              background: `${statusColor}20`,
              border: `1px solid ${statusColor}50`,
              color: statusColor,
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'capitalize',
            }}
          >
            {run.status}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {run.prUrl && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: '8px',
                color: '#a5b4fc',
                fontSize: '13px',
                padding: '7px 16px',
                textDecoration: 'none',
              }}
            >
              🔀 Open Pull Request
            </a>
          )}
          {run.branchName && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '13px',
                padding: '7px 14px',
                fontFamily: 'monospace',
              }}
            >
              🌿 {run.branchName}
            </div>
          )}
          {run.durationMs && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '13px',
                padding: '7px 14px',
              }}
            >
              ⏱ {(run.durationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {run.errorMessage && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#fca5a5',
              fontSize: '13px',
            }}
          >
            ❌ {run.errorMessage}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '4px',
          alignSelf: 'flex-start',
        }}
      >
        {(['plan', 'logs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? 'rgba(245,158,11,0.15)' : 'transparent',
              border: activeTab === tab ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
              borderRadius: '8px',
              color: activeTab === tab ? '#f59e0b' : '#64748b',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab ? '600' : '400',
              padding: '8px 20px',
            }}
          >
            {tab === 'plan' ? '📄 Plan' : `🪵 Logs (${logs.length})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'plan' && run.planMarkdown && (
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            padding: '32px',
          }}
        >
          <MarkdownRenderer markdown={run.planMarkdown} />
        </div>
      )}

      {activeTab === 'plan' && !run.planMarkdown && (
        <div style={{ color: '#475569', textAlign: 'center', padding: '40px' }}>
          No plan document available for this run
        </div>
      )}

      {activeTab === 'logs' && (
        <div
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            padding: '20px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.7',
            maxHeight: '600px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {logs.length === 0 ? (
            <span style={{ color: '#475569' }}>No log entries found</span>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ color: LEVEL_COLOR[log.level] || '#94a3b8' }}>
                <span style={{ color: '#334155', marginRight: '10px' }}>
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
