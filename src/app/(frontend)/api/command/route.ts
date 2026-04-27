/**
 * POST /api/command
 *
 * Unified SSE endpoint — authenticates user, creates all records,
 * then streams the full pipeline based on mode:
 *   plan_only  → orchestrator (product + architect + reviewer + PR)
 *   plan_code  → orchestrator + code generation
 *   full_build → orchestrator + code generation + sandbox trigger
 *
 * First SSE event: { type: 'created', commandId, runId, codingRequestId, projectId }
 * Auth failures return JSON 401/400 before the stream starts.
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator, type SSEEvent } from '@/agents/orchestrator'
import { runCodeOrchestrator } from '@/agents/codeOrchestrator'
import { runSandboxAgent } from '@/agents/sandboxAgent'

type Mode = 'plan_only' | 'plan_code' | 'full_build'

interface CommandBody {
  prompt?: unknown
  mode?: unknown
  projectName?: unknown
}

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  // ── 1. Init Payload (works fine here) ────────────────────────────────────
  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  } catch (err) {
    return Response.json({ error: `Payload init failed: ${String(err)}` }, { status: 500 })
  }

  // ── 2. Auth ───────────────────────────────────────────────────────────────
  const { user } = await payload.auth({ headers: new Headers(request.headers) })
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 3. Parse body ─────────────────────────────────────────────────────────
  let body: CommandBody
  try {
    body = (await request.json()) as CommandBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const mode: Mode = (['plan_only', 'plan_code', 'full_build'].includes(body.mode as string)
    ? body.mode
    : 'plan_only') as Mode
  const projectName =
    typeof body.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim()
      : `Command: ${prompt.slice(0, 40)}${prompt.length > 40 ? '\u2026' : ''}`

  if (!prompt) {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  // ── 4. Create all DB records BEFORE opening the stream ───────────────────
  let commandId: number
  let runId: number
  let codingRequestId: number
  let projectId: number

  try {
    const project = await payload.create({
      collection: 'projects',
      overrideAccess: true,
      data: {
        name: projectName,
        description: `Auto-created from global command interface on ${new Date().toUTCString()}`,
        status: 'active',
        owner: user.id,
        repoUrl: 'https://github.com/Beqakid/codehive-sanbox',
      },
    })

    const codingRequest = await payload.create({
      collection: 'coding-requests',
      overrideAccess: true,
      data: {
        title: projectName,
        description: prompt,
        project: project.id,
        requestedBy: user.id,
        status: 'submitted',
        priority: 'medium',
      },
    })

    const command = await payload.create({
      collection: 'commands',
      overrideAccess: true,
      data: {
        prompt,
        mode,
        status: 'pending',
        project: project.id,
        codingRequest: codingRequest.id,
        submittedBy: user.id,
      },
    })

    const run = await payload.create({
      collection: 'runs',
      overrideAccess: true,
      data: {
        command: command.id,
        status: 'pending',
        mode,
        startedAt: new Date().toISOString(),
      },
    })

    commandId = command.id
    runId = run.id
    codingRequestId = codingRequest.id
    projectId = project.id
  } catch (err) {
    console.error('[/api/command] Record creation failed:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }

  // ── 5. Return SSE stream ──────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent | { type: string; [key: string]: unknown }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      // First event gives the UI the IDs it needs
      send({ type: 'created', commandId, runId, codingRequestId, projectId })

      const logEntries: string[] = []
      const log = (msg: string) => {
        logEntries.push(`[${new Date().toISOString()}] ${msg}`)
      }

      // Mark as running
      try {
        await payload.update({
          collection: 'runs',
          id: runId,
          overrideAccess: true,
          data: { status: 'running' },
        })
        await payload.update({
          collection: 'commands',
          id: commandId,
          overrideAccess: true,
          data: { status: 'running' },
        })
      } catch (err) {
        send({ type: 'error', message: `DB status update failed: ${String(err)}` })
        controller.close()
        return
      }

      try {
        // ── Phase A: Orchestrator (plan) ──────────────────────────────────
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

        // ── Phase B: Code generation ──────────────────────────────────────
        if (mode === 'plan_code' || mode === 'full_build') {
          if (!planId) throw new Error('No plan ID — cannot generate code without an approved plan')
          send({ type: 'phase', phase: 'codegen', message: '\u26a1 Starting code generation...' })
          log('Starting code generation')

          await runCodeOrchestrator(payload, planId, (event) => {
            send(event)
            if (event.type === 'chunk') log(`[codegen] ${event.text.slice(0, 80)}`)
            if (event.type === 'file_done') log(`Committed: ${event.file}`)
          })
        }

        // ── Phase C: Sandbox ──────────────────────────────────────────────
        if (mode === 'full_build') {
          if (!prUrl) throw new Error('No PR URL — cannot run sandbox without a PR')
          send({ type: 'phase', phase: 'sandbox', message: '\U0001f9ea Triggering sandbox tests...' })
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
          overrideAccess: true,
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
          overrideAccess: true,
          data: { status: 'completed' },
        })

        send({ type: 'done', planId, prUrl, projectId })
      } catch (err) {
        const errMsg = String(err)
        log(`ERROR: ${errMsg}`)

        try {
          await payload.update({
            collection: 'runs',
            id: runId,
            overrideAccess: true,
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
            overrideAccess: true,
            data: { status: 'failed' },
          })
        } catch {
          // DB cleanup best-effort, ignore
        }

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
