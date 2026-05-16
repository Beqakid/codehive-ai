/**
 * GET  /api/m5/memory/[projectId] — Retrieve all active memories for a project
 * POST /api/m5/memory/[projectId] — Add a new memory entry for a project
 *
 * Milestone 5 — Project memory management.
 * GET supports optional ?type= query param to filter by memoryType.
 * POST creates a new repo-memories entry tied to the project.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../../payload.config'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId parameter' }, { status: 400 })
    }

    const payload = await getPayload({ config: configPromise })

    // Build where clause
    const where: Record<string, unknown> = {
      projectId: { equals: projectId },
      active: { equals: true },
    }

    // Optional memoryType filter
    const { searchParams } = new URL(req.url)
    const memoryType = searchParams.get('type')
    if (memoryType) {
      where.memoryType = { equals: memoryType }
    }

    const memories = await payload.find({
      collection: 'repo-memories' as 'users',
      where,
      sort: '-createdAt',
      limit: 200,
      overrideAccess: true,
    })

    return NextResponse.json({
      projectId,
      totalMemories: memories.totalDocs,
      memories: memories.docs.map((doc: Record<string, unknown>) => ({
        id: doc.id,
        projectId: doc.projectId,
        repoName: doc.repoName,
        memoryType: doc.memoryType,
        content: doc.content,
        confidence: doc.confidence,
        tags: doc.tags,
        active: doc.active,
        sourceRunId: doc.sourceRunId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })),
    })
  } catch (err) {
    console.error('[M5 /api/m5/memory GET] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

interface MemoryRequestBody {
  repoName: string
  memoryType: string
  content: string
  confidence?: number
  tags?: string[]
  sourceRunId?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId parameter' }, { status: 400 })
    }

    let body: MemoryRequestBody
    try {
      body = (await req.json()) as MemoryRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { repoName, memoryType, content, confidence, tags, sourceRunId } = body

    if (!repoName || !memoryType || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: repoName, memoryType, content' },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config: configPromise })

    const memory = await payload.create({
      collection: 'repo-memories' as 'users',
      data: {
        projectId,
        repoName,
        memoryType,
        content,
        confidence: confidence ?? 0.8,
        tags: tags || [],
        active: true,
        sourceRunId: sourceRunId || null,
      } as Record<string, unknown>,
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        memory: {
          id: memory.id,
          projectId,
          repoName,
          memoryType,
          content,
          confidence: confidence ?? 0.8,
          tags: tags || [],
          active: true,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[M5 /api/m5/memory POST] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
