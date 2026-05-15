'use client'

import React, { useState } from 'react'

interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: { type: 'add' | 'remove' | 'context'; content: string; oldLineNumber?: number; newLineNumber?: number }[]
}

interface FileDiff {
  filePath: string
  operation: 'add' | 'modify'
  hunks: DiffHunk[]
  additions: number
  deletions: number
}

interface DiffSummary {
  totalFiles: number
  totalAdditions: number
  totalDeletions: number
  filesAdded: string[]
  filesModified: string[]
  diffs: FileDiff[]
}

interface Props {
  diffSummary: DiffSummary | null
  riskLevel?: string
  riskScore?: number
  protectedFileWarnings?: string[]
  testResults?: { step: string; status: string }[]
  rollbackNotes?: string
}

export default function DiffReviewPanel({ diffSummary, riskLevel, riskScore, protectedFileWarnings, testResults, rollbackNotes }: Props) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  if (!diffSummary) {
    return (
      <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e', color: '#a0a0b0' }}>
        <p>No diff data available.</p>
      </div>
    )
  }

  const toggleFile = (filePath: string) => {
    const next = new Set(expandedFiles)
    if (next.has(filePath)) next.delete(filePath)
    else next.add(filePath)
    setExpandedFiles(next)
  }

  const riskColor = riskLevel === 'LOW' ? '#00ff88' : riskLevel === 'MEDIUM' ? '#ffaa00' : riskLevel === 'HIGH' ? '#ff4444' : riskLevel === 'CRITICAL' ? '#ff0044' : '#888'

  return (
    <div style={{ padding: '24px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #1a1a2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: '#00ff88', margin: 0, fontSize: '18px', fontFamily: 'monospace' }}>📝 Diff Review</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#00ff88', fontFamily: 'monospace', fontSize: '13px' }}>+{diffSummary.totalAdditions}</span>
          <span style={{ color: '#ff4444', fontFamily: 'monospace', fontSize: '13px' }}>-{diffSummary.totalDeletions}</span>
          <span style={{ color: '#a0a0b0', fontFamily: 'monospace', fontSize: '13px' }}>{diffSummary.totalFiles} file(s)</span>
          {riskLevel && (
            <span style={{ color: riskColor, fontFamily: 'monospace', fontSize: '13px', padding: '2px 8px', border: `1px solid ${riskColor}`, borderRadius: '4px' }}>
              {riskLevel} {riskScore !== undefined ? `(${riskScore})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Protected file warnings */}
      {protectedFileWarnings && protectedFileWarnings.length > 0 && (
        <div style={{ background: '#1a1000', border: '1px solid #ffaa00', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ color: '#ffaa00', fontSize: '13px', fontFamily: 'monospace', marginBottom: '4px' }}>⚠️ Protected Files</div>
          {protectedFileWarnings.map((w, i) => (
            <div key={i} style={{ color: '#cc8800', fontSize: '12px', fontFamily: 'monospace' }}>{w}</div>
          ))}
        </div>
      )}

      {/* File list */}
      {diffSummary.diffs.map((diff) => {
        const expanded = expandedFiles.has(diff.filePath)
        return (
          <div key={diff.filePath} style={{ marginBottom: '12px', border: '1px solid #1a1a2e', borderRadius: '8px', overflow: 'hidden' }}>
            {/* File header */}
            <div
              onClick={() => toggleFile(diff.filePath)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#111122', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: diff.operation === 'add' ? '#00ff88' : '#00aaff', fontSize: '11px', fontFamily: 'monospace', padding: '1px 6px', border: `1px solid ${diff.operation === 'add' ? '#00ff88' : '#00aaff'}`, borderRadius: '3px' }}>
                  {diff.operation === 'add' ? 'NEW' : 'MOD'}
                </span>
                <span style={{ color: '#e0e0e0', fontSize: '13px', fontFamily: 'monospace' }}>{diff.filePath}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: '#00ff88', fontSize: '12px', fontFamily: 'monospace' }}>+{diff.additions}</span>
                <span style={{ color: '#ff4444', fontSize: '12px', fontFamily: 'monospace' }}>-{diff.deletions}</span>
                <span style={{ color: '#666', fontSize: '12px' }}>{expanded ? '▼' : '▶'}</span>
              </div>
            </div>

            {/* Diff hunks */}
            {expanded && (
              <div style={{ background: '#080810', padding: '0' }}>
                {diff.hunks.map((hunk, hi) => (
                  <div key={hi}>
                    <div style={{ color: '#6666aa', fontSize: '11px', fontFamily: 'monospace', padding: '4px 14px', background: '#0a0a1a' }}>
                      @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                    </div>
                    {hunk.lines.map((line, li) => (
                      <div
                        key={li}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          padding: '1px 14px',
                          background: line.type === 'add' ? '#002200' : line.type === 'remove' ? '#220000' : 'transparent',
                          color: line.type === 'add' ? '#00ff88' : line.type === 'remove' ? '#ff6666' : '#888',
                          borderLeft: line.type === 'add' ? '3px solid #00ff88' : line.type === 'remove' ? '3px solid #ff4444' : '3px solid transparent',
                          whiteSpace: 'pre',
                          overflowX: 'auto',
                        }}
                      >
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}{line.content}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Test results */}
      {testResults && testResults.length > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#0a0a14', borderRadius: '8px', border: '1px solid #1a1a2e' }}>
          <div style={{ color: '#00aaff', fontSize: '13px', fontFamily: 'monospace', marginBottom: '8px' }}>🧪 Test Results</div>
          {testResults.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', color: t.status === 'passed' ? '#00ff88' : '#ff4444', fontSize: '12px', fontFamily: 'monospace' }}>
              <span>{t.status === 'passed' ? '✅' : '❌'}</span>
              <span>{t.step}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rollback notes */}
      {rollbackNotes && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#0a0a14', borderRadius: '8px', border: '1px solid #1a1a2e' }}>
          <div style={{ color: '#aa88ff', fontSize: '13px', fontFamily: 'monospace', marginBottom: '4px' }}>🔄 Rollback Notes</div>
          <div style={{ color: '#a0a0b0', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{rollbackNotes}</div>
        </div>
      )}
    </div>
  )
}
