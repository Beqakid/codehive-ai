'use client'

import React from 'react'

interface Artifact {
  artifactId: string
  type: string
  r2Key: string
  sizeBytes: number
  mimeType: string
  createdAt?: string
}

interface ArtifactViewerProps {
  runId: string
  artifacts: Artifact[]
}

const typeIcon = (type: string) => {
  switch (type) {
    case 'build_log': return '🔨'
    case 'test_report': return '🧪'
    case 'lint_result': return '🔍'
    case 'diff': return '📝'
    case 'workspace_snapshot': return '📸'
    case 'self_heal_log': return '🔧'
    case 'pr_summary': return '📋'
    default: return '📦'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ArtifactViewer({ runId, artifacts }: ArtifactViewerProps) {
  return (
    <div style={{ background: '#0a0e17', borderRadius: 12, border: '1px solid #1e293b', padding: 20, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f59e0b' }}>📦 Artifacts</h3>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}</span>
      </div>

      {artifacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#6b7280', fontSize: 13 }}>No artifacts stored for this run</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {artifacts.map((art) => (
            <div key={art.artifactId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#111827', borderRadius: 6 }}>
              <span style={{ fontSize: 16 }}>{typeIcon(art.type)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0' }}>{art.type}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{art.r2Key}</div>
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatBytes(art.sizeBytes)}</span>
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{art.mimeType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
