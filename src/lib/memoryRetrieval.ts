/**
 * @module memoryRetrieval
 * @description Milestone 5 — Memory retrieval system.
 * Retrieves relevant project/repo memories before each run.
 * Supports type-filtered queries, relevance ranking, and conflict detection.
 * Future-ready for Vectorize-based semantic search.
 */

import type { Payload } from 'payload'
import type { MemoryType, MemoryEntry } from './memoryStore'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryQuery {
  projectId: string
  repoName?: string
  types?: MemoryType[]
  minConfidence?: number
  limit?: number
  searchText?: string
  tags?: string[]
}

export interface MemoryContext {
  memories: MemoryEntry[]
  projectRules: MemoryEntry[]
  learnedFixes: MemoryEntry[]
  failurePatterns: MemoryEntry[]
  repoFacts: MemoryEntry[]
  totalRetrieved: number
  conflicts: MemoryConflict[]
}

export interface MemoryConflict {
  description: string
  memoryId: string
  conflictsWith: string
  severity: 'info' | 'warning' | 'error'
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve memories
// ─────────────────────────────────────────────────────────────────────────────

export async function retrieveMemories(
  payload: Payload,
  query: MemoryQuery,
): Promise<MemoryContext> {
  const limit = query.limit || 100
  const minConfidence = query.minConfidence || 0.3

  try {
    const whereConditions: Record<string, unknown>[] = [
      { projectId: { equals: query.projectId } },
    ]

    if (query.repoName) {
      whereConditions.push({ repoName: { equals: query.repoName } })
    }

    if (query.types && query.types.length > 0) {
      whereConditions.push({ memoryType: { in: query.types } })
    }

    const results = await payload.find({
      collection: 'repo-memories' as 'users',
      where: { and: whereConditions },
      limit,
      sort: '-createdAt',
      overrideAccess: true,
    })

    const entries: MemoryEntry[] = results.docs.map((doc) => {
      const d = doc as Record<string, unknown>
      return {
        id: String(d.id || doc.id),
        projectId: String(d.projectId || ''),
        repoName: String(d.repoName || ''),
        memoryType: d.memoryType as MemoryType,
        content: String(d.content || ''),
        confidence: Number(d.confidence || 0),
        sourceRunId: String(d.sourceRunId || ''),
        tags: String(d.tags || '').split(',').filter(Boolean),
        createdAt: String(d.createdAt || ''),
        updatedAt: String(d.updatedAt || ''),
      }
    })

    // Filter by confidence
    const filtered = entries.filter((e) => e.confidence >= minConfidence)

    // Filter by search text if provided
    let matched = filtered
    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase()
      matched = filtered.filter((e) =>
        e.content.toLowerCase().includes(searchLower) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(searchLower)),
      )
    }

    // Filter by tags if provided
    if (query.tags && query.tags.length > 0) {
      matched = matched.filter((e) =>
        query.tags!.some((tag) => (e.tags || []).includes(tag)),
      )
    }

    // Categorize
    const projectRules = matched.filter((e) => e.memoryType === 'project_rule')
    const learnedFixes = matched.filter((e) => e.memoryType === 'fix_pattern')
    const failurePatterns = matched.filter(
      (e) => e.memoryType === 'error_pattern' || e.memoryType === 'failed_repair',
    )
    const repoFacts = matched.filter(
      (e) => e.memoryType === 'repo_architecture' || e.memoryType === 'protected_area',
    )

    // Detect conflicts
    const conflicts = detectConflicts(projectRules, matched)

