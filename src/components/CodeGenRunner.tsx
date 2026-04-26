'use client'

/**
 * CodeGenRunner — Phase 3 live code generation UI
 *
 * Client component that connects to /api/generate-code/stream via SSE
 * and shows each file being generated in real time with a file-browser sidebar.
 */

import React, { useState, useRef } from 'react'

interface CodeGenRunnerProps {
  planId: number
  prUrl?: string
}

type CodeGenSSEEvent =
  | { type: 'start'; message: string }
  | { type: 'file_start'; file: string; index: number; total: number }
  | { type: 'chunk'; file: string; text: string }
  | { type: 'file_done'; file: string; committed: boolean }
  | { type: 'all_done'; filesCommitted: number }
  | { type: 'error'; message: string }

interface FileState {
  path: string
  status: 'pending' | 'generating' | 'committed' | 'failed'
  code: string
}

export function CodeGenRunner({ planId, prUrl }: CodeGenRunnerProps) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [statusLog, setStatusLog] = useState<string[]>([])
  const [files, setFiles] = useState<FileState[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [filesCommitted, setFilesCommitted] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) =>
    setStatusLog((prev) => {
      const next = [...prev, msg]
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return next
    })

  const run = async () => {
    setRunning(true)
    setDone(false)
    setErrors([])
    setStatusLog([])
    setFiles([])
    setActiveFile(null)
    setFilesCommitted(0)
    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/generate-code/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
        signal: abortRef.current.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as CodeGenSSEEvent

            if (event.type === 'start') {
              addLog(event.message)
            } else if (event.type === 'file_start') {
              addLog(`⚙️ [${event.index}/${event.total}] ${event.file}`)
              setActiveFile(event.file)
              setFiles((prev) => {
                if (prev.find((f) => f.path === event.file)) {
                  return prev.map((f) =>
                    f.path === event.file ? { ...f, status: 'generating', code: '' } : f,
                  )
                }
                return [...prev, { path: event.file, status: 'generating', code: '' }]
              })
            } else if (event.type === 'chunk') {
              setFiles((prev) =>
                prev.map((f) =>
                  f.path === event.file ? { ...f, code: f.code + event.text } : f,
                ),
              )
            } else if (event.type === 'file_done') {
              const ok = event.committed
              addLog(ok ? `✅ ${event.file}` : `❌ ${event.file} (failed)`)
              setFiles((prev) =>
                prev.map((f) =>
                  f.path === event.file
                    ? { ...f, status: ok ? 'committed' : 'failed' }
                    : f,
                ),
              )
              setActiveFile(null)
            } else if (event.type === 'all_done') {
              setFilesCommitted(event.filesCommitted)
              setDone(true)
              setRunning(false)
            } else if (event.type === 'error') {
              setErrors((prev) => [...prev, event.message])
              // non-fatal: keep running unless it's a hard stop
              if (!running) setRunning(false)
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrors((prev) => [...prev, String(err)])
      }
      setRunning(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    addLog('⏹ Stopped by user')
  }

  const hasOutput = files.length > 0
  const viewFile = activeFile ?? files[0]?.path ?? null
  const viewCode = files.find((f) => f.path === viewFile)?.code ?? ''

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem',
        background: '#f5f3ff',
        borderRadius: 8,
        border: '1px solid #ddd6fe',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.78rem',
          fontWeight: 700,
          color: '#6d28d9',
          marginBottom: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        ⚡ Phase 3 — Code Generation
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {!running && (
          <button onClick={run} style={btnStyle(done ? '#3b82f6' : '#7c3aed')}>
            {done ? '🔄 Re-generate Code' : '⚡ Generate Code'}
          </button>
        )}
        {running && (
          <>
            <button onClick={stop} style={btnStyle('#ef4444')}>
              ⏹ Stop
            </button>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              {activeFile
                ? `⚙️ Generating ${activeFile.split('/').pop()}...`
                : '⚙️ Working...'}
            </span>
          </>
        )}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.78rem', color: '#7c3aed', textDecoration: 'underline' }}
          >
            View PR →
          </a>
        )}
      </div>

      {/* Error banners */}
      {errors.map((e, i) => (
        <div
          key={i}
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            color: '#991b1b',
            fontSize: '0.78rem',
            marginBottom: '0.5rem',
          }}
        >
          {e}
        </div>
      ))}

      {/* Success banner */}
      {done && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 6,
            padding: '0.65rem 0.9rem',
            color: '#15803d',
            fontWeight: 600,
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
          }}
        >
          🎉 {filesCommitted} file{filesCommitted !== 1 ? 's' : ''} generated and committed to PR!
        </div>
      )}

      {/* Output panel */}
      {(statusLog.length > 0 || hasOutput) && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {/* Status log (terminal style) */}
          {statusLog.length > 0 && (
            <div
              style={{
                background: '#0f172a',
                padding: '0.75rem 1rem',
                maxHeight: 130,
                overflowY: 'auto',
                borderBottom: hasOutput ? '1px solid #1e293b' : 'none',
              }}
            >
              {statusLog.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.76rem',
                    color: '#c4b5fd',
                    lineHeight: 1.7,
                  }}
                >
                  {msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {/* File sidebar + code viewer */}
          {hasOutput && (
            <div style={{ display: 'flex', maxHeight: 420 }}>
              {/* Sidebar */}
              <div
                style={{
                  width: 190,
                  flexShrink: 0,
                  borderRight: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  overflowY: 'auto',
                }}
              >
                {files.map((f) => {
                  const icon =
                    f.status === 'committed'
                      ? '✅'
                      : f.status === 'failed'
                        ? '❌'
                        : f.status === 'generating'
                          ? '⚙️'
                          : '⏳'
                  const isActive = viewFile === f.path
                  return (
                    <div
                      key={f.path}
                      onClick={() => setActiveFile(f.path)}
                      title={f.path}
                      style={{
                        padding: '0.45rem 0.6rem',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        background: isActive ? '#ede9fe' : 'transparent',
                        borderBottom: '1px solid #f3f4f6',
                        color:
                          f.status === 'committed'
                            ? '#166534'
                            : f.status === 'failed'
                              ? '#991b1b'
                              : f.status === 'generating'
                                ? '#6d28d9'
                                : '#6b7280',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        lineHeight: 1.4,
                      }}
                    >
                      {icon} {f.path.split('/').pop()}
                      <div
                        style={{
                          fontSize: '0.62rem',
                          color: '#9ca3af',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.path}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Code viewer */}
              <div
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.75,
                  color: '#1e293b',
                  background: '#fafafa',
                }}
              >
                {viewFile
                  ? viewCode || '// Generating...'
                  : 'Select a file to view its code →'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '0.45rem 1.1rem',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    transition: 'opacity 0.15s',
  }
}
