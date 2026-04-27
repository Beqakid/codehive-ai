/**
 * POST /api/command/stream
 *
 * SSE endpoint — runs the full pipeline based on mode:
 *   plan_only  → orchestrator (product + architect + reviewer + PR)
 *   plan_code  → orchestrator + code generation
 *   full_build → orchestrator + code generation + sandbox trigger
 *
 * Body: { commandId, runId, codingRequestId, mode }
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator, type SSEEvent } from '@/agents/orchestrator'
import { runCodeOrchestrator } from '@/agents/codeOrchestrator'
import { runSandboxAgent } from '@/agents/sandboxAgent'

type Mode = 'plan_only' | 'plan_code' | 'full_build'

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  let commandId: number
  let runId: number
  let codingRequestId: number
  let mode: Mode

  try {
    const body = (await request.json()) as {
      commandId?: unknown
      runId?: unknown
      codingRequestId?: unknown
      mode?: unknown
    }
    commandId = Number(body.commandId)
    runId = Number(body.runId)
    codingRequestId = Number(body.codingRequestId)
    mode = (['plan_only', 'plan_code', 'full_build'].includes(body.mode as string)
      ? body.mode
      : 'plan_only') as Mode

    if (!commandId || !runId || !codingRequestId) {
      return Response.json({ error: 'commandId, runId, codingRequestId are required' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const { user } = await payload.auth({ headers: new Headers(request.headers) })
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent | { type: string; [key: string]: unknown }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      // Mark run as running
      await payload.update({
        collection: 'runs',
        id: runId,
        data: { status: 'running', startedAt: new Date().toISOString() },
      })
      await payload.update({
        collection: 'commands',
        id: commandId,
        data: { status: 'running' },
      })

      const logEntries: string[] = []
      const log = (msg: string) => {
        logEntries.push(`[${new Date().toISOString()}] ${msg}`)
      }

      try {
        // ── Phase A: Always run the orchestrator (plan) ──
        let planId: number | undefined
        let prUrl: string | undefined

        await runOrchestrator(payload, codingRequestId, (event) => {
          send(event)
          if (event.type === 'plan_saved') {
            planId = event.planId
            log(`Plan saved: #${planId}`)
          }
          if (event.type === 'pr_created') {
            prUrl = event.url
            log(`PR created: ${prUrl}`)
          }
          if (event.type === 'chunk') {
            log(`[${event.agent}] ${event.text.slice(0, 80)}`)
          }
        })

        // ── Phase B: Code generation (plan_code | full_build) ──
        if (mode === 'plan_code' || mode === 'full_build') {
          if (!planId) throw new Error('No plan ID — cannot generate code without an approved plan')

          send({ type: 'phase', phase: 'codegen', message: '⚡ Starting code generation...' })
          log('Starting code generation')

          // runCodeOrchestrator takes (payload, planId, onEvent) — 3 args
          await runCodeOrchestrator(
            payload,
            planId,
            (event) => {
              send(event)
              if (event.type === 'chunk') log(`[codegen] ${event.text.slice(0, 80)}`)
              if (event.type === 'file_done') log(`Committed: ${event.file}`)
            },
          )
        }

        // ── Phase C: Sandbox (full_build only) ──
        if (mode === 'full_build') {
          if (!prUrl) throw new Error('No PR URL — cannot run sandbox without a PR')

          send({ type: 'phase', phase: 'sandbox', message: '🧪 Triggering sandbox tests...' })
          log('Starting sandbox')

          await runSandboxAgent(prUrl, (event) => {
            send(event)
            log(`[sandbox] ${JSON.stringify(event).slice(0, 100)}`)
          })
        }

        // Mark complete
        await payload.update({
          collection: 'runs',
          id: runId,
          data: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            logs: logEntries.join('\n'),
            planId: planId ?? null,
            prUrl: prUrl ?? null,
          },
        })
        await payload.update({
          collection: 'commands',
          id: commandId,
          data: { status: 'completed' },
        })

        send({ type: 'done', planId, prUrl })
      } catch (err) {
        const errMsg = String(err)
        log(`ERROR: ${errMsg}`)

        await payload.update({
          collection: 'runs',
          id: runId,
          data: {
            status: 'failed',
            completedAt: new Date().toISOString(),
            logs: logEntries.join('\n'),
            error: errMsg,
          },
        })
        await payload.update({
          collection: 'commands',
          id: commandId,
          data: { status: 'failed' },
        })

        send({ type: 'error', message: errMsg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
