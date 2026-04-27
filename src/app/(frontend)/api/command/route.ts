/**
 * POST /api/command
 *
 * Global command endpoint. Accepts a prompt + mode, then:
 * 1. Authenticates the user
 * 2. Auto-creates a Project + CodingRequest
 * 3. Creates a Command record
 * 4. Creates a Run record
 * 5. Returns { commandId, runId, codingRequestId, projectId }
 *    — caller then opens the SSE stream at /api/command/stream
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'

type Mode = 'plan_only' | 'plan_code' | 'full_build'

interface CommandBody {
  prompt?: unknown
  mode?: unknown
  projectName?: unknown
}

export async function POST(request: Request) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Auth check
  const { user } = await payload.auth({ headers: new Headers(request.headers) })
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
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
      : `Command: ${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`

  if (!prompt) {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  try {
    // 1. Auto-create Project
    const project = await payload.create({
      collection: 'projects',
      data: {
        name: projectName,
        description: `Auto-created from global command interface on ${new Date().toUTCString()}`,
        status: 'active',
        owner: user.id,
        repoUrl: 'https://github.com/Beqakid/codehive-sanbox',
      },
    })

    // 2. Auto-create CodingRequest
    const codingRequest = await payload.create({
      collection: 'coding-requests',
      data: {
        title: projectName,
        description: prompt,
        project: project.id,
        requestedBy: user.id,
        status: 'submitted',
        priority: 'medium',
      },
    })

    // 3. Create Command record
    const command = await payload.create({
      collection: 'commands',
      data: {
        prompt,
        mode,
        status: 'pending',
        project: project.id,
        codingRequest: codingRequest.id,
        submittedBy: user.id,
      },
    })

    // 4. Create Run record
    const run = await payload.create({
      collection: 'runs',
      data: {
        command: command.id,
        status: 'pending',
        mode,
        startedAt: new Date().toISOString(),
      },
    })

    return Response.json({
      commandId: command.id,
      runId: run.id,
      codingRequestId: codingRequest.id,
      projectId: project.id,
    })
  } catch (err) {
    console.error('[/api/command] Error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
