'use client'
import React, { useState } from 'react'

interface RunControlPanelProps {
  runId: string
  status: string
  onAction?: (action: string, result: any) => void
}

export default function RunControlPanel({ runId, status, onAction }: RunControlPanelProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const performAction = async (action: 'resume' | 'cancel' | 'retry', stepName?: string) => {
    setLoading(action)
    setMessage(null)

    try {
      const url = `/api/m6/run/${runId}/${action}`
      const body = action === 'retry' && stepName ? JSON.stringify({ stepName }) : undefined

      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body,
      })

      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ ${data.message || `${action} successful`}`)
        onAction?.(action, data)
      } else {
        setMessage(`❌ ${data.error || `${action} failed`}`)
      }
    } catch (err: any) {
      setMessage(`❌ Network error: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  const canResume = ['failed', 'stalled'].includes(status)
  const canCancel = ['queued', 'processing', 'stalled'].includes(status)

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      background: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '16px',
    }}>
      <div style={{ fontSize: '12px', color: '#00ff41', marginBottom: '12px' }}>
        ▸ RUN CONTROLS
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {canResume && (
          <button
            onClick={() => performAction('resume')}
            disabled={!!loading}
            style={{
              padding: '8px 16px',
              background: loading === 'resume' ? '#1f2937' : '#052e16',
              border: '1px solid #10b981',
              borderRadius: '6px',
              color: '#10b981',
              fontSize: '12px',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading && loading !== 'resume' ? 0.5 : 1,
            }}
          >
            {loading === 'resume' ? '⟳ Resuming...' : '▶ Resume'}
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => performAction('cancel')}
            disabled={!!loading}
            style={{
              padding: '8px 16px',
              background: loading === 'cancel' ? '#1f2937' : '#2d0000',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#ef4444',
              fontSize: '12px',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading && loading !== 'cancel' ? 0.5 : 1,
            }}
          >
            {loading === 'cancel' ? '⟳ Cancelling...' : '■ Cancel'}
          </button>
        )}
      </div>

      {message && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          background: '#0a0e14',
          borderRadius: '4px',
          fontSize: '11px',
          color: message.startsWith('✅') ? '#10b981' : '#ef4444',
        }}>
          {message}
        </div>
      )}
    </div>
  )
}
