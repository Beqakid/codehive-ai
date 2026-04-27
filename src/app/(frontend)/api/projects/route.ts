import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    // Try to get the authenticated user — but don't crash if auth fails
    let userId: number | undefined
    try {
      const { user } = await payload.auth({ headers: req.headers })
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized — please log in first' }, { status: 401 })
      }
      userId = user.id as number
    } catch {
      return NextResponse.json({ error: 'Unauthorized — please log in first' }, { status: 401 })
    }

    let body: { name?: string; description?: string; repoUrl?: string }
    try {
      body = await req.json() as { name?: string; description?: string; repoUrl?: string }
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, description, repoUrl } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    const project = await payload.create({
      collection: 'projects',
      data: {
        name: name.trim(),
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(repoUrl?.trim() ? { repoUrl: repoUrl.trim() } : {}),
        status: 'active',
        owner: userId,
      },
      overrideAccess: false,
      user: { id: userId, collection: 'users' } as any,
    })

    return NextResponse.json({ project: { id: project.id, name: project.name } }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Create project error:', message)
    // Return the actual error message to help debug
    return NextResponse.json(
      { error: `Failed to create project: ${message}` },
      { status: 500 },
    )
  }
}
