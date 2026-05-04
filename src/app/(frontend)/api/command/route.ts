/**
 * @module command-route
 * @description POST /api/command — unified SSE endpoint for the full AI pipeline.
 * Authenticates user, creates DB records, then streams the pipeline based on mode:
 * plan_only → orchestrator, plan_code → + codegen, full_build → + sandbox.
 * Uses TransformStream for Cloudflare Workers SSE compatibility.
 * @note Rate limited to 5 commands per user per minute.
 * @note Codegen is GATED on plan approval — if reviewer says needs_revision, pipeline stops.
 * @note targetRepo body param selects which GitHub repo to push code to (defaults to codehive-sanbox).
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOrchestrator, type SSEEvent } from '@/agents/orchestrator'
import { runCodeOrchestrator } from '@/agents/codeOrchestrator'
import { runSandboxAgent } from '@/agents/sandboxAgent'

type Mode = 'plan_only' | 'plan_code' | 'full_build'

const MAX_COMMANDS_PER_MINUTE = 5
const MAX_LOG_LENGTH = 8000 // Truncate logs to avoid D1 column size issues

const DEFAULT_REPO_URL = 'https://github.com/Beqakid/codehive-sanbox'
const ALLOWED_REPO_URLS = [
  'https://github.com/Beqakid/codehive-sanbox',
  'https://github.com/Beqakid/viliniu',
  'https://github.com/Beqakid/gotocare',
]

interface CommandBody {
  prompt?: unknown
  mode?: unknown
  projectName?: unknown
  targetRepo?: unknown
}

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  // ── 1. Init Payload ──────────────────────────────────────────────────────
  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  } catch (err) {
    return Response.json({ error: `Payload init failed: ${String(err)}` }, { status: 500 })
  }

  // ── 2. Auth (wrapped — payload.auth can throw on Workers) ────────────────
  let user: { id: number } | null = null
  try {
    const authResult = await payload.auth({ headers: new Headers(request.headers) })
    user = (authResult?.user as { id: number } | null) ?? null
  } catch {
    // auth() threw — treat as unauthorized
  }
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2b. Rate limiting: max N commands per user per minute ────────────────
  try {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const recent = await payload.find({
      collection: 'commands',
      where: {
        submittedBy: { equals: user.id },
        createdAt: { greater_than: oneMinuteAgo },
      },
      limit: 0,
      overrideAccess: true,
    })
    if (recent.totalDocs >= MAX_COMMANDS_PER_MINUTE) {
      return Response.json(
        { error: `Rate limit exceeded — max ${MAX_COMMANDS_PER_MINUTE} commands per minute. Please wait.` },
        { status: 429 },
      )
    }
  } catch {
    // Rate-limit check failed — allow the request (fail open)
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

  // Validate targetRepo — only allow known repos (or fall back to default)
  const targetRepoUrl =
    typeof body.targetRepo === 'string' && ALLOWED_REPO_URLS.includes(body.targetRepo)
      ? body.targetRepo
      : DEFAULT_REPO_URL

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
        repoUrl: targetRepoUrl,
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

  // ── 5. Return SSE stream via TransformStream (idiomatic CF Workers pattern)
  //    Response is returned immediately; pipeline runs in background writing
  //    to the writable side. Errors become SSE error events, never HTTP 500.
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  // Fire-and-forget write — TransformStream buffers internally
  const send = (event: SSEEvent | { type: string; [key: string]: unknown }) => {
    try {
      void writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch {
      // writer already closed — ignore
    }
  }

  // Helper: safely update a Payload collection (swallows errors)
  const safeUpdate = async (collection: string, id: number, data: Record<string, unknown>) => {
    try {
      await payload.update({
        collection: collection as 'runs' | 'commands',
        id,
        overrideAccess: true,
        data,
      })
    } catch (err) {
      console.error(`[/api/command] Failed to update ${collection}#${id}:`, err)
    }
  }

  // Run pipeline in background — does NOT block the response
  void (async () => {
    const logEntries: string[] = []
    const log = (msg: string) => {
      logEntries.push(`[${new Date().toISOString()}] ${msg}`)
    }

    try {
      // First event gives the UI the record IDs
      send({ type: 'created', commandId, runId, codingRequestId, projectId })

      // Mark as running
      await safeUpdate('runs', runId, { status: 'running' })
      await safeUpdate('commands', commandId, { status: 'running' })

      // ── Phase A: Orchestrator (plan) ────────────────────────────────────
      let planId: number | undefined
      let prUrl: string | undefined
      let verdictApproved = false

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
        if (event.type === 'verdict') {
          verdictApproved = event.approved
          log(`Verdict: ${event.approved ? 'APPROVED' : 'NEEDS_REVISION'} (score: ${event.score ?? 'N/A'})`)
          if (!event.approved) {
            log(`Verdict reason: ${event.reason}`)
          }
        }
        if (event.type === 'chunk') {
          log(`[${event.agent}] ${event.text.slice(0, 80)}`)
        }
      })

      // ── Phase B: Code generation (GATED on approval) ──────────────────
      if (mode === 'plan_code' || mode === 'full_build') {
        if (!planId) throw new Error('No plan ID — cannot generate code without a plan')

        if (!verdictApproved) {
          // ⛔ PIPELINE GATE: Reviewer said needs revision — stop here
          send({
            type: 'phase',
            phase: 'codegen_blocked',
            message: '⛔ Code generation blocked — reviewer flagged this plan as needing revision. Approve the plan manually on the project page to proceed.',
          })
          log('Code generation BLOCKED — plan needs revision')
        } else {
          send({ type: 'phase', phase: 'codegen', message: '\u26a1 Starting code generation...' })
          log('Starting code generation')

          await runCodeOrchestrator(payload, planId, (event) => {
            send(event)
            if (event.type === 'chunk') log(`[codegen] ${(event as { text?: string }).text?.slice(0, 80) ?? ''}`)
            if (event.type === 'file_done') log(`Committed: ${(event as { file?: string }).file ?? ''}`)
          })

          // ── Phase C: Sandbox (only if codegen ran) ────────────────────
          if (mode === 'full_build') {
            if (!prUrl) throw new Error('No PR URL — cannot run sandbox without a PR')
            send({ type: 'phase', phase: 'sandbox', message: '\ud83e\uddea Triggering sandbox tests...' })
            log('Starting sandbox')

            // Parse PR URL → owner/repo + fetch branch name from GitHub PR API
            const repoMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
            const prNumMatch = prUrl.match(/\/pull\/(\d+)/)
            if (!repoMatch) throw new Error(`Could not parse PR URL: ${prUrl}`)

            const sbOwner = repoMatch[1]
            const sbRepo = repoMatch[2]
            let sbBranch = 'main'

            if (prNumMatch) {
              try {
                const prResp = await fetch(
                  `https://api.github.com/repos/${sbOwner}/${sbRepo}/pulls/${prNumMatch[1]}`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                      Accept: 'application/vnd.github.v3+json',
                      'User-Agent': 'codehive-ai/4.0',
                    },
                  },
                )
                if (prResp.ok) {
                  const prData = (await prResp.json()) as { head?: { ref?: string } }
                  sbBranch = prData.head?.ref ?? 'main'
                }
              } catch {
                // fallback to main
              }
            }

            await runSandboxAgent(sbOwner, sbRepo, sbBranch, (event) => {
              send(event)
              log(`[sandbox] ${JSON.stringify(event).slice(0, 100)}`)
            })
          }
        }
      }

      // ── Mark complete (best-effort — never blocks 'done' event) ───────
      const truncatedLogs = logEntries.join('\n').slice(0, MAX_LOG_LENGTH)
      await safeUpdate('runs', runId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        logs: truncatedLogs,
        planId: planId ?? null,
        prUrl: prUrl ?? null,
      })
      await safeUpdate('commands', commandId, { status: 'completed' })

      // Always send 'done' — DB update failures must not prevent this
      send({ type: 'done', planId, prUrl, projectId })
    } catch (err) {
      const errMsg = String(err)
      log(`ERROR: ${errMsg}`)

      // Best-effort failure status update
      const truncatedLogs = logEntries.join('\n').slice(0, MAX_LOG_LENGTH)
      await safeUpdate('runs', runId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        logs: truncatedLogs,
        error: errMsg.slice(0, 500),
      })
      await safeUpdate('commands', commandId, { status: 'failed' })

      send({ type: 'error', message: errMsg })
    } finally {
      try {
        await writer.close()
      } catch {
        // already closed
      }
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
