/**
 * @module memoryStore
 * @description Milestone 5 — Persistent memory storage system.
 * Saves repo/project memories to D1 via Payload CMS.
 * Future-ready for Cloudflare Vectorize integration.
 *
 * Memory types:
 *   - repo_architecture: structural facts about the repo
 *   - protected_area: "do not touch" designations
 *   - run_outcome: results from previous runs
 *   - error_pattern: repeated error signatures
 *   - fix_pattern: fixes that worked
 *   - failed_repair: fix attempts that didn't work
 *   - project_rule: project-specific constraints
 *   - user_preference: user-defined settings
 *   - successful_pattern: code patterns that worked well
 */

import type { Payload } from 'payload'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MemoryType =
  | 'repo_architecture'
  | 'protected_area'
  | 'run_outcome'
  | 'error_pattern'
  | 'fix_pattern'
  | 'failed_repair'
  | 'project_rule'
  | 'user_preference'
  | 'successful_pattern'

export interface MemoryEntry {
  id?: string
  projectId: string
  repoName: string
  memoryType: MemoryType
  content: string
  confidence: number // 0-1
  sourceRunId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface SaveMemoryInput {
  projectId: string
  repoName: string
  memoryType: MemoryType
  content: string
  confidence: number
  sourceRunId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface SaveMemoryResult {
  success: boolean
  memoryId: string | null
  deduplicated: boolean
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Save memory
// ─────────────────────────────────────────────────────────────────────────────

export async function saveMemory(
  payload: Payload,
  input: SaveMemoryInput,
): Promise<SaveMemoryResult> {
  try {
    // Check for duplicates based on content similarity
    const existing = await findSimilarMemory(payload, input.projectId, input.memoryType, input.content)

    if (existing) {
      // Update confidence if new is higher
      if (input.confidence > (existing.confidence || 0)) {
        await payload.update({
          collection: 'repo-memories' as 'users',
          id: existing.id!,
          data: {
            confidence: input.confidence,
            sourceRunId: input.sourceRunId || existing.sourceRunId,
            updatedAt: new Date().toISOString(),
          } as Record<string, unknown>,
          overrideAccess: true,
        })
      }
      return { success: true, memoryId: existing.id!, deduplicated: true }
    }

    // Create new memory
    const result = await payload.create({
      collection: 'repo-memories' as 'users',
      data: {
        projectId: input.projectId,
        repoName: input.repoName,
        memoryType: input.memoryType,
        content: input.content,
        confidence: input.confidence,
        sourceRunId: input.sourceRunId || '',
        tags: input.tags?.join(',') || '',
        metadata: JSON.stringify(input.metadata || {}),
      } as Record<string, unknown>,
      overrideAccess: true,
    })

    return { success: true, memoryId: String(result.id), deduplicated: false }
  } catch (err) {
    return {
      success: false,
      memoryId: null,
      deduplicated: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch save
// ─────────────────────────────────────────────────────────────────────────────

export async function saveMemories(
  payload: Payload,
  inputs: SaveMemoryInput[],
): Promise<SaveMemoryResult[]> {
  const results: SaveMemoryResult[] = []
  for (const input of inputs) {
    results.push(await saveMemory(payload, input))
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Save project rule
// ─────────────────────────────────────────────────────────────────────────────

export async function saveProjectRule(
  payload: Payload,
  projectId: string,
  repoName: string,
  rule: string,
  sourceRunId?: string,
): Promise<SaveMemoryResult> {
  return saveMemory(payload, {
    projectId,
    repoName,
    memoryType: 'project_rule',
    content: rule,
    confidence: 1.0,
    sourceRunId,
    tags: ['rule'],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Save learned fix
// ─────────────────────────────────────────────────────────────────────────────

export async function saveLearnedFix(
  payload: Payload,
  projectId: string,
  repoName: string,
  errorPattern: string,
  fixApplied: string,
  confidence: number,
  sourceRunId: string,
): Promise<SaveMemoryResult> {
  // Save the error pattern
  await saveMemory(payload, {
    projectId,
    repoName,
    memoryType: 'error_pattern',
    content: errorPattern,
    confidence,
    sourceRunId,
    tags: ['error', 'learned'],
  })

  // Save the fix that worked
  return saveMemory(payload, {
    projectId,
    repoName,
    memoryType: 'fix_pattern',
    content: `Error: ${errorPattern}\nFix: ${fixApplied}`,
    confidence,
    sourceRunId,
    tags: ['fix', 'learned'],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Save failure pattern
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFailurePattern(
  payload: Payload,
  projectId: string,
  repoName: string,
  fingerprint: string,
  details: string,
  sourceRunId: string,
): Promise<SaveMemoryResult> {
  return saveMemory(payload, {
    projectId,
    repoName,
    memoryType: 'failed_repair',
    content: `Fingerprint: ${fingerprint}\nDetails: ${details}`,
    confidence: 0.8,
    sourceRunId,
    tags: ['failure', 'fingerprint'],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Save run outcome
// ─────────────────────────────────────────────────────────────────────────────

export async function saveRunOutcome(
  payload: Payload,
  projectId: string,
  repoName: string,
  runId: string,
  outcome: {
    success: boolean
    action: string
    filesChanged: number
    readinessScore: number
    healingAttempts: number
    summary: string
  },
): Promise<SaveMemoryResult> {
  return saveMemory(payload, {
    projectId,
    repoName,
    memoryType: 'run_outcome',
    content: JSON.stringify(outcome),
    confidence: 1.0,
    sourceRunId: runId,
    tags: ['outcome', outcome.success ? 'success' : 'failure'],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity check (simple text-based, future: vector similarity)
// ─────────────────────────────────────────────────────────────────────────────

async function findSimilarMemory(
  payload: Payload,
  projectId: string,
  memoryType: MemoryType,
  content: string,
): Promise<MemoryEntry | null> {
  try {
    const results = await payload.find({
      collection: 'repo-memories' as 'users',
      where: {
        and: [
          { projectId: { equals: projectId } },
          { memoryType: { equals: memoryType } },
        ],
      },
      limit: 50,
      overrideAccess: true,
    })

    // Simple content matching — check first 200 chars
    const contentPrefix = content.substring(0, 200).toLowerCase()
    for (const doc of results.docs) {
      const docContent = String((doc as Record<string, unknown>).content || '').toLowerCase()
      if (docContent.substring(0, 200) === contentPrefix) {
        return {
          id: String(doc.id),
          projectId: String((doc as Record<string, unknown>).projectId || ''),
          repoName: String((doc as Record<string, unknown>).repoName || ''),
          memoryType: (doc as Record<string, unknown>).memoryType as MemoryType,
          content: String((doc as Record<string, unknown>).content || ''),
          confidence: Number((doc as Record<string, unknown>).confidence || 0),
          sourceRunId: String((doc as Record<string, unknown>).sourceRunId || ''),
        }
      }
    }

    return null
  } catch {
    return null
  }
}
