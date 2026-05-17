/**
 * POST /api/m5/memory-search
 *
 * Milestone 5 — Searches memories across projects using semantic retrieval.
 * Uses the retrieveMemories function for intelligent memory lookup with
 * optional filters for project, repo, and memory types.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '../../../../../payload.config'
import { retrieveMemories } from '../../../../../lib/memoryRetrieval'

interface SearchRequestBody {
  query: string
  projectId?: string
  repoName?: string
  memoryTypes?: string[]
  limit?: number
}

export async function POST(req: NextRequest) {
  try {
    let body: SearchRequestBody
    try {
      body = (await req.json()) as SearchRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { query, projectId, repoName, memoryTypes, limit } = body

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: query' },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config: configPromise })

    const results = await retrieveMemories(payload, {
      projectId: projectId || '',
      repoName,
      types: memoryTypes as any,
      limit: limit || 20,
      searchText: query.trim(),
    })

    return NextResponse.json({
      query: query.trim(),
      filters: {
        projectId: projectId || null,
        repoName: repoName || null,
        memoryTypes: memoryTypes || null,
      },
      totalResults: results.totalRetrieved,
      results: results.memories,
    })
  } catch (err) {
    console.error('[M5 /api/m5/memory-search] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
