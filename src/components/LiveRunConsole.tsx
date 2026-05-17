'use client'
import React, { useState, useEffect, useRef } from 'react'

interface RunEvent {
  id: string
  eventType: string
  stepName: string
  message: string
  data: any
  emittedAt: string
}

const eventColors: Record<string, string> = {
  run_started: '#10b981',
  run_completed: '#10b981',
  run_failed: '#ef4444',
  run_stalled: '#f97316',
  run_cancelled: '#6b7280',
  run_resumed: '#6366f1',
  step_started: '#f59e0b',
  step_completed: '#10b981',
  step_failed: '#ef4444',
  step_retry: '#f97316',
  heartbeat: '#374151',
}

export default function LiveRunConsole({ runId }: { runId: string }) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [connected, setConnected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSinceRef = useRef<string>('')

  useEffect(() => {
    let active = true

    const poll = async () => {
      while (active) {
        try {
          const sinceParam = lastSinceRef.current ? `&since=${encodeURIComponent(lastSinceRef.current)}` : ''
          const res = await fetch(`/api/m6/run/${runId}/events?limit=50${sinceParam}`)
          if (res.ok) {
            const data = await res.json()
            setConnected(true)
            if (data.events.length > 0) {
              setEvents((prev) => {
                const existingIds = new Set(prev.map((e) => e.id))
                const newEvents = data.events.filter((e: RunEvent) => !existingIds.has(e.id))
                return [...prev, ...newEvents]
              })
              lastSinceRef.current = data.events[data.events.length - 1].emittedAt
            }
          }
        } catch {
          setConnected(false)
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    poll()
    return () => { active = false }
  }, [runId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      background: '#0a0e14',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: '#111827',
        borderBottom: '1px solid #1f2937',
      }}>
        <span style={{ fontSize: '12px', color: '#00ff41' }}>▸ LIVE CONSOLE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: connected ? '#10b981' : '#ef4444',
          }} />
          <span style={{ fontSize: '10px', color: '#6b7280' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Events */}
      <div
        ref={scrollRef}
        style={{
          height: '300px',
          overflow: 'auto',
          padding: '8px 12px',
          fontSize: '11px',
        }}
      >
        {events.length === 0 && (
          <div style={{ color: '#6b7280', padding: '12px 0' }}>Waiting for events...</div>
        )}
        {events.map((event) => {
          const color = eventColors[event.eventType] || '#9ca3af'
          const time = event.emittedAt ? new Date(event.emittedAt).toLocaleTimeString() : ''
          return (
            <div key={event.id} style={{ padding: '2px 0', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#4b5563', minWidth: '75px' }}>{time}</span>
              <span style={{ color, minWidth: '100px' }}>[{event.eventType}]</span>
              <span style={{ color: '#d1d5db' }}>{event.message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