    return {
      memories: matched,
      projectRules,
      learnedFixes,
      failurePatterns,
      repoFacts,
      totalRetrieved: matched.length,
      conflicts,
    }
  } catch (err) {
    console.error('Memory retrieval failed:', err)
    return {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 0,
      conflicts: [],
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve for run context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all relevant memories for a new run.
 * This is injected into Product Agent and Architect Agent prompts.
 */
export async function retrieveRunContext(
  payload: Payload,
  projectId: string,
  repoName: string,
  userRequest: string,
): Promise<MemoryContext> {
  const context = await retrieveMemories(payload, {
    projectId,
    repoName,
    minConfidence: 0.5,
    limit: 50,
  })

  // Boost relevance for memories that match the user request
  const requestWords = userRequest.toLowerCase().split(/\s+/).filter((w) => w.length > 3)

  const boosted = context.memories.map((m) => {
    const contentLower = m.content.toLowerCase()
    const matchCount = requestWords.filter((w) => contentLower.includes(w)).length
    return {
      ...m,
      _relevance: matchCount / Math.max(requestWords.length, 1),
    }
  })

  // Sort by relevance, then confidence
  boosted.sort((a, b) => {
    const relDiff = b._relevance - a._relevance
    if (Math.abs(relDiff) > 0.1) return relDiff
    return b.confidence - a.confidence
  })

  return {
    ...context,
    memories: boosted.slice(0, 30),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve learned fixes for healing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find learned fixes that match a given error signature.
 * Used by the Fix Agent during self-healing.
 */
export async function retrieveLearnedFixes(
  payload: Payload,
  projectId: string,
  errorSignature: string,
  limit: number = 5,
): Promise<MemoryEntry[]> {
  const context = await retrieveMemories(payload, {
    projectId,
    types: ['fix_pattern'],
    minConfidence: 0.6,
    limit: 50,
  })

  // Rank by similarity to the error signature
  const errorLower = errorSignature.toLowerCase()
  const ranked = context.learnedFixes
    .map((fix) => {
      const contentLower = fix.content.toLowerCase()
      // Simple keyword overlap scoring
      const errorWords = errorLower.split(/\s+/).filter((w) => w.length > 3)
      const matchCount = errorWords.filter((w) => contentLower.includes(w)).length
      const score = errorWords.length > 0 ? matchCount / errorWords.length : 0
      return { ...fix, _score: score }
    })
    .filter((fix) => fix._score > 0.1)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)

  return ranked
}

// ─────────────────────────────────────────────────────────────────────────────
// Check request conflicts with project rules
// ─────────────────────────────────────────────────────────────────────────────

export async function checkRequestConflicts(
  payload: Payload,
  projectId: string,
  userRequest: string,
  filesToModify: string[],
): Promise<MemoryConflict[]> {
  const context = await retrieveMemories(payload, {
    projectId,
    types: ['project_rule', 'protected_area', 'user_preference'],
    minConfidence: 0.7,
    limit: 100,
  })

  const conflicts: MemoryConflict[] = []
  const requestLower = userRequest.toLowerCase()
  const filePaths = filesToModify.map((f) => f.toLowerCase())

  for (const rule of context.projectRules) {
    const ruleLower = rule.content.toLowerCase()

    // Check if request might violate a rule
    for (const filePath of filePaths) {
      if (ruleLower.includes(filePath) || ruleLower.includes(filePath.split('/').pop() || '')) {
        conflicts.push({
          description: `Request may conflict with project rule: "${rule.content.substring(0, 100)}"`,
          memoryId: rule.id || '',
          conflictsWith: filePath,
          severity: 'warning',
        })
      }
    }

    // Check "do not touch" / "do not modify" patterns
    if (
      ruleLower.includes('do not') ||
      ruleLower.includes('should not') ||
      ruleLower.includes('never')
    ) {
      const ruleFiles = extractFilePathsFromText(rule.content)
      for (const ruleFile of ruleFiles) {
        if (filePaths.some((fp) => fp.includes(ruleFile.toLowerCase()))) {
          conflicts.push({
            description: `Protected area: "${rule.content.substring(0, 100)}"`,
            memoryId: rule.id || '',
            conflictsWith: ruleFile,
            severity: 'error',
          })
        }
      }
    }
  }

  // Check protected areas
  for (const area of context.repoFacts) {
    if (area.memoryType === 'protected_area') {
      const areaFiles = extractFilePathsFromText(area.content)
      for (const areaFile of areaFiles) {
        if (filePaths.some((fp) => fp.includes(areaFile.toLowerCase()))) {
          conflicts.push({
            description: `Protected area memory: "${area.content.substring(0, 100)}"`,
            memoryId: area.id || '',
            conflictsWith: areaFile,
            severity: 'warning',
          })
        }
      }
    }
  }

  return conflicts
}

// ─────────────────────────────────────────────────────────────────────────────
// Format memories for prompt injection
// ─────────────────────────────────────────────────────────────────────────────

export function formatMemoriesForPrompt(context: MemoryContext): string {
  const sections: string[] = []

  if (context.projectRules.length > 0) {
    sections.push('## Project Rules (MUST follow)')
    for (const rule of context.projectRules) {
      sections.push(`- ${rule.content}`)
    }
    sections.push('')
  }

  if (context.repoFacts.length > 0) {
    sections.push('## Repository Facts')
    for (const fact of context.repoFacts.slice(0, 10)) {
      sections.push(`- ${fact.content.substring(0, 200)}`)
    }
    sections.push('')
  }

  if (context.learnedFixes.length > 0) {
    sections.push('## Learned Fixes (from previous runs)')
    for (const fix of context.learnedFixes.slice(0, 5)) {
      sections.push(`- ${fix.content.substring(0, 200)}`)
    }
    sections.push('')
  }

  if (context.conflicts.length > 0) {
    sections.push('## ⚠️ Conflicts Detected')
    for (const conflict of context.conflicts) {
      sections.push(`- [${conflict.severity.toUpperCase()}] ${conflict.description}`)
    }
    sections.push('')
  }

  return sections.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectConflicts(rules: MemoryEntry[], allMemories: MemoryEntry[]): MemoryConflict[] {
  const conflicts: MemoryConflict[] = []

  // Check for contradicting rules
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i].content.toLowerCase()
      const b = rules[j].content.toLowerCase()

      // Simple contradiction: one says "do" and other says "don't" for same topic
      if (
        (a.includes('do not') && !b.includes('do not') && hasOverlap(a, b)) ||
        (b.includes('do not') && !a.includes('do not') && hasOverlap(a, b))
      ) {
        conflicts.push({
          description: `Potential rule conflict between: "${rules[i].content.substring(0, 60)}" and "${rules[j].content.substring(0, 60)}"`,
          memoryId: rules[i].id || '',
          conflictsWith: rules[j].id || '',
          severity: 'warning',
        })
      }
    }
  }

  return conflicts
}

function hasOverlap(a: string, b: string): boolean {
  const wordsA = a.split(/\s+/).filter((w) => w.length > 4)
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 4))
  const overlap = wordsA.filter((w) => wordsB.has(w)).length
  return overlap >= 3
}

function extractFilePathsFromText(text: string): string[] {
  const patterns = [
    /(?:src\/[^\s,;)]+\.[a-z]+)/gi,
    /(?:[\w.-]+\.(?:ts|tsx|js|jsx|json|yaml|yml|md))/gi,
  ]
  const paths = new Set<string>()
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    for (const m of matches) paths.add(m)
  }
  return Array.from(paths)
}
