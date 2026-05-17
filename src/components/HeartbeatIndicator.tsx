'use client'
import React, { useState, useEffect } from 'react'

interface HeartbeatIndicatorProps {
  heartbeatAt: string
  status: string
}

export default function HeartbeatIndicator({ heartbeatAt, status }: HeartbeatIndicatorProps) {
  const [ageSeconds, setAgeSeconds] = useState(0)

  useEffect(() => {
    const update = () => {
      if (heartbeatAt) {
        const age = Math.round((Date.now() - new Date(heartbeatAt).getTime()) / 1000)
        setAgeSeconds(age)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [heartbeatAt])

  if (!['processing', 'stalled'].includes(status)) {
    return null
  }

  const isHealthy = ageSeconds < 60
  const isWarning = ageSeconds >= 60 && ageSeconds < 300
  const isCritical = ageSeconds >= 300

  const color = isHealthy ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444'
  const label = isHealthy ? 'Healthy' : isWarning ? 'Slow' : 'Stalled'

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      background: '#111827',
      border: `1px solid ${color}`,
      borderRadius: '12px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        animation: isHealthy ? 'pulse 2s infinite' : 'none',
      }} />
      <span style={{ color }}>♥ {label}</span>
      <span style={{ color: '#6b7280' }}>
        {ageSeconds < 60 ? `${ageSeconds}s ago` : `${Math.floor(ageSeconds / 60)}m ago`}
      </span>
    </div>
  )
}
