'use client'

import React from 'react'

interface WorkspaceInfo {
  workspaceId: string
  status: string
  branchName: string
  provider: string
  repoOwner: string
  repoName: string
  durationMs?: number
}

interface SandboxStatusPanelProps {
  workspace: WorkspaceInfo
  patchesApplied: number
  executionSteps: number
  artifactsUploaded: number
}

const statusColor = (status: string) => {
  switch (status) {
    case 'ready': case 'completed': case 'destroyed': return '#22c55e'
    case 'creating': case 'patching': case 'executing': return '#f59e0b'
    case 'failed': case 'timed_out': case 'orphaned': return '#ef4444'
    default: return '#6b7280'
  }
}

export function SandboxStatusPanel({ workspace, patchesApplied, executionSteps, artifactsUploaded }: SandboxStatusPanelProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f59e0b' }}>🔒 Sandbox Status</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Workspace</div>
          <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{workspace.workspaceId.substring(0, 20)}...</div>
        </div>
        <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(workspace.status) }} />
            <span style={{ fontSize: 13, textTransform: 'uppercase', color: statusColor(workspace.status) }}>{workspace.status}</span>
          </div>
        </div>
        <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Provider</div>
          <div style={{ fontSize: 13 }}>{workspace.provider}</div>
        </div>
        <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Branch</div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{workspace.branchName}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <div style={{ flex: 1, padding: 10, background: '#111827', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{patchesApplied}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Patches Applied</div>
        </div>
        <div style={{ flex: 1, padding: 10, background: '#111827', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{executionSteps}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Steps Executed</div>
        </div>
        <div style={{ flex: 1, padding: 10, background: '#111827', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{artifactsUploaded}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Artifacts</div>
        </div>
      </div>
    </div>
  )
}
