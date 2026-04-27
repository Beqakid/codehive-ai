import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export async function POST(req: NextRequest) {
  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    const { user } = await payload.auth({ headers: req.headers })

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as { name?: string; description?: string; repoUrl?: string }
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
        owner: user.id,
      },
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (err) {
    console.error('Create project error:', err)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
